"""Bounded upload handling and off-thread image sanitation; never retain uploads."""
import io
import warnings
from dataclasses import dataclass

from PIL import Image, ImageOps, UnidentifiedImageError
from starlette.requests import Request

from app.ai.client import AIError
from app.config import Settings
from app.errors import error_response

MIME_TYPES = {'JPEG': 'image/jpeg', 'PNG': 'image/png', 'WEBP': 'image/webp'}


class ReadBodyLimit:
    """Bound the entire body before FastAPI's multipart parser can buffer/spool it.

    Buffer at most 9 MiB per upload, then replay ASGI messages without joining
    them into a second body copy. Check actual bytes even without Content-Length.
    The request envelope must wrap this middleware to supply the request ID.
    """

    def __init__(self, app, limit=Settings.max_upload_body_bytes):
        self.app, self.limit = app, limit

    async def __call__(self, scope, receive, send):
        if scope['type'] != 'http' or scope['path'] != '/api/read' or scope['method'] != 'POST':
            return await self.app(scope, receive, send)
        request = Request(scope)
        declared = request.headers.get('content-length')
        if declared is not None and (not declared.isascii() or not declared.isdigit()):
            return await error_response(request, 400, 'INVALID_REQUEST', 'Invalid request length.')(scope, receive, send)
        messages, size = [], 0
        if declared is not None and (len(declared) > 12 or int(declared) > self.limit):
            size = self.limit + 1
        while size <= self.limit:
            message = await receive()
            if message['type'] == 'http.disconnect':
                return
            size += len(message.get('body', b''))
            if size > self.limit:
                break
            messages.append(message)
            if not message.get('more_body', False):
                break
        if size > self.limit:
            return await error_response(request, 413, 'REQUEST_TOO_LARGE',
                                        'Upload body must be at most 9 MiB.')(scope, receive, send)
        position = 0

        async def replay():
            nonlocal position
            if position < len(messages):
                message = messages[position]
                position += 1
                return message
            return await receive()

        await self.app(scope, replay, send)


@dataclass(frozen=True)
class CleanImage:
    data: bytes
    mime_type: str
    width: int
    height: int


def _too_large():
    return AIError('IMAGE_TOO_LARGE', 413, 'Use an image within 8 MiB, 20 megapixels and 10,000 pixels per side.')


class _BoundedOutput(io.BytesIO):
    def write(self, data):
        if self.tell() + len(data) > Settings.max_image_bytes:
            raise _too_large()
        return super().write(data)


def sanitize_image(data: bytes, content_type: str) -> CleanImage:
    """Call in a bounded worker thread. Verify, fully decode, orient and re-encode."""
    if len(data) > Settings.max_image_bytes:
        raise _too_large()
    if content_type not in MIME_TYPES.values():
        raise AIError('UNSUPPORTED_IMAGE_TYPE', 415, 'Use a JPEG, PNG or WebP image.')
    try:
        with warnings.catch_warnings():
            warnings.simplefilter('error', Image.DecompressionBombWarning)
            with Image.open(io.BytesIO(data)) as probe:
                actual_format = probe.format
                if actual_format not in MIME_TYPES or MIME_TYPES[actual_format] != content_type:
                    raise AIError('UNSUPPORTED_IMAGE_TYPE', 415, 'Image contents must match the declared JPEG, PNG or WebP type.')
                width, height = probe.size
                if width * height > Settings.max_image_pixels or max(width, height) > Settings.max_image_dimension:
                    raise _too_large()
                if getattr(probe, 'n_frames', 1) != 1:
                    raise AIError('INVALID_IMAGE', 422, 'Use a single-frame image.')
                probe.verify()
            with Image.open(io.BytesIO(data)) as source:
                source.load()
                with ImageOps.exif_transpose(source) as oriented:
                    mode = 'RGBA' if 'A' in oriented.getbands() or 'transparency' in oriented.info else 'RGB'
                    if actual_format == 'JPEG':
                        mode = 'RGB'
                    with oriented.convert(mode) as converted:
                        # A fresh raster carries no EXIF, GPS, ICC, comments or text metadata.
                        with Image.new(mode, converted.size) as clean:
                            clean.paste(converted)
                            with _BoundedOutput() as output:
                                options = {'quality': 95} if actual_format == 'JPEG' else {}
                                if actual_format == 'WEBP':
                                    options = {'lossless': True}
                                clean.save(output, format=actual_format, **options)
                                return CleanImage(output.getvalue(), MIME_TYPES[actual_format], *clean.size)
    except (Image.DecompressionBombError, Image.DecompressionBombWarning):
        raise _too_large() from None
    except (UnidentifiedImageError, OSError, SyntaxError, ValueError):
        raise AIError('INVALID_IMAGE', 422, 'The image is damaged or could not be decoded. Choose another image.') from None
