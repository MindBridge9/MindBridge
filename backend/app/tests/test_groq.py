import asyncio
import base64
import json
from unittest.mock import AsyncMock, patch
import httpx
import pytest
from pydantic import ValidationError
from app.ai.client import AIError, GeminiAdapter
from app.ai.groq import GroqAdapter, strict_schema, provider_failure
from app.ai.providers import create_provider
from app.config import Settings
from app.services.reading import OCRResponse
from app.tests.test_ai_client import Result


def completion(content='{"answer":"ok"}', reason='stop', **extra):
    return {'choices':[{'finish_reason':reason,'message':{'content':content,**extra}}]}


def run(outcomes, **kwargs):
    calls=[]
    async def handle(request):
        calls.append(request)
        item=outcomes.pop(0)
        if isinstance(item, BaseException): raise item
        return item
    async def execute():
        client=httpx.AsyncClient(transport=httpx.MockTransport(handle))
        async with GroqAdapter(Settings(groq_api_key='synthetic-secret'),client=client) as adapter:
            try:
                return await adapter.generate(operation='simplify',system_instruction='trusted',
                    data={'source':'private-source'},output_model=Result,**kwargs)
            finally:
                assert len(calls)<=2
    with patch('app.ai.groq.asyncio.sleep',new_callable=AsyncMock):
        result=asyncio.run(execute())
    return result,calls


def test_strict_schema():
    schema=strict_schema(OCRResponse)
    def check(node):
        if isinstance(node,dict):
            if node.get('type')=='object':
                assert node['additionalProperties'] is False
                assert set(node['required'])==set(node['properties'])
            for value in node.values(): check(value)
        elif isinstance(node,list):
            for value in node: check(value)
    check(schema)
    assert 'ProviderEnrichment' in schema['$defs']
    assert OCRResponse.model_json_schema()['properties']['enrichment']['additionalProperties'] is True


def test_image_parameters():
    result,calls=run([httpx.Response(200,json=completion())],image=b'png',mime_type='image/png')
    assert result.answer=='ok'
    payload=json.loads(calls[0].content)
    assert payload['reasoning_effort']=='none'
    assert payload['max_completion_tokens']==768
    assert payload['response_format']['json_schema']['strict'] is True
    assert base64.b64decode(payload['messages'][1]['content'][1]['image_url']['url'].split(',')[1])==b'png'
    assert calls[0].url=='https://api.groq.com/openai/v1/chat/completions'


@pytest.mark.parametrize('body',[completion('{'),completion('{"answer":7}'),completion('{"answer":"ok","extra":1}'),
    completion('x'*50),completion(reason='length'),completion(''),{}, {'choices':[]},
    completion(tool_calls=[{}]),completion(function_call={'name':'x'}),{'choices':None},completion(None)])
def test_invalid_retry(body):
    result,calls=run([httpx.Response(200,json=body),httpx.Response(200,json=completion())])
    assert result.answer=='ok' and len(calls)==2


@pytest.mark.parametrize('status,code',[(400,'AI_INVALID_RESPONSE'),(401,'AI_UNAVAILABLE'),(403,'AI_UNAVAILABLE'),
    (404,'AI_UNAVAILABLE'),(429,'AI_QUOTA_EXHAUSTED'),(500,'AI_UNAVAILABLE'),(503,'AI_UNAVAILABLE'),(504,'AI_TIMEOUT')])
def test_errors(status,code,caplog):
    with pytest.raises(AIError) as caught:
        run([httpx.Response(status,json={'error':{'message':'private-source'}})]*2)
    assert caught.value.code==code
    assert 'private-source' not in caplog.text and 'synthetic-secret' not in caplog.text


@pytest.mark.parametrize('first',[httpx.ReadTimeout('private-source'),httpx.ConnectError('private-source'),
    httpx.Response(200,text='not-json'),httpx.Response(400,json={'error':{'code':'json_validate_failed'}})])
def test_transient(first):
    result,calls=run([first,httpx.Response(200,json=completion())])
    assert result.answer=='ok' and len(calls)==2


@pytest.mark.parametrize('body',[completion(refusal='blocked'),completion(reason='content_filter')])
def test_refusal(body):
    with pytest.raises(AIError) as caught: run([httpx.Response(200,json=body)])
    assert caught.value.code=='CONTENT_UNSUPPORTED'


@pytest.mark.parametrize('headers,retry,code',[({'Retry-After':'2'},True,'RATE_LIMITED'),
    ({'Retry-After':'2','x-ratelimit-remaining-requests':'0'},False,'AI_QUOTA_EXHAUSTED'),({},False,'AI_QUOTA_EXHAUSTED')])
def test_rates(headers,retry,code):
    failure,actual,delay=provider_failure(httpx.Response(429,headers=headers))
    assert actual==retry and failure.code==code


def test_deadline_hint():
    with pytest.raises(AIError) as caught: run([httpx.Response(503,headers={'Retry-After':'60'})])
    assert caught.value.retry_after_seconds==60


def test_selection_missing_key():
    assert isinstance(create_provider(Settings()),GeminiAdapter)
    async def execute():
        async with create_provider(Settings(ai_provider='groq')) as adapter:
            assert isinstance(adapter,GroqAdapter)
            with pytest.raises(AIError): await adapter.generate(operation='read',system_instruction='x',data={})
        assert adapter._client.is_closed
    asyncio.run(execute())


def test_env(tmp_path,monkeypatch):
    for key in ('AI_PROVIDER','GROQ_API_KEY','GROQ_MODEL'): monkeypatch.delenv(key,raising=False)
    env=tmp_path/'.env'
    env.write_text('AI_PROVIDER=groq\nGROQ_API_KEY=synthetic-secret\nGROQ_MODEL=qwen/qwen3.8-27b\n')
    settings=Settings.from_env(env)
    assert settings.ai_provider=='groq'
    assert 'synthetic-secret' not in repr(settings)+settings.model_dump_json()
    monkeypatch.setenv('AI_PROVIDER','gemini')
    assert Settings.from_env(env).ai_provider=='gemini'
    with pytest.raises(ValidationError): Settings(ai_provider='unknown')


def test_queue_and_cancel():
    class Short(Settings):
        text_deadline_seconds=0.01
    async def execute():
        async with GroqAdapter(Short(groq_api_key='synthetic-secret')) as adapter:
            await adapter._slots.acquire()
            await adapter._slots.acquire()
            with pytest.raises(AIError) as caught: await adapter.generate(operation='simplify',system_instruction='x',data={})
            assert caught.value.code=='AI_TIMEOUT'
    asyncio.run(execute())
    with pytest.raises(asyncio.CancelledError): run([asyncio.CancelledError()])


@pytest.mark.parametrize('body',[{'choices':[{'finish_reason':'stop','message':'bad'}]}, {'choices':[None]}])
def test_malformed_shape(body):
    result,calls=run([httpx.Response(200,json=body),httpx.Response(200,json=completion())])
    assert result.answer=='ok' and len(calls)==2


def test_daily_token_quota():
    failure,retry,_=provider_failure(httpx.Response(429,headers={'Retry-After':'2'},
        json={'error':{'code':'rate_limit_exceeded','message':'Tokens per day (TPD) exceeded'}}))
    assert failure.code=='AI_QUOTA_EXHAUSTED' and not retry


def test_plain_text_and_per_call_timeout():
    class Short(Settings):
        text_call_timeout_seconds=0.01
        text_deadline_seconds=0.02
    async def execute():
        async def slow(request):
            await asyncio.sleep(1)
        async with GroqAdapter(Short(groq_api_key='synthetic-secret'),client=httpx.AsyncClient(transport=httpx.MockTransport(slow))) as adapter:
            with pytest.raises(AIError) as caught:
                await adapter.generate(operation='define',system_instruction='x',data={})
            assert caught.value.code=='AI_TIMEOUT'
        client=httpx.AsyncClient(transport=httpx.MockTransport(lambda r:httpx.Response(200,json=completion('plain text'))))
        async with GroqAdapter(Settings(groq_api_key='synthetic-secret'),client=client) as adapter:
            assert await adapter.generate(operation='define',system_instruction='x',data={})=='plain text'
    asyncio.run(execute())
