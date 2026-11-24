"""The P0 multipart image-to-source endpoint; no fixture fallback."""
import asyncio
from typing import Annotated

from fastapi import APIRouter, File, Request, UploadFile
from starlette.concurrency import run_in_threadpool

from app.ai.client import AIError
from app.schemas.content import ReadResult
from app.schemas.errors import APIError
from app.services.reading import read_image
from app.validation.images import sanitize_image

router = APIRouter()


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
