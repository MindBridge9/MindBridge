"""B05 real handler/adapter with mocked provider transport; no live requests."""
import copy
import json
from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock, patch

import pytest
from fastapi.testclient import TestClient
from google.genai import errors, types

from app.config import Settings
from app.main import create_app
from app.schemas.content import SimplificationResult, SimplifyRequest
from app.schemas.errors import APIError

SOURCE='Green plants use light energy from sunlight to make glucose from carbon dioxide and water during photosynthesis.'
SECOND='The sample contains 20 mL of water on 12 March 2024 if light is available.'
EASY='Plants use light energy from sunlight. They make glucose from carbon dioxide and water. This process is photosynthesis.'


def request_body():
    return {'source':{'page_id':'11111111-1111-4111-8111-111111111111','chunks':[
        dict(id='c0001',kind='paragraph',text=SOURCE,quality='clear'),
        dict(id='c0002',kind='paragraph',text=SECOND,quality='clear'),
        dict(id='c0003',kind='caption',text='Partial caption',quality='uncertain')],
        'key_terms':[dict(term='glucose',chunk_ids=['c0001']),dict(term='photosynthesis',chunk_ids=['c0001']),
                     dict(term='water',chunk_ids=['c0001','c0002'])],'key_terms_status':'available'},
        'chunk_ids':['c0001'],'level':'easy'}


def result(ids=('c0001',)):
    return {'items':[{'chunk_id':i,'text':EASY if i=='c0001' else SECOND,
                      'source_quotes':[SOURCE if i=='c0001' else SECOND]} for i in ids]}


def output(value,reason='STOP'):
    return types.GenerateContentResponse(candidates=[types.Candidate(finish_reason=reason,
        content=types.Content(parts=[types.Part.from_text(text=value if isinstance(value,str) else json.dumps(value))]))])


@pytest.fixture
def api():
    provider=SimpleNamespace(models=SimpleNamespace(generate_content=AsyncMock(return_value=output(result()))),aclose=AsyncMock())
    owner=SimpleNamespace(aio=provider,close=Mock())
    app=create_app(Settings(gemini_api_key='synthetic-secret',environment='development'))
    with patch('app.ai.client.genai.Client',return_value=owner):
        with TestClient(app) as client:
            yield client,provider
    provider.aclose.assert_awaited_once()


def post(api,body=None):
    return api[0].post('/api/simplify',json=request_body() if body is None else body)


def error(response,status,code):
    assert response.status_code==status,response.text
    parsed=APIError.model_validate(response.json()).error
    assert parsed.code==code
    assert parsed.request_id==response.headers['x-request-id']
    assert response.headers['cache-control']=='no-store'
    assert 'synthetic-secret' not in response.text
    return parsed


def test_real_route_structure_evidence_factguard_and_provider_settings(api):
    body=request_body(); before=copy.deepcopy(body)
    response=post(api,body)
    assert response.status_code==200
    parsed=SimplificationResult.model_validate(response.json())
    assert parsed.page_id==body['source']['page_id'] and parsed.level=='easy'
    item=parsed.items[0]
    assert item.text==EASY and item.source_refs[0].quote==SOURCE
    assert item.preserved_terms==['glucose','photosynthesis','water']
    assert item.warnings==[] and item.terminology_check_status=='checked'
    assert body==before
    sent=api[1].models.generate_content.call_args.kwargs
    config=sent['config']
    assert config.max_output_tokens==4096 and config.http_options.timeout<=15000
    assert config.thinking_config.thinking_level=='MINIMAL'
    assert config.http_options.retry_options.attempts==1 and not config.automatic_continuation
    assert 'warnings' not in json.dumps(config.response_json_schema)
    assert 'source_quotes' in json.dumps(config.response_json_schema)
    data=json.loads(sent['contents'][0].parts[0].text)
    assert [c['id'] for c in data['source']['chunks']]==['c0001']
    assert data['source']['key_terms'][-1]['chunk_ids']==['c0001']
    assert 'Partial caption' not in json.dumps(data)
    assert 'untrusted data' in config.system_instruction
    assert api[1].models.generate_content.await_count==1


def test_request_order_is_preserved_when_model_order_differs(api):
    body=request_body(); body['chunk_ids']=['c0002','c0001']
    api[1].models.generate_content.return_value=output(result(('c0001','c0002')))
    parsed=SimplificationResult.model_validate(post(api,body).json())
    assert [i.chunk_id for i in parsed.items]==body['chunk_ids']


@pytest.mark.parametrize('level',['guided'])
def test_known_unsupported_levels_do_not_call_provider(api,level):
    body=request_body(); body['level']=level
    error(post(api,body),501,'FEATURE_UNAVAILABLE')
    api[1].models.generate_content.assert_not_called()


@pytest.mark.parametrize('change',[
    lambda b:b.update(level='advanced'),lambda b:b.update(chunk_ids=[]),
    lambda b:b.update(level='original'),
    lambda b:b.update(chunk_ids=['c0001','c0001']),lambda b:b.update(chunk_ids=['c0099']),
    lambda b:b.update(chunk_ids=['c0001']*4),lambda b:b.update(extra='sensitive'),
    lambda b:b['source'].pop('key_terms'),lambda b:b['source'].pop('key_terms_status'),
    lambda b:b['source'].update(key_terms_status='unavailable'),
    lambda b:b['source']['chunks'].append(b['source']['chunks'][0]),
    lambda b:b['source']['key_terms'][0].update(chunk_ids=['c0099']),
    lambda b:b['source']['key_terms'][0].update(term='at'),
])
def test_invalid_request_relationships_skip_provider(api,change):
    body=request_body(); change(body)
    error(post(api,body),422,'VALIDATION_ERROR')
    api[1].models.generate_content.assert_not_called()


def test_uncertain_selection_rejected(api):
    body=request_body(); body['chunk_ids']=['c0003']
    error(post(api,body),422,'INSUFFICIENT_SOURCE')
    api[1].models.generate_content.assert_not_called()


@pytest.mark.parametrize('bad',[
    '{', {'items':[]}, {'items':[dict(chunk_id='c0099',text='Text.',source_quotes=[SOURCE])]},
    {'items':result()['items']*2},
    {'items':[dict(chunk_id='c0001',text=' ',source_quotes=[SOURCE])]},
    {'items':[dict(chunk_id='c0001',text='x'*4501,source_quotes=[SOURCE])]},
    {'items':[dict(chunk_id='c0001',text=EASY,source_quotes=[])]},
    {'items':[dict(chunk_id='c0001',text=EASY,source_quotes=[SOURCE,SOURCE])]},
    {'items':[dict(chunk_id='c0001',text=EASY,source_quotes=['green plants'])]},
    {'items':[dict(chunk_id='c0001',text=EASY,source_quotes=['Green  plants'])]},
    {'items':[dict(chunk_id='c0001',text=EASY,source_quotes=[SECOND])]},
    {'items':[dict(chunk_id='c0001',text=EASY,source_quotes=[SOURCE],warnings=[])]},
    {'items':result()['items'],'page_id':'invented'},
])
def test_malformed_output_bad_ids_quotes_and_model_claims_share_retry_budget(api,bad):
    api[1].models.generate_content.return_value=output(bad)
    error(post(api),502,'AI_INVALID_RESPONSE')
    assert api[1].models.generate_content.await_count==2


def test_relational_repair_uses_only_existing_second_attempt(api):
    bad=result(); bad['items'][0]['source_quotes']=['invented quote']
    api[1].models.generate_content.side_effect=[output(bad),output(result())]
    assert post(api).status_code==200
    assert api[1].models.generate_content.await_count==2


def test_partial_item_set_cannot_be_returned_as_success(api):
    body=request_body(); body['chunk_ids']=['c0001','c0002']
    error(post(api,body),502,'AI_INVALID_RESPONSE')
    assert api[1].models.generate_content.await_count==2


def test_deterministic_number_unit_date_and_term_warnings(api):
    body=request_body(); body['chunk_ids']=['c0002']
    api[1].models.generate_content.return_value=output({'items':[dict(chunk_id='c0002',text='The sample is present.',source_quotes=[SECOND])]})
    item=SimplificationResult.model_validate(post(api,body).json()).items[0]
    assert {w.code for w in item.warnings}=={'missing_number','missing_unit','missing_date','missing_term'}
    assert item.preserved_terms==[] and item.terminology_check_status=='checked'
    assert all(w.source_value in SECOND and w.generated_value is None for w in item.warnings)
    assert all('may' in w.message for w in item.warnings)
    assert api[1].models.generate_content.await_count==1


def test_changed_number_has_exact_values_from_factguard(api):
    body=request_body(); body['chunk_ids']=['c0002']
    api[1].models.generate_content.return_value=output({'items':[dict(chunk_id='c0002',text=SECOND.replace('20','25',1),source_quotes=[SECOND])]})
    item=SimplificationResult.model_validate(post(api,body).json()).items[0]
    warning=next(w for w in item.warnings if w.code=='changed_number')
    assert (warning.source_value,warning.generated_value)==('20','25')


@pytest.mark.parametrize('status,expected',[('available','checked'),('unavailable','unavailable')])
def test_empty_terminology_metadata_is_honest(api,status,expected):
    body=request_body(); body['source'].update(key_terms=[],key_terms_status=status)
    item=SimplificationResult.model_validate(post(api,body).json()).items[0]
    assert item.terminology_check_status==expected and item.preserved_terms==[]


@pytest.mark.parametrize('provider_error,status,code,attempts',[
    (errors.APIError(503,{'error':{'message':'synthetic-secret'}}),503,'AI_UNAVAILABLE',2),
    (errors.APIError(429,{'error':{'message':'synthetic-secret'}}),429,'AI_QUOTA_EXHAUSTED',1),
    (errors.APIError(404,{'error':{'message':'synthetic-secret'}}),503,'AI_UNAVAILABLE',1),
    (TimeoutError(),504,'AI_TIMEOUT',2),
])
def test_provider_errors_preserve_safe_envelope_and_original_input(api,provider_error,status,code,attempts,caplog):
    body=request_body(); before=copy.deepcopy(body)
    api[1].models.generate_content.side_effect=provider_error
    error(post(api,body),status,code)
    assert api[1].models.generate_content.await_count==attempts and body==before
    assert 'synthetic-secret' not in caplog.text


def test_provider_refusal_is_not_retried(api):
    api[1].models.generate_content.return_value=output({},reason='SAFETY')
    error(post(api),422,'CONTENT_UNSUPPORTED')
    assert api[1].models.generate_content.await_count==1


def test_malformed_json_and_wrong_content_type(api):
    error(api[0].post('/api/simplify',content='{',headers={'Content-Type':'application/json'}),400,'INVALID_REQUEST')
    error(api[0].post('/api/simplify',content='text',headers={'Content-Type':'text/plain'}),415,'INVALID_REQUEST')
    api[1].models.generate_content.assert_not_called()


def test_declared_and_streamed_body_caps_precede_json_validation(api):
    error(api[0].post('/api/simplify',content='',headers={'Content-Type':'application/json','Content-Length':'262145'}),413,'REQUEST_TOO_LARGE')
    def body():
        yield b'{"source":"'
        yield b'x'*262144
        yield b'"}'
    error(api[0].post('/api/simplify',content=body(),headers={'Content-Type':'application/json'}),413,'REQUEST_TOO_LARGE')
    api[1].models.generate_content.assert_not_called()


def test_swagger_contract_and_capability_gate_remain_honest(api):
    operation=api[0].get('/openapi.json').json()['paths']['/api/simplify']['post']
    assert operation['operationId']=='simplify'
    assert operation['requestBody']['content']['application/json']['schema']['$ref'].endswith('/SimplifyRequest')
    assert operation['responses']['200']['content']['application/json']['schema']['$ref'].endswith('/SimplificationResult')
    assert not any(api[0].get('/api/health').json()['capabilities'].values())


def test_service_does_not_mutate_pydantic_request(api):
    import asyncio
    from app.services.reading import simplify_text
    from app.ai.client import GeminiAdapter
    request=SimplifyRequest.model_validate(request_body()); before=request.model_dump()
    async def execute():
        async with GeminiAdapter(Settings(),client=SimpleNamespace(models=api[1].models,aclose=AsyncMock())) as adapter:
            return await simplify_text(adapter,request)
    assert asyncio.run(execute()).items[0].text==EASY
    assert request.model_dump()==before


def test_transient_failure_then_invalid_evidence_never_gets_third_attempt(api):
    bad=result(); bad['items'][0]['source_quotes']=['invented']
    api[1].models.generate_content.side_effect=[errors.APIError(503,{'error':{'message':'temporary'}}),output(bad)]
    error(post(api),502,'AI_INVALID_RESPONSE')
    assert api[1].models.generate_content.await_count==2


def test_three_clear_chunks_are_supported(api):
    body=request_body(); body['chunk_ids']=['c0003','c0002','c0001']
    third='Plants release oxygen.'
    body['source']['chunks'][2].update(kind='paragraph',text=third,quality='clear')
    response=result(('c0001','c0002'))
    response['items'].append(dict(chunk_id='c0003',text=third,source_quotes=[third]))
    api[1].models.generate_content.return_value=output(response)
    parsed=SimplificationResult.model_validate(post(api,body).json())
    assert [i.chunk_id for i in parsed.items]==body['chunk_ids']


@pytest.mark.parametrize('term',['Newton','if light is available'])
def test_explicit_name_or_condition_omission_is_a_possible_term_warning(api,term):
    body=request_body(); original='The source explicitly mentions '+term+'.'
    body['source']['chunks'][0]['text']=original
    body['source']['key_terms']=[dict(term=term,chunk_ids=['c0001'])]
    api[1].models.generate_content.return_value=output({'items':[dict(chunk_id='c0001',text='The source mentions a detail.',source_quotes=[original])]})
    item=SimplificationResult.model_validate(post(api,body).json()).items[0]
    assert [(w.code,w.source_value) for w in item.warnings]==[('missing_term',term)]


def test_endpoint_total_deadline_cancels_provider_wait(api):
    import asyncio
    class ShortSettings(Settings):
        text_deadline_seconds=0.03
    api[0].app.state.settings=ShortSettings()
    async def slow(**kwargs):
        await asyncio.sleep(1)
    api[1].models.generate_content.side_effect=slow
    response=post(api)
    error(response,504,'AI_TIMEOUT')
    assert api[1].models.generate_content.await_count==1


def test_error_is_cors_readable_and_does_not_echo_source(api):
    body=request_body(); body['chunk_ids']=['c0099']
    response=api[0].post('/api/simplify',json=body,headers={'Origin':'http://localhost:5173'})
    error(response,422,'VALIDATION_ERROR')
    assert response.headers['access-control-allow-origin']=='http://localhost:5173'
    assert SOURCE not in response.text
