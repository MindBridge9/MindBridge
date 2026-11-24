"""Safe error envelopes: never echo payloads, exception messages or arbitrary field names."""
from fastapi import Request
from fastapi.exceptions import RequestValidationError
from starlette.exceptions import HTTPException
from starlette.responses import JSONResponse

from .schemas.errors import APIError


def error_response(request: Request, status: int, code: str, message: str,
                   *, retryable: bool = False, details: list | None = None,
                   retry_after_seconds: int | None = None) -> JSONResponse:
    payload = APIError(error={
        'code': code, 'message': message, 'retryable': retryable,
        'request_id': request.state.request_id,
        'retry_after_seconds': retry_after_seconds, 'details': details or [],
    })
    headers = {'X-Request-ID': request.state.request_id, 'Cache-Control': 'no-store'}
    if retry_after_seconds is not None:
        headers['Retry-After'] = str(retry_after_seconds)
    return JSONResponse(payload.model_dump(mode='json'), status_code=status, headers=headers)


async def validation_error(request: Request, exc: RequestValidationError):
    content_type = request.headers.get('content-type', '').split(';', 1)[0].lower()
    if content_type and content_type != 'application/json' and not content_type.endswith('+json'):
        return error_response(request, 415, 'INVALID_REQUEST', 'Use application/json for this request.')
    malformed = any(e['type'] == 'json_invalid' for e in exc.errors())
    return error_response(request, 400 if malformed else 422,
                          'INVALID_REQUEST' if malformed else 'VALIDATION_ERROR',
                          'The request contains invalid JSON.' if malformed else 'Check the request fields and try again.',
                          details=[{'field': 'body', 'reason': 'Request validation failed.'}])


async def http_error(request: Request, exc: HTTPException):
    code, message = {
        404: ('NOT_FOUND', 'The requested route does not exist.'),
        405: ('METHOD_NOT_ALLOWED', 'This method is not supported for this route.'),
        400: ('INVALID_REQUEST', 'The request could not be read.'),
    }.get(exc.status_code, ('INTERNAL_ERROR', 'Something went wrong. Please try again.'))
    response = error_response(request, exc.status_code, code, message)
    if exc.status_code == 405 and exc.headers and 'Allow' in exc.headers:
        response.headers['Allow'] = exc.headers['Allow']
    return response
