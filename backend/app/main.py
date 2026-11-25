"""MindBridge backend. Development docs require MINDBRIDGE_ENV=development."""
import asyncio
from uuid import uuid4

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from starlette.exceptions import HTTPException
from starlette.middleware.cors import CORSMiddleware

from .api.health import router
from .api.reading import router as reading_router
from .api.learning import router as learning_router
from .ai.client import AIError, gemini_lifespan
from .config import Settings
from .errors import error_response, http_error, validation_error
from .validation.images import ReadBodyLimit


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or Settings.from_env()
    development = settings.environment == 'development'
    app = FastAPI(title='MindBridge API', version='1.0.0',
                  docs_url='/docs' if development else None, redoc_url=None,
                  openapi_url='/openapi.json' if development else None,
                  lifespan=gemini_lifespan)
    app.state.settings = settings
    app.state.image_slots = asyncio.Semaphore(settings.max_concurrent_ai_calls)
    app.add_exception_handler(RequestValidationError, validation_error)
    app.add_exception_handler(HTTPException, http_error)

    @app.exception_handler(AIError)
    async def ai_error(request: Request, exc: AIError):
        return error_response(request, exc.status, exc.code, exc.message,
                              retryable=exc.retryable, retry_after_seconds=exc.retry_after_seconds)

    # Added before request_envelope so capped-upload responses have request IDs.
    app.add_middleware(ReadBodyLimit, limit=settings.max_upload_body_bytes)

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
    app.include_router(reading_router)
    app.include_router(learning_router)
    return app


app = create_app()
