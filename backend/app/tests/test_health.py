"""Tests for configuration-aware /api/health capability reporting."""
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient
from pydantic import SecretStr, ValidationError

from app.api.health import evaluate_capabilities
from app.config import Settings
from app.main import create_app


def test_health_all_false_when_ai_disabled():
    settings = Settings(
        environment='development',
        ai_enabled=False,
        ai_provider='gemini',
        gemini_api_key=SecretStr('test-gemini-key'),
    )
    with TestClient(create_app(settings)) as client:
        res = client.get('/api/health')
        assert res.status_code == 200
        body = res.json()
        assert not any(body['capabilities'].values())
        assert body['reading_levels'] == ['original']
        assert 'test-gemini-key' not in res.text


def test_health_all_false_when_credentials_missing_or_blank():
    for key in (None, SecretStr('   ')):
        settings = Settings(environment='development', ai_enabled=True, ai_provider='gemini', gemini_api_key=key)
        with TestClient(create_app(settings)) as client:
            body = client.get('/api/health').json()
            assert not any(body['capabilities'].values())
            assert body['reading_levels'] == ['original']

    groq_missing = Settings(environment='development', ai_enabled=True, ai_provider='groq', groq_api_key=None)
    with TestClient(create_app(groq_missing)) as client:
        body = client.get('/api/health').json()
        assert not any(body['capabilities'].values())
        assert body['reading_levels'] == ['original']


def test_health_no_provider_or_unsupported_provider():
    with pytest.raises(ValidationError):
        Settings(ai_provider='unknown-provider')

    for bad_provider in (None, '', 'unsupported'):
        caps, levels = evaluate_capabilities(
            SimpleNamespace(
                ai_enabled=True,
                ai_provider=bad_provider,
                groq_api_key=SecretStr('k'),
                gemini_api_key=SecretStr('k'),
            )
        )
        assert not any(caps.model_dump().values())
        assert levels == ['original']


@pytest.mark.parametrize('provider,kwargs', [
    ('groq', {'groq_api_key': SecretStr('test-groq-secret')}),
    ('gemini', {'gemini_api_key': SecretStr('test-gemini-secret')}),
])
def test_health_reviewed_provider_enables_only_allowlisted_capabilities_and_keeps_semantic_gate_closed(provider, kwargs):
    settings = Settings(environment='development', ai_enabled=True, ai_provider=provider, approved_capabilities=('read', 'simplify', 'define', 'explain', 'prepare_understanding'), **kwargs)
    with TestClient(create_app(settings)) as client:
        res = client.get('/api/health')
        assert res.status_code == 200
        body = res.json()
        assert body['api_version'] == '1.0'
        assert body['capabilities'] == {
            'read': True,
            'simplify': True,
            'define': True,
            'explain': True,
            'prepare_understanding': True,
            'check_understanding': False,
        }
        assert body['reading_levels'] == ['original', 'easy']
        assert 'guided' not in body['reading_levels']
        assert 'test-groq-secret' not in res.text
        assert 'test-gemini-secret' not in res.text


def test_credentials_alone_do_not_prove_readiness():
    caps, levels = evaluate_capabilities(Settings(environment='development', gemini_api_key=SecretStr('synthetic')))
    assert not any(caps.model_dump().values())
    assert levels == ['original']


def test_reviewed_allowlist_and_learning_gate():
    caps, levels = evaluate_capabilities(Settings(gemini_api_key=SecretStr('synthetic'), approved_capabilities=('read', 'simplify')))
    assert caps.read and caps.simplify
    assert not caps.define and not caps.prepare_understanding and not caps.check_understanding
    assert levels == ['original', 'easy']


def test_synthetic_development_integration_is_explicit_and_never_production():
    caps, _ = evaluate_capabilities(Settings(environment='development', gemini_api_key=SecretStr('synthetic'), synthetic_development_integration=True))
    assert all(caps.model_dump().values())
    with pytest.raises(ValidationError):
        Settings(environment='production', synthetic_development_integration=True)
    with pytest.raises(ValidationError):
        Settings(approved_capabilities=('check_understanding',))
