"""OCR core validation and deterministic source mapping, separate from enrichment."""
import re
import json
from datetime import datetime, timezone
from typing import Annotated, Literal
from uuid import uuid4

from pydantic import Field, SkipValidation, TypeAdapter, ValidationError, model_validator

from app.ai.client import AIError
from app.ai.prompts import OCR_SYSTEM, OCR_VERSION
from app.config import Settings
from app.schemas.base import WireModel
from app.schemas.content import (ExtractionWarning, GlossaryEntry, KeyTerm, PageDoc,
                                 PageSummary, ReadResult, SourceReference, TextChunk)
from app.validation.images import CleanImage

Index = Annotated[int, Field(ge=1, le=100)]
Indexes = Annotated[list[Index], Field(min_length=1, max_length=100)]


class Block(WireModel):
    block_index: Index
    kind: Literal['heading', 'paragraph', 'list_item', 'caption']
    text: str = Field(min_length=1, max_length=30000)
    quality: Literal['clear', 'uncertain']


class ProviderRef(WireModel):
    block_index: Index
    quote: str = Field(min_length=1, max_length=3000)


class ProviderSummary(WireModel):
    text: str = Field(min_length=1, max_length=800)
    source_refs: list[ProviderRef] = Field(min_length=1, max_length=12)


class ProviderTerm(WireModel):
    term: str = Field(min_length=1, max_length=120)
    block_indexes: Indexes


class ProviderGlossary(WireModel):
    phrase: str = Field(min_length=1, max_length=120)
    language: Literal['en']
    definition: str = Field(min_length=1, max_length=500)
    contextual_meaning: str = Field(min_length=1, max_length=500)
    example: str | None = Field(max_length=300)
    source_refs: list[ProviderRef] = Field(min_length=1, max_length=12)


class ProviderEnrichment(WireModel):
    summary: ProviderSummary | None
    key_terms: list[ProviderTerm] | None = Field(max_length=24)
    glossary: list[ProviderGlossary] | None = Field(max_length=8)


class ProviderWarning(WireModel):
    code: Literal['uncertain_text', 'reading_order', 'unsupported_region']
    message: str = Field(min_length=1, max_length=400)
    block_indexes: list[Index] = Field(max_length=100)


class OCRResponse(WireModel):
    readability: Literal['readable', 'partial', 'unreadable']
    retake_reasons: ReadResult.model_fields['retake_reasons'].annotation = Field(max_length=8)
    blocks: list[Block] = Field(max_length=100)
    warnings: list[ProviderWarning] = Field(max_length=30)
    # Validate optional enrichment independently after accepting OCR. Its nested
    # grammar is deliberately excluded from provider constrained decoding.
    enrichment: SkipValidation[ProviderEnrichment | None] = None

    @classmethod
    def model_json_schema(cls, *args, **kwargs):
        # Measured: bounds caused 400; the remaining nested optional enrichment
        # grammar caused repeatable 503s on both tested Flash-Lite models.
        # Constrain the extraction core, validate all enrichment parts locally.
        # This is an internal generation schema, never the public API schema.
        schema = super().model_json_schema(*args, **kwargs)

        def simplify(node):
            if isinstance(node, dict):
                return {key: simplify(value) for key, value in node.items()
                        if key not in ('minItems', 'maxItems', 'minimum', 'maximum',
                                       'minLength', 'maxLength', 'default', 'title')}
            if isinstance(node, list):
                return [simplify(value) for value in node]
            return node

        schema = simplify(schema)
        schema['properties']['enrichment'] = {
            'type': ['object', 'null'], 'additionalProperties': True,
        }
        definitions = schema.get('$defs', {})
        used = set()

        def references(node):
            if isinstance(node, dict):
                if '$ref' in node:
                    name = node['$ref'].split('/')[-1]
                    if name not in used:
                        used.add(name)
                        references(definitions[name])
                for value in node.values():
                    references(value)
            elif isinstance(node, list):
                for value in node:
                    references(value)

        references(schema['properties'])
        schema['$defs'] = {name: definition for name, definition in definitions.items() if name in used}
        return schema

    @model_validator(mode='after')
    def core_invariants(self):
        if [b.block_index for b in self.blocks] != list(range(1, len(self.blocks) + 1)):
            raise ValueError('Block indexes must follow reading order without duplicates.')
        ids = {b.block_index for b in self.blocks}
        if any(not set(w.block_indexes) <= ids or len(w.block_indexes) != len(set(w.block_indexes))
               for w in self.warnings):
            raise ValueError('Warning refers to an unknown or repeated block.')
        if len(self.retake_reasons) != len(set(self.retake_reasons)):
            raise ValueError('Retake reasons must be unique.')
        if self.readability == 'unreadable' and not self.retake_reasons:
            raise ValueError('Unreadable results require retake guidance.')
        if self.readability == 'partial' and not (self.warnings or self.retake_reasons or any(b.quality == 'uncertain' for b in self.blocks)):
            raise ValueError('Partial results require uncertainty or retake guidance.')
        if sum(len(b.text) for b in self.blocks) > Settings.max_page_chars:
            raise AIError('CONTENT_UNSUPPORTED', 422, 'The page contains too much text. Photograph a smaller section.')
        # Validate deterministic splitting inside adapter validation so core
        # problems share its two-attempt budget instead of starting another call.
        chunks, _ = map_chunks(self.blocks)
        if self.readability == 'unreadable' and any(c.quality == 'clear' and c.kind != 'heading' for c in chunks):
            raise ValueError('Unreadable output must not contain usable clear text.')
        return self


def split_original(text: str) -> list[str]:
    """Split at sentence boundaries, retaining every original character."""
    parts = []
    while len(text) > 3000:
        boundaries = [m.end() for m in re.finditer(r'(?<=[.!?])\s+', text[:3001])
                      if m.end() <= 3000 and text[m.end():].strip()]
        if not boundaries:
            raise AIError('CONTENT_UNSUPPORTED', 422, 'A source block is too long to preserve. Photograph a smaller section.')
        cut = boundaries[-1]
        parts.append(text[:cut])
        text = text[cut:]
    parts.append(text)
    return parts


def map_chunks(blocks: list[Block]):
    chunks, mapping = [], {}
    for block in blocks:
        mapped = []
        for text in split_original(block.text):
            if len(chunks) >= 100:
                raise AIError('CONTENT_UNSUPPORTED', 422, 'The page needs too many source chunks. Photograph a smaller section.')
            chunk = TextChunk(id=f'c{len(chunks)+1:04d}', kind=block.kind, text=text, quality=block.quality)
            chunks.append(chunk)
            mapped.append(chunk)
        mapping[block.block_index] = mapped
    return chunks, mapping


def _contains(phrase, text):
    return re.search(r'(?<!\w)' + re.escape(phrase.casefold()) + r'(?!\w)', text.casefold()) is not None


def _source_refs(refs: list[ProviderRef], mapping) -> list[SourceReference]:
    result = []
    for ref in refs:
        chunks = mapping.get(ref.block_index, [])
        original = ''.join(c.text for c in chunks)
        start = original.find(ref.quote)
        if not chunks or any(c.quality != 'clear' for c in chunks) or start < 0:
            raise ValueError('Invalid source reference.')
        end, offset = start + len(ref.quote), 0
        for chunk in chunks:
            left, right = max(start, offset), min(end, offset + len(chunk.text))
            if left < right:
                quote = chunk.text[left-offset:right-offset]
                if quote.strip():
                    result.append(SourceReference(chunk_id=chunk.id, quote=quote))
            offset += len(chunk.text)
    if not 1 <= len(result) <= 12 or len({(r.chunk_id, r.quote) for r in result}) != len(result):
        raise ValueError('Invalid source reference count.')
    return result


def _enrichment(raw, mapping):
    if not isinstance(raw, dict):
        raw = {}
    summary, terms, glossary = None, [], []
    terms_ok = glossary_ok = False
    try:
        parsed = ProviderSummary.model_validate(raw.get('summary'))
        summary = PageSummary(text=parsed.text, source_refs=_source_refs(parsed.source_refs, mapping))
    except (ValidationError, ValueError):
        pass
    try:
        parsed_terms = TypeAdapter(Annotated[list[ProviderTerm], Field(max_length=24)]).validate_python(raw.get('key_terms'), strict=True)
        seen = set()
        for term in parsed_terms:
            if term.term.casefold() in seen or len(term.block_indexes) != len(set(term.block_indexes)):
                raise ValueError('Duplicate term or reference.')
            seen.add(term.term.casefold())
            chunk_ids = []
            for index in term.block_indexes:
                selected = mapping.get(index, [])
                if not selected or any(c.quality != 'clear' for c in selected):
                    raise ValueError('Invalid term reference.')
                matches = [c.id for c in selected if _contains(term.term, c.text)]
                if not matches:
                    raise ValueError('Term absent from source.')
                chunk_ids.extend(matches)
            terms.append(KeyTerm(term=term.term, chunk_ids=chunk_ids))
        terms_ok = True
    except (ValidationError, ValueError):
        terms = []
    entries = raw.get('glossary')
    if isinstance(entries, list) and len(entries) <= 8:
        glossary_ok, seen = True, set()
        for entry in entries:
            try:
                parsed = ProviderGlossary.model_validate(entry)
                refs = _source_refs(parsed.source_refs, mapping)
                by_id = {c.id: c for chunks in mapping.values() for c in chunks}
                if parsed.phrase.casefold() in seen or not any(_contains(parsed.phrase, by_id[r.chunk_id].text) for r in refs):
                    raise ValueError('Glossary phrase absent or duplicated.')
                glossary.append(GlossaryEntry(**parsed.model_dump(exclude={'source_refs'}), source_refs=refs))
                seen.add(parsed.phrase.casefold())
            except (ValidationError, ValueError):
                glossary_ok = False
    status = ('complete' if summary is not None and terms_ok and glossary_ok else
              'partial' if summary is not None or terms_ok or glossary else 'unavailable')
    return summary, terms, 'available' if terms_ok else 'unavailable', glossary, status


def build_result(core: OCRResponse) -> ReadResult:
    chunks, mapping = map_chunks(core.blocks)
    reasons = list(core.retake_reasons)
    usable = any(c.quality == 'clear' and c.kind != 'heading' for c in chunks)
    if core.readability == 'unreadable' or not usable or 'unsupported_language' in reasons:
        return ReadResult(readability='unreadable', retake_reasons=reasons or ['no_printed_text'], page=None)
    warnings = [ExtractionWarning(code=w.code, message=w.message,
                                  chunk_ids=[c.id for i in w.block_indexes for c in mapping[i]]) for w in core.warnings]
    uncertain = [c.id for c in chunks if c.quality == 'uncertain']
    if uncertain and len(warnings) < 30:
        warnings.append(ExtractionWarning(code='uncertain_text', message='Some text is uncertain. Review the photograph or retake it.', chunk_ids=uncertain))
    summary, terms, terms_status, glossary, enrichment_status = _enrichment(core.enrichment, mapping)
    heading = next((c.text for c in chunks if c.kind == 'heading' and c.quality == 'clear' and len(c.text) <= 160), None)
    page = PageDoc(schema_version='1.0', id=str(uuid4()), created_at=datetime.now(timezone.utc).isoformat().replace('+00:00', 'Z'),
                   language='en', title=heading or 'Textbook page', title_origin='source' if heading else 'generated',
                   chunks=chunks, extraction_warnings=warnings, summary=summary, key_terms=terms,
                   key_terms_status=terms_status, glossary=glossary, enrichment_status=enrichment_status)
    return ReadResult(readability='partial' if warnings or reasons else 'readable', retake_reasons=reasons, page=page)


async def read_image(adapter, image: CleanImage) -> ReadResult:
    # This trusted, code-derived shape guides optional generation without adding
    # its branching/nesting to the provider grammar. Never put image text here.
    instruction = OCR_SYSTEM + '\nEnrichment object schema (validate independently): ' + json.dumps(ProviderEnrichment.model_json_schema())
    core = await adapter.generate(operation='read', system_instruction=instruction,
                                  data={'prompt_version': OCR_VERSION, 'task': 'Transcribe the printed image and enrich clear source text.'},
                                  output_model=OCRResponse, image=image.data, mime_type=image.mime_type)
    return build_result(core)
