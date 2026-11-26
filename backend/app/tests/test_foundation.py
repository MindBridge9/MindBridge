"""Self-contained tests; no private contract/fixture files required."""
import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

from app.config import Settings
from app.main import create_app
from app.schemas.content import SourceReference, TextChunk
from app.schemas.errors import APIError


@pytest.fixture
def client():
    with TestClient(create_app(Settings(environment='development'))) as client:
        yield client


def test_health_and_routes(client):
    response = client.get('/api/health')
    assert response.status_code == 200
    assert response.json() == {
        'status': 'ok', 'service': 'mindbridge-api', 'api_version': '1.0',
        'capabilities': dict.fromkeys(['read', 'simplify', 'define', 'explain',
                                      'prepare_understanding', 'check_understanding'], False),
        'reading_levels': ['original'], 'explanation_languages': ['en'],
        'limits': {'max_image_bytes': 8388608, 'max_source_chars': 12000, 'max_answer_chars': 2000},
    }
    assert response.headers['x-request-id']
    assert set(client.get('/openapi.json').json()['paths']) == {'/api/health', '/api/read', '/api/simplify', '/api/prepare-understanding', '/api/check-understanding', '/api/define', '/api/explain'}
    assert client.post('/api/read').status_code == 415


@pytest.mark.parametrize('method,path,status,code', [
    ('get', '/absent', 404, 'NOT_FOUND'),
    ('post', '/api/health', 405, 'METHOD_NOT_ALLOWED'),
])
def test_http_errors(client, method, path, status, code):
    response = getattr(client, method)(path)
    error = APIError.model_validate(response.json()).error
    assert response.status_code == status
    assert error.code == code
    assert error.request_id == response.headers['x-request-id']
    assert response.headers['cache-control'] == 'no-store'


def test_normalized_errors_and_no_payload_leak():
    app = create_app(Settings())

    @app.post('/test-validation')
    def validate(body: SourceReference):
        return body

    @app.get('/test-error')
    def fail():
        raise RuntimeError('secret-content')

    with TestClient(app) as client:
        for body in [{'chunk_id': 'bad', 'quote': 'secret-content'},
                     {'chunk_id': 'c0001', 'quote': 'ok', 'secret-content': True}]:
            response = client.post('/test-validation', json=body)
            assert response.status_code == 422
            assert APIError.model_validate(response.json()).error.code == 'VALIDATION_ERROR'
            assert 'secret-content' not in response.text
        malformed = client.post('/test-validation', content='{', headers={'Content-Type': 'application/json'})
        assert malformed.status_code == 400
        response = client.get('/test-error', headers={'Origin': 'http://localhost:5173'})
        assert response.status_code == 500
        assert 'secret-content' not in response.text
        assert response.headers['access-control-allow-origin'] == 'http://localhost:5173'
        assert APIError.model_validate(response.json()).error.request_id == response.headers['x-request-id']


def test_cors_and_request_ids(client):
    a = client.get('/api/health', headers={'Origin': 'http://localhost:5173', 'X-Request-ID': 'untrusted'})
    b = client.get('/api/health', headers={'Origin': 'https://untrusted.example'})
    assert a.headers['x-request-id'] != 'untrusted'
    assert a.headers['x-request-id'] != b.headers['x-request-id']
    assert 'Retry-After' in a.headers['access-control-expose-headers']
    assert 'access-control-allow-origin' not in b.headers
    assert 'access-control-allow-credentials' not in a.headers


@pytest.mark.parametrize('change', [{'text': ''}, {'text': ' \n'}, {'text': 'a'*3001},
                                   {'id': 'c12345'}, {'quality': 'good'}, {'extra': 1}, {'text': 1}])
def test_chunk_constraints(change):
    with pytest.raises(ValidationError):
        TextChunk.model_validate({'id': 'c0001', 'kind': 'paragraph', 'text': 'text', 'quality': 'clear', **change})


def test_original_text_is_preserved_and_frozen():
    chunk = TextChunk(id='c0001', kind='paragraph', text='  Original\ntext. ', quality='clear')
    assert chunk.text == '  Original\ntext. '
    with pytest.raises(ValidationError):
        chunk.text = 'changed'


def test_config(monkeypatch):
    monkeypatch.setenv('GEMINI_API_KEY', 'secret-content')
    monkeypatch.setenv('GEMINI_MODEL', 'configured-model')
    settings = Settings.from_env()
    assert 'secret-content' not in repr(settings)
    assert 'secret-content' not in settings.model_dump_json()
    assert settings.gemini_model == 'configured-model'
    with TestClient(create_app(settings)) as client:
        response = client.get('/api/health')
        assert response.status_code == 200
        assert 'secret-content' not in response.text
        payload = response.json()
        assert payload['capabilities'] == {
            'read': True,
            'simplify': True,
            'define': True,
            'explain': True,
            'prepare_understanding': True,
            'check_understanding': False,
        }
        assert payload['reading_levels'] == ['original', 'easy']
    with pytest.raises(ValidationError):
        Settings(cors_origins=('*',))


def test_optional_fields_and_required_nulls():
    from app.schemas.content import PrepareRequest, ReadResult, DefineRequest
    source = {'page_id': '11111111-1111-4111-8111-111111111111',
              'chunks': [{'id': 'c0001', 'kind': 'paragraph', 'text': 'Example text.', 'quality': 'clear'}],
              'key_terms': [], 'key_terms_status': 'unavailable'}
    request = PrepareRequest(source=source, chunk_id='c0001')
    assert 'target_concept' not in request.model_dump()
    with pytest.raises(ValidationError):
        PrepareRequest(source=source, chunk_id='c0001', target_concept=None)
    definition = DefineRequest(source=source, chunk_id='c0001', phrase='Example', surrounding_sentence='Example text.')
    assert definition.language == 'en'
    assert ReadResult(readability='unreadable', retake_reasons=['blur'], page=None).page is None
    with pytest.raises(ValidationError):
        ReadResult(readability='unreadable', retake_reasons=['blur'])


@pytest.mark.parametrize('value', ['not-a-date', '2026-02-30T00:00:00Z', '2026-01-01T00:00:00', '2026-01-01T00:00:00+01:00'])
def test_bad_timestamps(value):
    from pydantic import TypeAdapter
    from app.schemas.base import UTCDateTimeString
    with pytest.raises(ValidationError):
        TypeAdapter(UTCDateTimeString).validate_python(value)


def test_timestamp_and_uuid_preserved():
    from pydantic import TypeAdapter
    from app.schemas.base import UTCDateTimeString, UUIDString
    assert TypeAdapter(UTCDateTimeString).validate_python('2026-01-01T00:00:00Z') == '2026-01-01T00:00:00Z'
    with pytest.raises(ValidationError):
        TypeAdapter(UUIDString).validate_python('bad')
