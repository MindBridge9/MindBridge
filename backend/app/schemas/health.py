"""MindBridge v1 wire schemas; no runtime dependency on private planning files."""

from .content import ReadingLevel

from typing import Annotated, Literal

from pydantic import Field

from .base import WireModel


class HealthResponseCapabilities(WireModel):
    read: bool
    simplify: bool
    define: bool
    explain: bool
    prepare_understanding: bool
    check_understanding: bool


class HealthResponseLimits(WireModel):
    max_image_bytes: Literal[8388608]
    max_source_chars: Literal[12000]
    max_answer_chars: Literal[2000]


class HealthResponse(WireModel):
    status: Literal['ok']
    service: Literal['mindbridge-api']
    api_version: Literal['1.0']
    capabilities: HealthResponseCapabilities
    reading_levels: Annotated[list[ReadingLevel], Field(min_length=1, max_length=3)]
    explanation_languages: Annotated[list[Literal['en']], Field(min_length=1, max_length=1)]
    limits: HealthResponseLimits
