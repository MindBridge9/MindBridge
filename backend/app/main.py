"""B01 health foundation. Run: python -m uvicorn app.main:app --workers 1."""
from uuid import uuid4

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from starlette.exceptions import HTTPException
from starlette.middleware.cors import CORSMiddleware

from .api.health import router
from .config import Settings
from .errors import error_response, http_error, validation_error


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or Settings.from_env()
    app = FastAPI(title='MindBridge API', version='1.0.0', docs_url=None, redoc_url=None)
    app.state.settings = settings
    app.add_exception_handler(RequestValidationError, validation_error)
    app.add_exception_handler(HTTPException, http_error)

    @app.middleware('http')
    async def request_envelope(request: Request, call_next):
        request.state.request_id = str(uuid4())
        try:
            response = await call_next(request)
        except Exception:
            # No raw exceptions or input bodies are logged or sent to the client.
            response = error_response(request, 500, 'INTERNAL_ERROR',
                                      'Something went wrong. Please try again.', retryable=True)
        response.headers['X-Request-ID'] = request.state.request_id
        response.headers['Cache-Control'] = 'no-store'
        return response

    # Wrap error envelopes as well as successful responses for browser recovery.
    app.add_middleware(CORSMiddleware, allow_origins=list(settings.cors_origins),
                       allow_credentials=False, allow_methods=['GET', 'POST'],
                       allow_headers=['Content-Type'],
                       expose_headers=['X-Request-ID', 'Retry-After'])
    app.include_router(router)
    return app


app = create_app()
