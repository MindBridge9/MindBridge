"""Deterministic source provenance checks; never normalize or mutate source text.

Request relationship failures use safe 422 errors. Invalid generated references
use safe 502 errors, allowing their caller's existing bounded repair budget.
Client-carried context is validated evidence, not authenticated provenance.
"""
import re
from collections.abc import Mapping, Sequence

from pydantic import TypeAdapter, ValidationError

from app.ai.client import AIError
from app.config import Settings
from app.schemas.content import KeyTerm, SourceContext, SourceReference, TextChunk


def _request_error():
    return AIError('VALIDATION_ERROR', 422, 'Check the source chunks, references and terminology metadata.')


def _reference_error(generated):
    if generated:
        return AIError('AI_INVALID_RESPONSE', 502, 'Generated source references could not be validated.', retryable=True)
    return _request_error()


def phrase_span(phrase: str, text: str) -> tuple[int, int] | None:
    """Unicode casefold + word boundaries, returning offsets in ORIGINAL text.

    Same phrase policy as B03's extraction checks, with an offset map to handle
    expansions such as ß -> ss without changing returned source quotations.
    """
    folded, offsets = [], []
    for index, char in enumerate(text):
        part = char.casefold()
        folded.append(part)
        offsets.extend([index] * len(part))
    match = re.search(r'(?<!\w)' + re.escape(phrase.casefold()) + r'(?!\w)', ''.join(folded))
    if not phrase or match is None:
        return None
    return offsets[match.start()], offsets[match.end()-1] + 1


def phrase_present(phrase: str, text: str) -> bool:
    return phrase_span(phrase, text) is not None


def validate_source(source: SourceContext | Mapping) -> SourceContext:
    try:
        # Revalidate even existing models: their nested lists are mutable.
        parsed = SourceContext.model_validate(source.model_dump(warnings=False) if isinstance(source, SourceContext) else source)
    except ValidationError:
        raise _request_error() from None
    chunks = {chunk.id: chunk for chunk in parsed.chunks}
    order = [int(chunk.id[1:]) for chunk in parsed.chunks]
    if (len(chunks) != len(parsed.chunks)
            or order != sorted(order)
            or any(not 1 <= int(chunk.id[1:]) <= 100 for chunk in parsed.chunks)
            or sum(len(chunk.text) for chunk in parsed.chunks) > Settings.max_source_chars
            or (parsed.key_terms_status == 'unavailable' and parsed.key_terms)):
        raise _request_error() from None
    terms = set()
    for term in parsed.key_terms:
        if term.term.casefold() in terms or len(set(term.chunk_ids)) != len(term.chunk_ids):
            raise _request_error() from None
        terms.add(term.term.casefold())
        for chunk_id in term.chunk_ids:
            chunk = chunks.get(chunk_id)
            if chunk is None or chunk.quality != 'clear' or not phrase_present(term.term, chunk.text):
                raise _request_error() from None
    return parsed


def require_chunk(source: SourceContext | Mapping, chunk_id: str, *, clear: bool = True) -> TextChunk:
    source = validate_source(source)
    chunk = next((c for c in source.chunks if c.id == chunk_id), None)
    if chunk is None:
        raise _request_error() from None
    if clear and chunk.quality != 'clear':
        raise AIError('INSUFFICIENT_SOURCE', 422, 'Select clear source text or retake the page.') from None
    return chunk


def select_source(source: SourceContext | Mapping, chunk_ids: Sequence[str]) -> SourceContext:
    """Filter a validated subset in original reading order; keep availability."""
    source = validate_source(source)
    if (not isinstance(chunk_ids, (list, tuple)) or not chunk_ids
            or any(not isinstance(i, str) for i in chunk_ids)
            or len(set(chunk_ids)) != len(chunk_ids)):
        raise _request_error() from None
    wanted = set(chunk_ids)
    if not wanted <= {c.id for c in source.chunks}:
        raise _request_error() from None
    chunks = [c for c in source.chunks if c.id in wanted]
    if any(c.quality != 'clear' for c in chunks):
        raise AIError('INSUFFICIENT_SOURCE', 422, 'Select clear source text or retake the page.') from None
    terms = [KeyTerm(term=t.term, chunk_ids=[i for i in t.chunk_ids if i in wanted])
             for t in source.key_terms if wanted.intersection(t.chunk_ids)]
    return SourceContext(page_id=source.page_id, chunks=chunks, key_terms=terms,
                         key_terms_status=source.key_terms_status)


def validate_references(source: SourceContext | Mapping, references: Sequence[SourceReference | Mapping],
                        *, page_id: str | None = None, generated: bool = True) -> tuple[SourceReference, ...]:
    source = validate_source(source)
    fail = _reference_error(generated)
    if page_id is not None and page_id != source.page_id:
        raise fail from None
    if not isinstance(references, (list, tuple)) or not 1 <= len(references) <= 12:
        raise fail from None
    try:
        refs = TypeAdapter(list[SourceReference]).validate_python(
            [r.model_dump(warnings=False) if isinstance(r, SourceReference) else r for r in references], strict=True)
    except ValidationError:
        raise fail from None
    chunks = {c.id: c for c in source.chunks}
    seen = set()
    for ref in refs:
        key = ref.chunk_id, ref.quote
        chunk = chunks.get(ref.chunk_id)
        if (key in seen or chunk is None or chunk.quality != 'clear' or ref.quote not in chunk.text):
            raise fail from None
        seen.add(key)
    return tuple(refs)
