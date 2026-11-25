"""Small structural interface and explicit provider selection; no failover."""
from typing import Protocol
from .client import Operation, Output


class AIProvider(Protocol):
    async def generate(self, *, operation: Operation, system_instruction: str,
                       data: dict, output_model: type[Output] | None = None,
                       image: bytes | None = None, mime_type: str | None = None) -> Output | str: ...
    async def aclose(self) -> None: ...


def create_provider(settings) -> AIProvider:
    if settings.ai_provider == 'groq':
        from .groq import GroqAdapter
        return GroqAdapter(settings)
    from .client import GeminiAdapter
    return GeminiAdapter(settings)
