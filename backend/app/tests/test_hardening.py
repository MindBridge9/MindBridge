"""Offline security/admission/deployment checks; no provider calls."""
import asyncio
from unittest.mock import AsyncMock, patch
import httpx
import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError
from app.config import Settings
from app.deployment import production_options
from app.limits import RequestLimits
from app.main import create_app
from app.ai.providers import create_provider
from app.ai.client import AIError


def production(**kwargs):
    return Settings(ai_provider='groq',groq_api_key='synthetic-secret',cors_origins=('https://frontend.example',),**kwargs)


def test_production_binding_and_no_proxy_auto_trust():
    options=production_options(production(),'10000')
    assert options['host']=='0.0.0.0' and options['port']==10000 and options['workers']==1
    assert options['proxy_headers'] is False and options['access_log'] is False
    assert options['server_header'] is False


@pytest.mark.parametrize('port',['0','65536','oops','1.5','-1','１２'])
def test_production_port_rejected(port):
    with pytest.raises(ValueError): production_options(production(),port)


@pytest.mark.parametrize('origin',['http://frontend.example','https://localhost','https://127.0.0.1','https://[::1]'])
def test_production_origin_rejected(origin):
    with pytest.raises(ValueError):
        Settings(ai_provider='groq',groq_api_key='synthetic',cors_origins=(origin,)).validate_production()


def test_production_explicit_configuration_and_keys():
    with pytest.raises(ValueError): Settings(cors_origins=()).validate_production()
    with pytest.raises(ValueError): Settings(ai_provider='groq',cors_origins=('https://frontend.example',)).validate_production()
    with pytest.raises(ValueError): production(environment='development').validate_production()
    Settings(ai_enabled=False,cors_origins=('https://frontend.example',)).validate_production()
    with pytest.raises(ValidationError): Settings(trusted_proxy_cidrs=('0.0.0.0/0',))
    with pytest.raises(ValidationError): Settings(ai_fallback_enabled=True)
    with pytest.raises(ValidationError): Settings(ai_fallback_enabled=True,groq_api_key='x',gemini_api_key='y')


def test_new_environment_settings_are_parsed_and_override_file(tmp_path,monkeypatch):
    path=tmp_path/'.env';path.write_text('AI_ENABLED=false\nGLOBAL_REQUESTS_PER_MINUTE=5\nTRUSTED_PROXY_CIDRS=10.0.0.0/24\n')
    monkeypatch.delenv('AI_ENABLED',raising=False);monkeypatch.delenv('GLOBAL_REQUESTS_PER_MINUTE',raising=False)
    monkeypatch.delenv('TRUSTED_PROXY_CIDRS',raising=False)
    assert not Settings.from_env(path).ai_enabled
    assert Settings.from_env(path).global_requests_per_minute==5
    monkeypatch.setenv('AI_ENABLED','true')
    assert Settings.from_env(path).ai_enabled


def limiter(clock,**kwargs):
    return RequestLimits(None,Settings(**kwargs),clock=lambda:clock[0])


def test_sliding_client_global_daily_windows():
    clock=[0.0]; limit=limiter(clock,client_requests_per_minute=1,global_requests_per_minute=2,global_requests_per_day=3)
    assert limit.admit(b'a')==(None,None)
    assert limit.admit(b'a')==('RATE_LIMITED',60)
    assert limit.admit(b'b')==(None,None)
    assert limit.admit(b'c')==('RATE_LIMITED',60)
    clock[0]=60.1
    assert limit.admit(b'a')==(None,None)
    assert limit.admit(b'd')[0]=='RATE_LIMITED'
    assert 86339<=limit.admit(b'd')[1]<=86400
    clock[0]=86400.1
    assert limit.admit(b'a')==(None,None)


def test_client_memory_is_bounded_without_eviction_bypass():
    clock=[0.0]; limit=limiter(clock,max_rate_limit_clients=1)
    limit.admit(b'a')
    assert limit.admit(b'b')==('SERVER_BUSY',60) and len(limit.clients)==1
    clock[0]=61
    assert limit.admit(b'b')==(None,None) and len(limit.clients)==1


def scope(peer,xff):
    return dict(type='http',path='/api/define',method='POST',client=(peer,1),headers=[(b'x-forwarded-for',xff)])


def test_forwarded_identity_ignored_unless_explicitly_trusted():
    clock=[0.0]; limit=limiter(clock)
    assert limit.client_key(scope('10.1.1.1',b'1.2.3.4'))==limit.client_key(scope('10.1.1.1',b'5.6.7.8'))
    limit=limiter(clock,trusted_proxy_cidrs=('10.0.0.0/8',))
    assert limit.client_key(scope('10.1.1.1',b'1.2.3.4'))!=limit.client_key(scope('10.1.1.1',b'5.6.7.8'))
    # Walk from the trusted peer toward the nearest untrusted hop; no leftmost spoof.
    assert limit.client_key(scope('10.1.1.1',b'8.8.8.8, 1.2.3.4, 10.1.2.3'))==limit.client_key(scope('10.1.1.1',b'1.2.3.4'))
    assert limit.client_key(scope('10.1.1.1',b'bad'))==limit.client_key(scope('10.1.1.1',b''))


def test_rate_limit_envelope_cors_and_offline_health(caplog):
    settings=Settings(ai_provider='groq',client_requests_per_minute=1,environment='development')
    with TestClient(create_app(settings)) as client:
        first=client.post('/api/define',json={})
        assert first.status_code==422
        response=client.post('/api/define',json={},headers={'Origin':'http://localhost:5173','X-Forwarded-For':'1.2.3.4'})
        assert response.status_code==429 and response.json()['error']['code']=='RATE_LIMITED'
        assert int(response.headers['retry-after'])>=1
        assert response.headers['access-control-allow-origin']=='http://localhost:5173'
        assert 'Retry-After' in response.headers['access-control-expose-headers']
        assert response.headers['x-request-id'] and response.headers['cache-control']=='no-store'
        assert client.get('/api/health').status_code==200
        assert client.get('/docs').status_code==200


def test_kill_switch_blocks_all_ai_and_closes_no_provider():
    settings=Settings(ai_enabled=False)
    with patch('app.ai.providers.create_provider',wraps=create_provider),patch('app.ai.client.genai.Client') as constructor:
        with TestClient(create_app(settings)) as client:
            for name in ('read','simplify','define','explain','prepare-understanding','check-understanding'):
                response=client.post('/api/'+name,json={})
                assert response.status_code==501 and response.json()['error']['code']=='FEATURE_UNAVAILABLE'
            assert client.get('/api/health').status_code==200
            assert client.get('/docs').status_code==404
        constructor.assert_not_called()
    async def execute():
        async with create_provider(settings) as provider:
            with pytest.raises(AIError): await provider.generate(operation='define',data={},system_instruction='x')
    asyncio.run(execute())


def test_concurrency_admission_and_cancel_cleanup():
    async def execute():
        entered=asyncio.Event(); release=asyncio.Event()
        async def app(scope,receive,send):
            entered.set();await release.wait()
        limit=RequestLimits(app,Settings())
        sc={**scope('1.2.3.4',b''),'state':{'request_id':'test-request'},'query_string':b''}
        task1=asyncio.create_task(limit(sc,None,AsyncMock()))
        await entered.wait()
        task2=asyncio.create_task(limit(sc,None,AsyncMock()))
        await asyncio.sleep(0)
        send=AsyncMock();await limit(sc,None,send)
        assert send.call_args_list[0].args[0]['status']==503
        task1.cancel()
        with pytest.raises(asyncio.CancelledError): await task1
        release.set();await task2
        assert limit.active==0
    asyncio.run(execute())


def test_request_logging_never_includes_query_or_body(caplog):
    import logging
    caplog.set_level(logging.INFO,logger='uvicorn.error.mindbridge')
    with TestClient(create_app(Settings(ai_enabled=False))) as client:
        client.post('/api/define?answer=SECRET_MARKER',content=b'SECRET_MARKER')
        client.get('/SECRET_MARKER')
    assert 'request_completed' in caplog.text and 'SECRET_MARKER' not in caplog.text


def test_huge_content_length_is_rejected_without_integer_conversion():
    with TestClient(create_app(Settings())) as client:
        response=client.post('/api/read',content=b'',headers={'Content-Length':'9'*5000})
        assert response.status_code==413


def test_stalled_upload_has_total_deadline_and_releases_slot(monkeypatch):
    monkeypatch.setattr(Settings,'read_deadline_seconds',0.01)
    async def execute():
        async def stalled(scope,receive,send):
            await asyncio.Event().wait()
        limit=RequestLimits(stalled,Settings())
        sc={**scope('1.2.3.4',b''),'path':'/api/read','state':{'request_id':'synthetic'}}
        send=AsyncMock()
        await limit(sc,None,send)
        assert send.call_args_list[0].args[0]['status']==504
        assert limit.active==0
    asyncio.run(execute())
