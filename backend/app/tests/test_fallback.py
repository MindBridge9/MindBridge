"""Bounded opt-in fallback with real adapter fakes, no live network."""
import asyncio
from unittest.mock import AsyncMock, patch
import httpx
import pytest
from google.genai import errors
from app.config import Settings
from app.ai.client import AIError, GeminiAdapter
from app.ai.groq import GroqAdapter
from app.ai.fallback import FallbackAdapter
from app.ai.attempts import active_budget
from app.tests.test_ai_client import Result, fake, response
from app.tests.test_groq import completion


def settings():
    return Settings(ai_provider='groq',groq_api_key='synthetic-primary',gemini_api_key='synthetic-secondary',ai_fallback_enabled=True)


def run(outcomes,secondary_outcomes=None):
    calls=[]
    async def handle(request):
        calls.append(request)
        item=outcomes.pop(0)
        if isinstance(item,Exception):raise item
        return item
    secondary=fake(*(secondary_outcomes or [response()]))
    async def execute():
        s=settings()
        primary=GroqAdapter(s,client=httpx.AsyncClient(transport=httpx.MockTransport(handle)))
        backup=GeminiAdapter(s,client=secondary)
        async with FallbackAdapter(s,primary,backup) as adapter:
            return await adapter.generate(operation='check',system_instruction='trusted',data={'source':'private-synthetic'},output_model=Result)
    with patch('app.ai.fallback.asyncio.sleep',new_callable=AsyncMock):
        result=asyncio.run(execute())
    return result,calls,secondary


@pytest.mark.parametrize('first',[httpx.Response(503),httpx.Response(500),httpx.Response(502),httpx.Response(504),
                                 httpx.ConnectError('secret'),httpx.ReadTimeout('secret')])
def test_transient_fallback_uses_one_attempt_each(first):
    result,calls,secondary=run([first])
    assert result.answer=='ok' and len(calls)==1
    assert secondary.models.generate_content.await_count==1
    secondary.aclose.assert_awaited_once()


@pytest.mark.parametrize('status',[400,401,403,404,429])
def test_permanent_or_quota_does_not_switch(status):
    with pytest.raises(AIError): run([httpx.Response(status)])


def test_rate_limit_with_hint_retries_primary_not_backup():
    result,calls,secondary=run([httpx.Response(429,headers={'Retry-After':'1'}),httpx.Response(200,json=completion())])
    assert result.answer=='ok' and len(calls)==2
    secondary.models.generate_content.assert_not_called()


def test_source_integrity_or_invalid_output_repair_stays_primary():
    result,calls,secondary=run([httpx.Response(200,json=completion('{')),httpx.Response(200,json=completion())])
    assert result.answer=='ok' and len(calls)==2
    secondary.models.generate_content.assert_not_called()


def test_fallback_cannot_start_its_own_retry_loop():
    outcomes=[errors.APIError(503,{'error':{'status':'UNAVAILABLE','message':'private'}})]*2
    with pytest.raises(AIError):run([httpx.Response(503)],outcomes)
    # ContextVar must not escape the logical call even after failure.
    assert active_budget.get() is None


def test_retry_after_beyond_shared_deadline_never_switches():
    with pytest.raises(AIError):run([httpx.Response(503,headers={'Retry-After':'60'})])


def test_identical_local_validation_on_backup():
    with pytest.raises(AIError) as caught:
        run([httpx.Response(503)],[response('{"answer":7}')])
    assert caught.value.code=='AI_INVALID_RESPONSE'


def test_factory_default_is_off_and_explicit_enable_only():
    from app.ai.providers import create_provider
    async def execute():
        async with create_provider(Settings(ai_provider='groq')) as provider:
            assert isinstance(provider,GroqAdapter)
        async with create_provider(settings()) as provider:
            assert isinstance(provider,FallbackAdapter)
    asyncio.run(execute())


@pytest.mark.parametrize('code,status', [('INSUFFICIENT_SOURCE',422),('CONTENT_UNSUPPORTED',422),
                                       ('AI_QUOTA_EXHAUSTED',429),('INVALID_REQUEST',400)])
def test_integrity_input_refusal_and_quota_never_switch(code,status):
    async def execute():
        primary=AsyncMock();secondary=AsyncMock()
        primary.generate.side_effect=AIError(code,status,'Safe rejection.')
        async with FallbackAdapter(settings(),primary,secondary) as adapter:
            with pytest.raises(AIError) as caught:
                await adapter.generate(operation='check',data={},system_instruction='trusted')
            assert caught.value.code==code
        primary.generate.assert_awaited_once()
        secondary.generate.assert_not_called()
        primary.aclose.assert_awaited_once();secondary.aclose.assert_awaited_once()
    asyncio.run(execute())


def test_shared_deadline_cancels_stalled_provider_and_restores_context(monkeypatch):
    monkeypatch.setattr(Settings,'text_deadline_seconds',0.01)
    async def execute():
        primary=AsyncMock();secondary=AsyncMock()
        async def stalled(**kwargs): await asyncio.Event().wait()
        primary.generate.side_effect=stalled
        async with FallbackAdapter(settings(),primary,secondary) as adapter:
            with pytest.raises(AIError) as caught:
                await adapter.generate(operation='check',data={},system_instruction='trusted')
            assert caught.value.code=='AI_TIMEOUT'
            assert active_budget.get() is None
        secondary.generate.assert_not_called()
    asyncio.run(execute())
