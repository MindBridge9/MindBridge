"""MindBridge v1 wire schemas; no runtime dependency on private planning files."""

from typing import Annotated, Literal

from pydantic import ConfigDict, Field

from .base import NonBlank, UTCDateTimeString, UUIDString, WireModel, omit_default


ReadingLevel = Literal['original', 'easy', 'guided']


class TextChunk(WireModel):
    model_config = ConfigDict(frozen=True)
    id: Annotated[NonBlank, Field(min_length=1, max_length=5, pattern='^c[0-9]{4}$')]
    kind: Literal['heading', 'paragraph', 'list_item', 'caption']
    text: Annotated[NonBlank, Field(min_length=1, max_length=3000)]
    quality: Literal['clear', 'uncertain']


class SourceReference(WireModel):
    chunk_id: Annotated[NonBlank, Field(min_length=1, max_length=5, pattern='^c[0-9]{4}$')]
    quote: Annotated[NonBlank, Field(min_length=1, max_length=3000)]


class KeyTerm(WireModel):
    term: Annotated[NonBlank, Field(min_length=1, max_length=120)]
    chunk_ids: Annotated[list[Annotated[NonBlank, Field(min_length=1, max_length=5, pattern='^c[0-9]{4}$')]], Field(min_length=1, max_length=100)]


class SourceContext(WireModel):
    page_id: Annotated[UUIDString, Field(min_length=1, max_length=36)]
    chunks: Annotated[list[TextChunk], Field(min_length=1, max_length=12)]
    key_terms: Annotated[list[KeyTerm], Field(min_length=0, max_length=24)]
    key_terms_status: Literal['available', 'unavailable']


class GeneratedText(WireModel):
    text: Annotated[NonBlank, Field(min_length=1, max_length=1500)]
    source_refs: Annotated[list[SourceReference], Field(min_length=1, max_length=12)]


class PageSummary(WireModel):
    text: Annotated[NonBlank, Field(min_length=1, max_length=800)]
    source_refs: Annotated[list[SourceReference], Field(min_length=1, max_length=12)]


class ExtractionWarning(WireModel):
    code: Literal['uncertain_text', 'reading_order', 'unsupported_region']
    message: Annotated[NonBlank, Field(min_length=1, max_length=400)]
    chunk_ids: Annotated[list[Annotated[NonBlank, Field(min_length=1, max_length=5, pattern='^c[0-9]{4}$')]], Field(min_length=0, max_length=100)]


class GlossaryEntry(WireModel):
    phrase: Annotated[NonBlank, Field(min_length=1, max_length=120)]
    language: Literal['en']
    definition: Annotated[NonBlank, Field(min_length=1, max_length=500)]
    contextual_meaning: Annotated[NonBlank, Field(min_length=1, max_length=500)]
    example: Annotated[NonBlank, Field(min_length=1, max_length=300)] | None
    source_refs: Annotated[list[SourceReference], Field(min_length=1, max_length=12)]


class PageDoc(WireModel):
    schema_version: Literal['1.0']
    id: Annotated[UUIDString, Field(min_length=1, max_length=36)]
    created_at: Annotated[UTCDateTimeString, Field(min_length=1, max_length=35)]
    language: Literal['en']
    title: Annotated[NonBlank, Field(min_length=1, max_length=160)]
    title_origin: Literal['source', 'generated']
    chunks: Annotated[list[TextChunk], Field(min_length=1, max_length=100)]
    extraction_warnings: Annotated[list[ExtractionWarning], Field(min_length=0, max_length=30)]
    summary: PageSummary | None
    key_terms: Annotated[list[KeyTerm], Field(min_length=0, max_length=24)]
    key_terms_status: Literal['available', 'unavailable']
    glossary: Annotated[list[GlossaryEntry], Field(min_length=0, max_length=8)]
    enrichment_status: Literal['complete', 'partial', 'unavailable']


class ReadResult(WireModel):
    readability: Literal['readable', 'partial', 'unreadable']
    retake_reasons: Annotated[list[Literal['blur', 'glare', 'low_light', 'cropped_text', 'small_text', 'no_printed_text', 'unsupported_layout', 'unsupported_language']], Field(min_length=0, max_length=8)]
    page: PageDoc | None


class OmissionWarning(WireModel):
    code: Literal['missing_number', 'changed_number', 'missing_unit', 'missing_date', 'missing_name', 'missing_term', 'missing_key_detail']
    chunk_id: Annotated[NonBlank, Field(min_length=1, max_length=5, pattern='^c[0-9]{4}$')]
    source_value: Annotated[NonBlank, Field(min_length=1, max_length=160)]
    generated_value: Annotated[NonBlank, Field(min_length=1, max_length=160)] | None
    message: Annotated[NonBlank, Field(min_length=1, max_length=400)]


class SimplifiedChunk(WireModel):
    chunk_id: Annotated[NonBlank, Field(min_length=1, max_length=5, pattern='^c[0-9]{4}$')]
    text: Annotated[NonBlank, Field(min_length=1, max_length=4500)]
    source_refs: Annotated[list[SourceReference], Field(min_length=1, max_length=12)]
    preserved_terms: Annotated[list[Annotated[NonBlank, Field(min_length=1, max_length=120)]], Field(min_length=0, max_length=24)]
    warnings: Annotated[list[OmissionWarning], Field(min_length=0, max_length=30)]
    terminology_check_status: Literal['checked', 'unavailable']


class SimplificationResult(WireModel):
    page_id: Annotated[UUIDString, Field(min_length=1, max_length=36)]
    level: Literal['easy', 'guided']
    items: Annotated[list[SimplifiedChunk], Field(min_length=1, max_length=3)]


class ConceptExplanation(WireModel):
    page_id: Annotated[UUIDString, Field(min_length=1, max_length=36)]
    concept: Annotated[NonBlank, Field(min_length=1, max_length=160)]
    language: Literal['en']
    text: Annotated[NonBlank, Field(min_length=1, max_length=1500)]
    important_terms: Annotated[list[Annotated[NonBlank, Field(min_length=1, max_length=120)]], Field(min_length=0, max_length=12)]
    source_refs: Annotated[list[SourceReference], Field(min_length=1, max_length=12)]


class SimplifyRequest(WireModel):
    source: SourceContext
    chunk_ids: Annotated[list[Annotated[NonBlank, Field(min_length=1, max_length=5, pattern='^c[0-9]{4}$')]], Field(min_length=1, max_length=3)]
    level: Literal['easy', 'guided']


class DefineRequest(WireModel):
    source: SourceContext
    chunk_id: Annotated[NonBlank, Field(min_length=1, max_length=5, pattern='^c[0-9]{4}$')]
    phrase: Annotated[NonBlank, Field(min_length=1, max_length=120)]
    surrounding_sentence: Annotated[NonBlank, Field(min_length=1, max_length=1000)]
    language: Literal['en'] = 'en'


class ExplainRequest(WireModel):
    source: SourceContext
    chunk_id: Annotated[NonBlank, Field(min_length=1, max_length=5, pattern='^c[0-9]{4}$')]
    concept: Annotated[NonBlank, Field(min_length=1, max_length=160)]
    language: Literal['en'] = 'en'


class PrepareRequest(WireModel):
    source: SourceContext
    chunk_id: Annotated[NonBlank, Field(min_length=1, max_length=5, pattern='^c[0-9]{4}$')]
    target_concept: Annotated[NonBlank, Field(min_length=1, max_length=160)] = Field(default=None, exclude_if=lambda value: value is None, json_schema_extra=omit_default)


class ImageUpload(WireModel):
    image: bytes
