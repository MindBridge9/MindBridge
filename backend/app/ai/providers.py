"""Small structural interface and explicit provider selection and opt-in bounded failover."""
from typing import Protocol
from .client import Operation, Output


class AIProvider(Protocol):
    async def generate(self, *, operation: Operation, system_instruction: str,
                       data: dict, output_model: type[Output] | None = None,
                       image: bytes | None = None, mime_type: str | None = None) -> Output | str: ...
    async def aclose(self) -> None: ...


class DisabledProvider:
    async def __aenter__(self): return self
    async def __aexit__(self, *args): await self.aclose()
    async def aclose(self): pass
    async def generate(self, **kwargs):
        from .client import AIError
        raise AIError('FEATURE_UNAVAILABLE', 501, 'AI operations are temporarily disabled.')


def create_provider(settings) -> AIProvider:
    if not settings.ai_enabled:
        return DisabledProvider()
    if settings.ai_provider == 'groq':
        from .groq import GroqAdapter
        primary = GroqAdapter(settings)
        if settings.ai_fallback_enabled:
            from .client import GeminiAdapter
            from .fallback import FallbackAdapter
            return FallbackAdapter(settings, primary, GeminiAdapter(settings))
        return primary
    from .client import GeminiAdapter
    return GeminiAdapter(settings)
