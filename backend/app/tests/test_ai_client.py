"""Provider-independent transport tests. No credentials or live calls."""
import asyncio
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

import httpx
import pytest
from google.genai import errors, types
from pydantic import Field

from app.ai.client import AIError, GeminiAdapter, gemini_lifespan
from app.config import Settings
from app.schemas.base import WireModel


class Result(WireModel):
    answer: str = Field(max_length=40)


def response(text='{"answer":"ok"}', reason='STOP'):
    return types.GenerateContentResponse(candidates=[types.Candidate(
        finish_reason=reason, content=types.Content(parts=[types.Part.from_text(text=text)]))])


def provider(code, *, quota=None, delay=None, message='sensitive-provider-data'):
    details = []
    if quota:
        details.append({'@type': 'type.googleapis.com/google.rpc.QuotaFailure',
                        'violations': [{'quotaId': quota}]})
    if delay:
        details.append({'@type': 'type.googleapis.com/google.rpc.RetryInfo', 'retryDelay': delay})
    return errors.APIError(code, {'error': {'message': message, 'status': 'RESOURCE_EXHAUSTED', 'details': details}})


def fake(*outcomes):
    return SimpleNamespace(models=SimpleNamespace(generate_content=AsyncMock(side_effect=list(outcomes))), aclose=AsyncMock())


def run(client, settings=None, **kwargs):
    async def execute():
        async with GeminiAdapter(settings or Settings(), client=client) as adapter:
            return await adapter.generate(operation='check', system_instruction='Trusted instruction',
                                          data={'answer': 'untrusted data'}, output_model=Result, **kwargs)
    return asyncio.run(execute())


def test_json_inline_image_and_budget():
    client = fake(response())
    assert run(client, image=b'png sample', mime_type='image/png').answer == 'ok'
    call = client.models.generate_content.call_args.kwargs
    assert call['model'] == Settings().gemini_model
    assert call['contents'][0].role == 'user'
    assert call['contents'][0].parts[1].inline_data.data == b'png sample'
    config = call['config']
    assert config.response_json_schema == Result.model_json_schema()
    assert config.response_mime_type == 'application/json'
    assert config.http_options.retry_options.attempts == 1
    assert config.http_options.timeout <= 15000
    assert config.automatic_continuation is False
    assert config.automatic_function_calling.disable is True
    assert config.tools is None
    assert config.max_output_tokens == 4096
    client.aclose.assert_awaited_once()


@pytest.mark.parametrize('first', [response('{'), response('{"answer":7}'), response('{"answer":"ok","extra":1}'),
                                   response('{"answer":"'+'x'*41+'"}'), response(reason='MAX_TOKENS'),
                                   response(reason='CONTINUATION'), response(' '),
                                   types.GenerateContentResponse(), provider(503), httpx.ConnectError('sensitive')])
def test_bounded_retry_recovers(first):
    client = fake(first, response())
    assert run(client).answer == 'ok'
    assert client.models.generate_content.await_count == 2


@pytest.mark.parametrize('outcome,code,status,count', [
    (response('{'), 'AI_INVALID_RESPONSE', 502, 2),
    (response(reason='SAFETY'), 'CONTENT_UNSUPPORTED', 422, 1),
    (types.GenerateContentResponse(prompt_feedback=types.GenerateContentResponsePromptFeedback(block_reason='SAFETY')), 'CONTENT_UNSUPPORTED', 422, 1),
    (provider(429, quota='GenerateRequestsPerDayPerProjectPerModel-FreeTier', delay='8s'), 'AI_QUOTA_EXHAUSTED', 429, 1),
    (provider(429), 'AI_QUOTA_EXHAUSTED', 429, 1),
    (provider(429, quota='RequestsPerMinute', message='limit: 0'), 'AI_QUOTA_EXHAUSTED', 429, 1),
    (provider(400), 'AI_INVALID_RESPONSE', 502, 1),
    (provider(401), 'AI_UNAVAILABLE', 503, 1),
    (provider(403), 'AI_UNAVAILABLE', 503, 1),
    (provider(404), 'AI_UNAVAILABLE', 503, 1),
    (provider(503), 'AI_UNAVAILABLE', 503, 2),
])
def test_safe_failures_and_attempt_limit(outcome, code, status, count, caplog):
    client = fake(outcome, outcome)
    with pytest.raises(AIError) as caught:
        run(client)
    assert caught.value.code == code
    assert caught.value.status == status
    assert 'sensitive' not in str(caught.value)
    assert 'sensitive' not in caplog.text
    assert client.models.generate_content.await_count == count


def test_rate_limit_respects_delay():
    client = fake(provider(429, quota='RequestsPerMinute', delay='1s'), response())
    with patch('app.ai.client.asyncio.sleep', new_callable=AsyncMock) as sleep:
        assert run(client).answer == 'ok'
        assert 1 <= sleep.await_args.args[0] <= 2


def test_delay_beyond_budget_does_not_retry():
    client = fake(provider(429, quota='RequestsPerMinute', delay='60s'))
    with pytest.raises(AIError) as caught:
        run(client)
    assert caught.value.code == 'RATE_LIMITED'
    assert caught.value.retry_after_seconds == 60
    assert client.models.generate_content.await_count == 1


class ShortSettings(Settings):
    text_call_timeout_seconds = 0.01
    text_deadline_seconds = 0.04


def test_timeouts_share_deadline():
    async def slow(**kwargs):
        await asyncio.sleep(1)
    client = fake()
    client.models.generate_content.side_effect = slow
    with pytest.raises(AIError) as caught:
        run(client, ShortSettings())
    assert caught.value.code == 'AI_TIMEOUT'
    assert client.models.generate_content.await_count == 1


def test_timeout_can_retry_with_budget():
    client = fake(TimeoutError(), response())
    assert run(client).answer == 'ok'
    assert client.models.generate_content.await_count == 2


def test_cancellation_is_not_retried():
    client = fake(asyncio.CancelledError())
    with pytest.raises(asyncio.CancelledError):
        run(client)
    assert client.models.generate_content.await_count == 1
    client.aclose.assert_awaited_once()


def test_no_key_and_invalid_local_input():
    async def execute():
        async with GeminiAdapter(Settings()) as adapter:
            with pytest.raises(AIError) as caught:
                await adapter.generate(operation='check', system_instruction='safe', data={})
            assert caught.value.code == 'AI_UNAVAILABLE'
    asyncio.run(execute())
    client = fake()
    with pytest.raises(ValueError):
        run(client, image=b'x', mime_type='image/gif')
    client.models.generate_content.assert_not_called()


@pytest.mark.parametrize('operation,tokens,timeout', [('read',8192,45000), ('simplify',4096,15000),
                                                    ('prepare',4096,15000), ('define',1536,15000), ('explain',1536,15000)])
def test_plain_text_and_operation_limits(operation, tokens, timeout):
    client = fake(response('A synthetic sentence.'))
    async def execute():
        async with GeminiAdapter(Settings(), client=client) as adapter:
            return await adapter.generate(operation=operation, system_instruction='safe', data={})
    assert asyncio.run(execute()) == 'A synthetic sentence.'
    config = client.models.generate_content.call_args.kwargs['config']
    assert config.max_output_tokens == tokens
    assert config.http_options.timeout <= timeout


def test_environment_file_without_key_disclosure(tmp_path, monkeypatch):
    path = tmp_path / '.env'
    path.write_text('GEMINI_API_KEY="synthetic-secret" # comment\nGEMINI_MODEL=file-model\n')
    monkeypatch.delenv('GEMINI_API_KEY', raising=False)
    monkeypatch.delenv('GEMINI_MODEL', raising=False)
    settings = Settings.from_env(path)
    assert settings.gemini_model == 'file-model'
    assert settings.gemini_api_key.get_secret_value() == 'synthetic-secret'
    assert 'synthetic-secret' not in repr(settings)
    assert 'synthetic-secret' not in settings.model_dump_json()
    monkeypatch.setenv('GEMINI_MODEL', 'override')
    assert Settings.from_env(path).gemini_model == 'override'
    path.write_text('GEMINI_API_KEY="synthetic-secret')
    with pytest.raises(ValueError, match='Invalid backend environment file syntax'):
        Settings.from_env(path)


def test_official_client_configuration_and_lifespan():
    async def execute():
        owner = SimpleNamespace(aio=fake(), close=lambda: None)
        app = SimpleNamespace(state=SimpleNamespace(settings=Settings(gemini_api_key='synthetic-secret')))
        with patch('app.ai.client.genai.Client', return_value=owner) as constructor:
            async with gemini_lifespan(app):
                assert isinstance(app.state.gemini, GeminiAdapter)
            assert not hasattr(app.state, 'gemini')
            assert constructor.call_args.kwargs['vertexai'] is False
            assert constructor.call_args.kwargs['http_options'].retry_options.attempts == 1
            owner.aio.aclose.assert_awaited_once()
    asyncio.run(execute())


def test_total_deadline_includes_retry_delay_and_second_call():
    class DeadlineSettings(Settings):
        text_call_timeout_seconds = 0.15
        text_deadline_seconds = 0.32

    async def execute():
        client = fake()
        count = 0

        async def generate(**kwargs):
            nonlocal count
            count += 1
            if count == 1:
                raise TimeoutError()
            await asyncio.sleep(1)

        client.models.generate_content.side_effect = generate
        loop = asyncio.get_running_loop()
        started = loop.time()
        async with GeminiAdapter(DeadlineSettings(), client=client) as adapter:
            with pytest.raises(AIError) as caught:
                await adapter.generate(operation='check', system_instruction='safe', data={})
        assert caught.value.code == 'AI_TIMEOUT'
        assert count == 2
        assert 0.24 <= loop.time() - started < 0.7
    with patch('app.ai.client._backoff', return_value=0.1):
        asyncio.run(execute())


def test_concurrency_queue_uses_same_deadline():
    async def execute():
        client = fake()
        adapter = GeminiAdapter(ShortSettings(), client=client)
        await adapter._slots.acquire()
        await adapter._slots.acquire()
        with pytest.raises(AIError) as caught:
            await adapter.generate(operation='check', system_instruction='safe', data={})
        assert caught.value.code == 'AI_TIMEOUT'
        client.models.generate_content.assert_not_called()
        await adapter.aclose()
    asyncio.run(execute())


def test_rate_limit_http_retry_after():
    exc = provider(429, quota='RequestsPerMinute')
    exc.response = httpx.Response(429, headers={'Retry-After': '60'})
    client = fake(exc)
    with pytest.raises(AIError) as caught:
        run(client)
    assert caught.value.retry_after_seconds == 60
    assert client.models.generate_content.await_count == 1


def test_transport_error_does_not_expose_credentials(caplog):
    client = fake(httpx.ConnectError('synthetic-secret'), httpx.ConnectError('synthetic-secret'))
    with pytest.raises(AIError) as caught:
        run(client)
    assert 'synthetic-secret' not in str(caught.value)
    assert caught.value.__cause__ is None
    assert 'synthetic-secret' not in caplog.text


@pytest.mark.parametrize('code', [401, 403, 404])
def test_permanent_provider_error_not_user_retryable(code):
    client = fake(provider(code))
    with pytest.raises(AIError) as caught:
        run(client)
    assert caught.value.retryable is False
    assert client.models.generate_content.await_count == 1


@pytest.mark.parametrize('header', ['60', '999999'])
def test_unavailable_respects_long_retry_after_without_retry(header):
    exc = provider(503)
    exc.response = httpx.Response(503, headers={'Retry-After': header})
    client = fake(exc)
    with pytest.raises(AIError) as caught:
        run(client)
    assert caught.value.retry_after_seconds == (int(header) if int(header) <= 86400 else None)
    assert client.models.generate_content.await_count == 1


def test_retry_after_date_and_retry_info():
    from datetime import datetime, timezone, timedelta
    from email.utils import format_datetime
    from app.ai.client import _retry_after
    exc = provider(503, delay='2.5s')
    exc.response = httpx.Response(503, headers={'Retry-After': format_datetime(datetime.now(timezone.utc) + timedelta(seconds=60))})
    assert 59 <= _retry_after(exc) <= 60
    exc.response = httpx.Response(503, headers={'Retry-After': 'invalid'})
    assert _retry_after(exc) == 3


def test_safe_attempt_diagnostics_distinguish_validation_and_upstream(caplog):
    import logging
    caplog.set_level(logging.INFO, logger='uvicorn.error.mindbridge')
    client = fake(provider(503, message='sensitive-provider-data high demand'), response())
    with patch('app.ai.client.asyncio.sleep', new_callable=AsyncMock):
        run(client)
    assert 'upstream_unavailable' in caplog.text
    assert '"upstream_http": 503' in caplog.text
    assert '"category": "success"' in caplog.text
    assert 'sensitive-provider-data' not in caplog.text
    assert 'untrusted data' not in caplog.text
    assert 'Trusted instruction' not in caplog.text


def test_retry_requires_full_call_budget():
    class TightSettings(Settings):
        text_deadline_seconds = 1.5
        text_call_timeout_seconds = 1
    client = fake(provider(503), response())
    with patch('app.ai.client._backoff', return_value=1):
        with pytest.raises(AIError):
            run(client, TightSettings())
    assert client.models.generate_content.await_count == 1


def test_backoff_bounds():
    from app.ai.client import _backoff
    with patch('app.ai.client.random.uniform', return_value=0.5):
        assert _backoff(0) == 1.5
        assert _backoff(1) == 2.5
        assert _backoff(10) == 8


@pytest.mark.parametrize('header', ['0', '-1', 'garbage'])
def test_invalid_or_zero_delay_preserves_public_contract(header):
    from app.ai.client import _provider_error
    exc = provider(503)
    exc.response = httpx.Response(503, headers={'Retry-After': header})
    assert _provider_error(exc).retry_after_seconds is None


def test_503_retry_waits_for_hint():
    exc = provider(503, delay='3s')
    client = fake(exc, response())
    with patch('app.ai.client.asyncio.sleep', new_callable=AsyncMock) as sleep:
        assert run(client).answer == 'ok'
    sleep.assert_awaited_once_with(3)


def test_unknown_quota_is_not_short_term():
    client = fake(provider(429, quota='OtherQuota', delay='1s'))
    with pytest.raises(AIError) as caught:
        run(client)
    assert caught.value.code == 'AI_QUOTA_EXHAUSTED'
    assert client.models.generate_content.await_count == 1


@pytest.mark.parametrize('code', [408, 504])
def test_upstream_deadline_maps_to_timeout(code):
    from app.ai.client import _provider_error
    failure = _provider_error(provider(code))
    assert (failure.code, failure.status) == ('AI_TIMEOUT', 504)
