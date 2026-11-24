"""MindBridge v1 wire schemas; no runtime dependency on private planning files."""

from typing import Annotated, Literal

from pydantic import Field

from .base import NonBlank, UTCDateTimeString, WireModel
from .content import PageDoc, SimplificationResult, GlossaryEntry


class ReadingPreferences(WireModel):
    schema_version: Literal[1]
    font_family: Literal['lexend', 'manrope', 'system', 'opendyslexic']
    font_size_px: Annotated[int, Field(ge=16, le=32)]
    line_height: Annotated[float, Field(ge=1.4, le=2.4)]
    letter_spacing_em: Annotated[float, Field(ge=0, le=0.12)]
    word_spacing_em: Annotated[float, Field(ge=0, le=0.3)]
    reading_width_ch: Annotated[int, Field(ge=45, le=80)]
    theme: Literal['cream', 'paper', 'dark']
    speech_rate: Annotated[float, Field(ge=0.6, le=1.4)]
    voice_uri: Annotated[NonBlank, Field(min_length=1, max_length=300)] | None
    highlight_sentence: bool
    auto_scroll: bool


class SavedPage(WireModel):
    schema_version: Literal[1]
    page: PageDoc
    image_key: Annotated[NonBlank, Field(min_length=1, max_length=80, pattern='^[A-Za-z0-9][A-Za-z0-9_-]*$')] | None
    simplifications: Annotated[list[SimplificationResult], Field(min_length=0, max_length=100)]
    definitions: Annotated[list[GlossaryEntry], Field(min_length=0, max_length=100)]
    saved_at: Annotated[UTCDateTimeString, Field(min_length=1, max_length=35)]
