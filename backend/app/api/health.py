from fastapi import APIRouter, Request

from ..config import Settings
from ..schemas.errors import APIError
from ..schemas.health import HealthResponse, HealthResponseCapabilities

router = APIRouter()

# Semantic-quality acceptance for check_understanding remains open (see backend/README.md).
CHECK_UNDERSTANDING_SEMANTIC_GATE_PASSED = False


def _has_secret(value) -> bool:
    return bool(value is not None and value.get_secret_value().strip())


def evaluate_capabilities(settings: Settings | None) -> tuple[HealthResponseCapabilities, list[str]]:
    """Compute truthful readiness from Settings without making external provider calls."""
    if settings is None or not getattr(settings, 'ai_enabled', False):
        return (
            HealthResponseCapabilities(
                read=False,
                simplify=False,
                define=False,
                explain=False,
                prepare_understanding=False,
                check_understanding=False,
            ),
            ['original'],
        )

    provider = getattr(settings, 'ai_provider', None)
    if provider == 'groq':
        provider_ready = _has_secret(getattr(settings, 'groq_api_key', None))
        if getattr(settings, 'ai_fallback_enabled', False):
            provider_ready = provider_ready and _has_secret(getattr(settings, 'gemini_api_key', None))
    elif provider == 'gemini':
        provider_ready = _has_secret(getattr(settings, 'gemini_api_key', None))
    else:
        provider_ready = False

    if not provider_ready:
        return (
            HealthResponseCapabilities(
                read=False,
                simplify=False,
                define=False,
                explain=False,
                prepare_understanding=False,
                check_understanding=False,
            ),
            ['original'],
        )

    return (
        HealthResponseCapabilities(
            read=True,
            simplify=True,
            define=True,
            explain=True,
            prepare_understanding=True,
            check_understanding=CHECK_UNDERSTANDING_SEMANTIC_GATE_PASSED,
        ),
        ['original', 'easy'],
    )


@router.get(
    '/api/health',
    response_model=HealthResponse,
    operation_id='health',
    responses={
        200: {
            'headers': {
                'X-Request-ID': {
                    'schema': {
                        'type': 'string',
                        'minLength': 1,
                        'maxLength': 80,
                        'pattern': '^[A-Za-z0-9][A-Za-z0-9_-]*$',
                    }
                }
            }
        },
        500: {'model': APIError},
    },
    description='Configuration-aware readiness without provider calls; semantic-quality gates apply.',
)
def health(request: Request) -> HealthResponse:
    settings = getattr(request.app.state, 'settings', None)
    capabilities, reading_levels = evaluate_capabilities(settings)
    return HealthResponse(
        status='ok',
        service='mindbridge-api',
        api_version='1.0',
        capabilities=capabilities,
        reading_levels=reading_levels,
        explanation_languages=['en'],
        limits={
            'max_image_bytes': Settings.max_image_bytes,
            'max_source_chars': Settings.max_source_chars,
            'max_answer_chars': Settings.max_answer_chars,
        },
    )
