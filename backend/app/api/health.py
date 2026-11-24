from fastapi import APIRouter

from ..config import Settings
from ..schemas.errors import APIError
from ..schemas.health import HealthResponse

router = APIRouter()


@router.get('/api/health', response_model=HealthResponse, operation_id='health',
            responses={200: {'headers': {'X-Request-ID': {'schema': {
                'type': 'string', 'minLength': 1, 'maxLength': 80,
                'pattern': '^[A-Za-z0-9][A-Za-z0-9_-]*$'}}}},
                       500: {'model': APIError}},
            description='Process health only; no provider request or uptime guarantee.')
def health() -> HealthResponse:
    return HealthResponse(
        status='ok', service='mindbridge-api', api_version='1.0',
        capabilities=dict.fromkeys(('read', 'simplify', 'define', 'explain',
                                    'prepare_understanding', 'check_understanding'), False),
        reading_levels=['original'], explanation_languages=['en'],
        limits={'max_image_bytes': Settings.max_image_bytes,
                'max_source_chars': Settings.max_source_chars,
                'max_answer_chars': Settings.max_answer_chars},
    )
