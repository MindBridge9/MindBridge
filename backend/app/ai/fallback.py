"""Explicit Groq -> Gemini fallback only; disabled by default. No provider framework."""
import asyncio
from .attempts import AttemptBudget, active_budget
from .client import AIError, _backoff, _timeout, _unavailable, logger


class FallbackAdapter:
    # Both adapters must receive the trusted enrichment shape. Gemini's provider
    # grammar is intentionally reduced; local Pydantic validation remains shared.
    typed_ocr_schema = False

    def __init__(self, settings, primary, secondary):
        self.settings = settings
        self.primary = primary
        self.secondary = secondary
        self._closed = False
        self._slots = asyncio.Semaphore(settings.max_concurrent_ai_calls)

    async def __aenter__(self): return self

    async def __aexit__(self, *args): await self.aclose()

    async def aclose(self):
        if not self._closed:
            self._closed = True
            results = await asyncio.gather(self.primary.aclose(), self.secondary.aclose(), return_exceptions=True)
            if any(isinstance(r, BaseException) for r in results):
                logger.warning('provider_cleanup_failed')

    async def generate(self, **kwargs):
        if self._closed: raise _unavailable()
        operation = kwargs['operation']
        loop = asyncio.get_running_loop()
        total = self.settings.read_deadline_seconds if operation == 'read' else self.settings.text_deadline_seconds
        ceiling = self.settings.read_call_timeout_seconds if operation == 'read' else self.settings.text_call_timeout_seconds
        budget = AttemptBudget(loop.time() + total, self.settings.max_provider_attempts)
        token = active_budget.set(budget)
        provider = self.primary
        try:
            async with asyncio.timeout_at(budget.deadline):
                async with self._slots:
                    for attempt in range(self.settings.max_provider_attempts):
                        try:
                            return await provider.generate(**kwargs)
                        except AIError as failure:
                            # Rate limits/quota never switch provider. A known
                            # short rate limit may retry primary within its hint.
                            retry = failure.retryable and (failure.fallback_eligible or
                                failure.code == 'AI_INVALID_RESPONSE' or
                                (failure.code == 'RATE_LIMITED' and failure.retry_after_seconds is not None))
                            wait = max(_backoff(attempt), failure.provider_retry_after_seconds or 0)
                            if (not retry or budget.remaining <= 0 or attempt + 1 >= self.settings.max_provider_attempts
                                    or budget.deadline - loop.time() < wait + ceiling):
                                raise failure from None
                            if failure.fallback_eligible:
                                provider = self.secondary
                            logger.info('provider_recovery target=%s attempt=%d delay_seconds=%.3f category=%s',
                                        'gemini' if provider is self.secondary else 'groq', attempt + 2, wait, failure.code)
                        # Python clears the caught exception after its handler.
                        await asyncio.sleep(wait)
        except TimeoutError:
            raise _timeout() from None
        finally:
            active_budget.reset(token)
