"""The P0 multipart image-to-source endpoint; no fixture fallback."""
import asyncio
from typing import Annotated

from fastapi import APIRouter, File, Request, UploadFile
from fastapi.routing import APIRoute
from starlette.concurrency import run_in_threadpool

from app.ai.client import AIError
from app.schemas.content import ReadResult, SimplifyRequest, SimplificationResult, DefineRequest, ExplainRequest, GlossaryEntry, ConceptExplanation
from app.schemas.errors import APIError
from app.services.reading import read_image, simplify_text, define_term, explain_concept
from app.validation.images import sanitize_image

class ReadingRoute(APIRoute):
    def get_route_handler(self):
        original_handler = super().get_route_handler()

        async def bounded(request: Request):
            if self.path not in ('/api/simplify', '/api/prepare-understanding', '/api/check-understanding', '/api/define', '/api/explain'):
                return await original_handler(request)
            settings = request.app.state.settings
            content_type = request.headers.get('content-type', '').split(';', 1)[0].strip().lower()
            if content_type != 'application/json' and not (content_type.startswith('application/') and content_type.endswith('+json')):
                raise AIError('INVALID_REQUEST', 415, 'Use application/json for this request.')
            declared = request.headers.get('content-length')
            if declared is not None:
                if not declared.isascii() or not declared.isdigit():
                    raise AIError('INVALID_REQUEST', 400, 'Invalid request length.')
                if len(declared) > 12 or int(declared) > settings.max_json_body_bytes:
                    raise AIError('REQUEST_TOO_LARGE', 413, 'JSON requests must be at most 256 KiB.')
            try:
                async with asyncio.timeout(settings.text_deadline_seconds):
                    parts, size = [], 0
                    async for part in request.stream():
                        size += len(part)
                        if size > settings.max_json_body_bytes:
                            raise AIError('REQUEST_TOO_LARGE', 413, 'JSON requests must be at most 256 KiB.')
                        parts.append(part)
                    # Populate Starlette's standard body cache only AFTER the
                    # byte cap is satisfied, before FastAPI JSON/model parsing.
                    request._body = b''.join(parts)
                    return await original_handler(request)
            except TimeoutError:
                raise AIError('AI_TIMEOUT', 504, 'The AI request timed out. Please retry.', retryable=True) from None

        return bounded


router = APIRouter(route_class=ReadingRoute)


@router.post('/api/read', operation_id='read', response_model=ReadResult,
             responses={status: {'model': APIError} for status in (400, 413, 415, 422, 429, 501, 502, 503, 504, 500)},
             description='One English printed JPEG, PNG or WebP image. Original OCR and generated enrichment are separate. No automatic client retry.')
async def read(request: Request, image: Annotated[UploadFile, File()]):
    settings = request.app.state.settings
    try:
        form = await request.form()
        if len(form.multi_items()) != 1 or form.multi_items()[0][0] != 'image':
            raise AIError('VALIDATION_ERROR', 422, 'Send exactly one image file and no other fields.')
        async with asyncio.timeout(settings.read_deadline_seconds):
            if image.size is not None and image.size > settings.max_image_bytes:
                raise AIError('IMAGE_TOO_LARGE', 413, 'The image must be at most 8 MiB.')
            data = await image.read(settings.max_image_bytes + 1)
            async with request.app.state.image_slots:
                clean = await run_in_threadpool(sanitize_image, data, image.content_type or '')
            return await read_image(request.app.state.gemini, clean)
    except TimeoutError:
        raise AIError('AI_TIMEOUT', 504, 'The image request timed out. Please retry.', retryable=True) from None
    finally:
        await image.close()


@router.post('/api/simplify', operation_id='simplify', response_model=SimplificationResult,
             responses={status: {'model': APIError} for status in (400, 413, 415, 422, 429, 501, 502, 503, 504, 500)},
             description='Easy simplification for 1–3 clear source chunks, with exact evidence and deterministic possible-omission warnings. No automatic client retry.')
async def simplify(request: Request, body: SimplifyRequest) -> SimplificationResult:
    return await simplify_text(request.app.state.gemini, body)


@router.post('/api/define', operation_id='define', response_model=GlossaryEntry,
             responses={status: {'model':APIError} for status in (400,413,415,422,429,501,502,503,504,500)})
async def define(request: Request, body: DefineRequest) -> GlossaryEntry:
    return await define_term(request.app.state.gemini,body)


@router.post('/api/explain', operation_id='explain', response_model=ConceptExplanation,
             responses={status: {'model':APIError} for status in (400,413,415,422,429,501,502,503,504,500)})
async def explain(request: Request, body: ExplainRequest) -> ConceptExplanation:
    return await explain_concept(request.app.state.gemini,body)
