"""B02 Gemini transport. Own one async context per process; never log provider data.

Services supply trusted instructions, JSON-serializable untrusted data, and an
output model. They remain responsible for source/evidence relational checks.
No application AI routes are activated by this adapter.
"""
import asyncio
import json
import math
import logging
import random
import hashlib
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
from uuid import uuid4
from contextlib import asynccontextmanager
from typing import Literal, TypeVar

import httpx
from google import genai
from google.genai import errors, types
from pydantic import BaseModel, ValidationError

from app.config import Settings

Output = TypeVar('Output', bound=BaseModel)
Operation = Literal['read', 'simplify', 'prepare', 'check', 'define', 'explain']


class AIError(Exception):
    """Safe fields for the existing error_response envelope; no raw exception."""

    def __init__(self, code, status, message, *, retryable=False, retry_after_seconds=None):
        super().__init__(message)
        self.code = code
        self.status = status
        self.message = message
        self.retryable = retryable
        self.retry_after_seconds = retry_after_seconds


def _invalid():
    return AIError('AI_INVALID_RESPONSE', 502, 'The AI response could not be validated. Please retry.', retryable=True)


def _timeout():
    return AIError('AI_TIMEOUT', 504, 'The AI request timed out. Please retry.', retryable=True)


def _unavailable():
    return AIError('AI_UNAVAILABLE', 503, 'The AI service or configured model is unavailable.', retryable=True)


# Inherits Uvicorn's configured handler; only explicitly constructed metadata.
logger = logging.getLogger('uvicorn.error.mindbridge')


def _retry_after(exc):
    delays = []
    body = exc.details.get('error', exc.details) if isinstance(exc.details, dict) else {}
    for detail in body.get('details', []) or []:
        if isinstance(detail, dict) and str(detail.get('@type', '')).endswith('RetryInfo'):
            try:
                value = float(str(detail.get('retryDelay', '')).removesuffix('s'))
                if math.isfinite(value) and value >= 0:
                    delays.append(math.ceil(value))
            except ValueError:
                pass
    if exc.response is not None:
        raw = exc.response.headers.get('Retry-After', '').strip()
        try:
            value = int(raw) if raw.isdigit() else math.ceil(
                (parsedate_to_datetime(raw) - datetime.now(timezone.utc)).total_seconds())
            delays.append(max(0, value))
        except (ValueError, TypeError, OverflowError):
            pass
    return max(delays) if delays else None


def _public_delay(exc):
    delay = _retry_after(exc)
    return delay if delay is not None and 1 <= delay <= 86400 else None


def _category(exc):
    return {400: 'configuration', 401: 'authentication', 403: 'permission',
            404: 'model_not_found', 408: 'upstream_timeout', 422: 'configuration',
            429: 'quota_or_rate', 500: 'upstream_internal', 502: 'upstream_gateway',
            503: 'upstream_unavailable', 504: 'upstream_timeout'}.get(exc.code, 'upstream_other')


def _backoff(attempt):
    # Match the SDK's 1s initial exponential delay + up to 1s jitter,
    # while retaining our stricter two-total-attempt budget.
    return min(8.0, 2.0 ** attempt + random.uniform(0, 1))


def _provider_error(exc):
    if exc.code == 429:
        # Do not infer quota reset times from prose. Daily/zero/unknown quota
        # failures never auto-retry; only explicit short-term rate limits do.
        details = exc.details.get('error', {}).get('details', []) if isinstance(exc.details, dict) else []
        quota_ids = []
        delay = _public_delay(exc)
        for detail in details:
            if not isinstance(detail, dict):
                continue
            if detail.get('@type', '').endswith('QuotaFailure'):
                quota_ids.extend(str(v.get('quotaId', '')) for v in detail.get('violations', []) if isinstance(v, dict))
        exhausted = not quota_ids or any(not any(unit in q.lower() for unit in ('perminute', 'persecond')) for q in quota_ids)
        # An explicit zero limit is not replenished by a short wait.
        if 'limit: 0' in (exc.message or '').lower():
            exhausted = True
        code = 'AI_QUOTA_EXHAUSTED' if exhausted else 'RATE_LIMITED'
        return AIError(code, 429, 'AI quota is unavailable. Try later.' if exhausted else 'The AI rate limit was reached. Try later.',
                       retryable=True, retry_after_seconds=delay)
    if exc.code in (400, 422) and exc.status == 'FAILED_PRECONDITION':
        return AIError('AI_UNAVAILABLE', 503, 'The AI service configuration is unavailable.', retryable=False)
    if exc.code in (400, 422):
        return AIError('AI_INVALID_RESPONSE', 502, 'The AI request configuration was rejected.')
    if exc.code in (408, 504):
        return AIError('AI_TIMEOUT', 504, 'The AI request timed out. Please retry.',
                       retryable=True, retry_after_seconds=_public_delay(exc))
    return AIError('AI_UNAVAILABLE', 503, 'The AI service or configured model is unavailable.',
                   retryable=exc.code in (500, 502, 503, 504), retry_after_seconds=_public_delay(exc))


class GeminiAdapter:
    def __init__(self, settings: Settings, *, client=None):
        self.settings = settings
        self._owner = None
        self._closed = False
        self._slots = asyncio.Semaphore(settings.max_concurrent_ai_calls)
        if client is not None:
            self._client = client
        elif settings.gemini_api_key and settings.gemini_api_key.get_secret_value().strip():
            self._owner = genai.Client(
                api_key=settings.gemini_api_key.get_secret_value(), vertexai=False,
                http_options=types.HttpOptions(retry_options=types.HttpRetryOptions(attempts=1)),
            )
            self._client = self._owner.aio
        else:
            self._client = None

    async def aclose(self):
        if not self._closed:
            self._closed = True
            if self._client is not None:
                await self._client.aclose()
            if self._owner is not None:
                self._owner.close()

    async def __aenter__(self):
        return self

    async def __aexit__(self, *args):
        await self.aclose()

    async def generate(self, *, operation: Operation, system_instruction: str,
                       data: dict, output_model: type[Output] | None = None,
                       image: bytes | None = None, mime_type: str | None = None) -> Output | str:
        settings = self.settings
        budgets = {'read': settings.read_max_output_tokens, 'simplify': settings.simplify_max_output_tokens,
                   'prepare': settings.learning_max_output_tokens, 'check': settings.learning_max_output_tokens,
                   'define': settings.explanation_max_output_tokens, 'explain': settings.explanation_max_output_tokens}
        if operation not in budgets:
            raise ValueError('Unknown AI operation.')
        if image is not None and (not image or mime_type not in ('image/png', 'image/jpeg', 'image/webp')):
            raise ValueError('Inline image requires nonempty bytes and an approved MIME type.')
        if self._closed or self._client is None:
            raise _unavailable() from None
        encoded = json.dumps(data, ensure_ascii=False, allow_nan=False)
        schema = output_model.model_json_schema() if output_model else None
        schema_bytes = json.dumps(schema, sort_keys=True).encode()
        call_id = str(uuid4())
        parts = [types.Part.from_text(text=encoded)]
        if image is not None:
            parts.append(types.Part.from_bytes(data=image, mime_type=mime_type))
        total = settings.read_deadline_seconds if operation == 'read' else settings.text_deadline_seconds
        ceiling = settings.read_call_timeout_seconds if operation == 'read' else settings.text_call_timeout_seconds
        loop = asyncio.get_running_loop()
        deadline = loop.time() + total
        try:
            async with asyncio.timeout_at(deadline):
                async with self._slots:
                    for attempt in range(settings.max_provider_attempts):
                        remaining = deadline - loop.time()
                        if remaining <= 0:
                            raise _timeout()
                        timeout = min(ceiling, remaining)
                        config = types.GenerateContentConfig(
                            system_instruction=system_instruction,
                            max_output_tokens=budgets[operation], candidate_count=1,
                            response_mime_type='application/json' if output_model else 'text/plain',
                            response_json_schema=schema,
                            automatic_function_calling=types.AutomaticFunctionCallingConfig(disable=True),
                            automatic_continuation=False,
                            # Explicit low-latency reading settings on these
                            # models; omit it for arbitrary configured models.
                            thinking_config=(types.ThinkingConfig(thinking_level='MINIMAL')
                                             if operation in ('read', 'simplify', 'prepare') and settings.gemini_model.removeprefix('models/')
                                             in ('gemini-3.5-flash-lite', 'gemini-3.1-flash-lite') else None),
                            http_options=types.HttpOptions(timeout=max(1, int(timeout * 1000)),
                                                          retry_options=types.HttpRetryOptions(attempts=1)),
                        )
                        wait = 0
                        started = loop.time()
                        row = dict(call_id=call_id, operation=operation, attempt=attempt + 1,
                                   input_bytes=len(encoded.encode()), image_bytes=len(image or b''),
                                   schema_bytes=len(schema_bytes), schema_hash=hashlib.sha256(schema_bytes).hexdigest()[:12],
                                   max_output_tokens=budgets[operation])
                        try:
                            async with asyncio.timeout(timeout):
                                response = await self._client.models.generate_content(
                                    model=settings.gemini_model,
                                    contents=[types.Content(role='user', parts=parts)], config=config)
                            row["output_truncated"] = any(c.finish_reason == "MAX_TOKENS" for c in response.candidates or [])
                            usage = response.usage_metadata
                            row.update(output_tokens=usage.candidates_token_count if usage else None,
                                       thinking_tokens=usage.thoughts_token_count if usage else None)
                            result = self._validate(response, output_model)
                            row.update(category='success', seconds=round(loop.time() - started, 3))
                            logger.info('gemini_attempt %s', json.dumps(row))
                            return result
                        except (TimeoutError, httpx.TimeoutException):
                            failure = _timeout()
                            row["category"] = "timeout"
                            retry = True
                        except errors.APIError as exc:
                            failure = _provider_error(exc)
                            msg = (exc.message or '').lower()
                            row.update(category=_category(exc), upstream_http=exc.code,
                                       upstream_status=exc.status if exc.status in {
                                           'UNAVAILABLE', 'INTERNAL', 'RESOURCE_EXHAUSTED', 'INVALID_ARGUMENT',
                                           'FAILED_PRECONDITION', 'UNAUTHENTICATED', 'PERMISSION_DENIED',
                                           'NOT_FOUND', 'DEADLINE_EXCEEDED'} else 'OTHER',
                                       overload_reported=any(x in msg for x in ('overload', 'high demand', 'capacity')),
                                       schema_complexity_reported=any(x in msg for x in ('too many states', 'too complex', 'complexity', 'nesting depth')))
                            wait = _retry_after(exc) or 0
                            retry = exc.code in (408, 500, 502, 503, 504)
                            if failure.code == 'RATE_LIMITED' and failure.retry_after_seconds:
                                retry = True
                                wait = failure.retry_after_seconds
                        except httpx.TransportError:
                            failure, retry = _unavailable(), True
                            row["category"] = "transport"
                        except AIError as exc:
                            failure = exc
                            row["category"] = "local_" + exc.code.lower()
                            retry = exc.code == 'AI_INVALID_RESPONSE'
                        wait = max(wait, _backoff(attempt))
                        # Require room for a full call ceiling after backoff; do
                        # not spend quota on a retry with only milliseconds left.
                        retry = (retry and attempt + 1 < settings.max_provider_attempts
                                 and deadline - loop.time() >= wait + ceiling)
                        row.update(seconds=round(loop.time() - started, 3), public_code=failure.code,
                                   retry_scheduled=retry, retry_delay=round(wait, 3) if retry else None,
                                   retry_after_seconds=failure.retry_after_seconds)
                        logger.warning('gemini_attempt %s', json.dumps(row))
                        if not retry:
                            raise failure from None
                        await asyncio.sleep(wait)
        except TimeoutError:
            raise _timeout() from None

    @staticmethod
    def _validate(response, output_model):
        blocked = response.prompt_feedback and response.prompt_feedback.block_reason
        candidates = response.candidates or []
        refusals = {'SAFETY', 'RECITATION', 'BLOCKLIST', 'PROHIBITED_CONTENT', 'SPII', 'IMAGE_SAFETY'}
        if blocked or any(c.finish_reason in refusals for c in candidates):
            raise AIError('CONTENT_UNSUPPORTED', 422, 'The AI service could not process this content.')
        if len(candidates) != 1 or candidates[0].finish_reason != 'STOP':
            raise _invalid()
        content = candidates[0].content
        if content is None or not content.parts:
            raise _invalid()
        text = ''.join(p.text for p in content.parts if p.text and not p.thought)
        if not text.strip() or any(p.function_call for p in content.parts):
            raise _invalid()
        if output_model is None:
            return text
        try:
            return output_model.model_validate_json(text)
        except (ValidationError, ValueError):
            raise _invalid() from None


@asynccontextmanager
async def gemini_lifespan(app):
    """Future AI routes can pass this lifespan to FastAPI; health stays offline."""
    from .providers import create_provider
    async with create_provider(app.state.settings) as adapter:
        app.state.gemini = adapter
        try:
            yield
        finally:
            del app.state.gemini
