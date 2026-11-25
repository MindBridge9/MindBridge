"""B06 offline endpoint and shared-adapter checks; synthetic source only."""
import copy
import json
from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock, patch

import httpx
import pytest
from fastapi.testclient import TestClient

from app.ai.groq import GroqAdapter
from app.config import Settings
from app.main import create_app
from app.schemas.learning import LearningPlan
from app.tests.test_read import output

TEXT = 'Green plants use light energy from sunlight to make glucose from carbon dioxide and water during photosynthesis.'


def request():
    return dict(source=dict(page_id='11111111-1111-4111-8111-111111111111', chunks=[
        dict(id='c0001', kind='paragraph', text=TEXT, quality='clear')], key_terms=[], key_terms_status='unavailable'),
        chunk_id='c0001', target_concept='How plants make glucose')


def prepared():
    return dict(sufficient=True, target_concept='How plants make glucose',
        objective='Distinguish energy from materials in photosynthesis.', criteria=[
            dict(description='Sunlight supplies light energy.', possible_misconception='Sunlight is a material ingredient.',
                 source_refs=[dict(chunk_id='c0001', quote='light energy from sunlight')]),
            dict(description='Carbon dioxide and water are used to make glucose.', possible_misconception=None,
                 source_refs=[dict(chunk_id='c0001', quote='make glucose from carbon dioxide and water')])],
        question='Explain the different roles of sunlight, carbon dioxide and water when a plant makes glucose.',
        question_criterion_indexes=[1, 2])


@pytest.fixture(params=['gemini', 'groq'])
def api(request):
    state = dict(outcomes=[prepared()], calls=[])
    if request.param == 'gemini':
        async def generate(**kwargs):
            state['calls'].append(kwargs)
            value = state['outcomes'].pop(0)
            if isinstance(value, Exception): raise value
            return output(value)
        provider = SimpleNamespace(models=SimpleNamespace(generate_content=AsyncMock(side_effect=generate)), aclose=AsyncMock())
        owner = SimpleNamespace(aio=provider, close=Mock())
        with patch('app.ai.client.genai.Client', return_value=owner):
            with TestClient(create_app(Settings(gemini_api_key='synthetic'))) as client:
                yield client, state
    else:
        async def handle(req):
            state['calls'].append(json.loads(req.content))
            value = state['outcomes'].pop(0)
            if isinstance(value, Exception): raise value
            if isinstance(value, httpx.Response): return value
            return httpx.Response(200, json={'choices':[{'finish_reason':'stop','message':{'content':json.dumps(value)}}]})
        adapter = GroqAdapter(Settings(groq_api_key='synthetic'), client=httpx.AsyncClient(transport=httpx.MockTransport(handle)))
        with patch('app.ai.providers.create_provider', return_value=adapter):
            with TestClient(create_app(Settings(ai_provider='groq'))) as client:
                yield client, state


def post(api, data=None):
    return api[0].post('/api/prepare-understanding', json=request() if data is None else data)


def test_valid_plan(api):
    data=request(); before=copy.deepcopy(data)
    response=post(api, data)
    assert response.status_code==200, response.text
    plan=LearningPlan.model_validate(response.json())
    assert plan.page_id==data['source']['page_id'] and plan.chunk_id==data['chunk_id']
    assert plan.target_concept==data['target_concept']
    assert len(plan.objective.criteria)==2
    assert set(plan.initial_question.criterion_ids)=={c.id for c in plan.objective.criteria}
    ids=[plan.id,plan.objective.id,plan.initial_question.id,*[c.id for c in plan.objective.criteria]]
    assert len(ids)==len(set(ids)) and all(len(i)<=80 for i in ids)
    assert all(r.quote in TEXT for c in plan.objective.criteria for r in c.source_refs)
    assert 'possible_misconception' not in response.text
    assert data==before and len(api[1]['calls'])==1
    assert response.headers['cache-control']=='no-store' and response.headers['x-request-id']


@pytest.mark.parametrize('change', ['uncertain','heading','missing','duplicate_id','bad_term','answer'])
def test_invalid_request_no_provider(api, change):
    data=request()
    if change=='uncertain': data['source']['chunks'][0]['quality']='uncertain'
    if change=='heading': data['source']['chunks'][0]['kind']='heading'
    if change=='missing': data['chunk_id']='c0099'
    if change=='duplicate_id': data['source']['chunks']*=2
    if change=='bad_term': data['source'].update(key_terms_status='available',key_terms=[{'term':'soil','chunk_ids':['c0001']}])
    if change=='answer': data['answer']='student answer'
    response=post(api,data)
    assert response.status_code==422
    assert not api[1]['calls']


@pytest.mark.parametrize('change', ['quote','chunk','duplicate','too_few','too_many','empty_subset','unknown_index',
                                   'duplicate_index','answer_leak','concept','extra','empty_description'])
def test_bad_output_uses_one_shared_retry(api, change):
    bad=prepared()
    if change=='quote': bad['criteria'][0]['source_refs'][0]['quote']='Light energy from sunlight'
    if change=='chunk': bad['criteria'][0]['source_refs'][0]['chunk_id']='c0099'
    if change=='duplicate': bad['criteria'][1]['description']='SUNLIGHT supplies light energy!'
    if change=='too_few': bad['criteria']=bad['criteria'][:1]
    if change=='too_many': bad['criteria']*=3
    if change=='empty_subset': bad['question_criterion_indexes']=[]
    if change=='unknown_index': bad['question_criterion_indexes']=[3]
    if change=='duplicate_index': bad['question_criterion_indexes']=[1,1]
    if change=='answer_leak': bad['question']='Sunlight supplies light energy. Explain this.'
    if change=='concept': bad['target_concept']='Unrelated concept'
    if change=='extra': bad['score']=100
    if change=='empty_description': bad['criteria'][0]['description']='  '
    api[1]['outcomes']=[bad,prepared()]
    with patch('app.ai.client._backoff', return_value=0), patch('app.ai.groq._backoff', return_value=0):
        assert post(api).status_code==200
    assert len(api[1]['calls'])==2


def test_exhausted_output_budget_returns_safe_error(api):
    api[1]['outcomes']=[{},{}]
    with patch('app.ai.client._backoff', return_value=0), patch('app.ai.groq._backoff', return_value=0):
        response=post(api)
    assert response.status_code==502 and response.json()['error']['code']=='AI_INVALID_RESPONSE'
    assert len(api[1]['calls'])==2


def test_insufficient_source(api):
    data=request(); data['source']['chunks'][0]['text']='Glucose.'
    api[1]['outcomes']=[dict(sufficient=False,target_concept=None,objective=None,criteria=[],question=None,question_criterion_indexes=[])]
    response=post(api,data)
    assert response.status_code==422 and response.json()['error']['code']=='INSUFFICIENT_SOURCE'
    assert len(api[1]['calls'])==1


def test_omitted_concept_and_uncertain_neighbour(api):
    data=request(); del data['target_concept']
    data['source']['chunks'].append(dict(id='c0002',kind='paragraph',quality='uncertain',text='PRIVATE-UNCERTAIN-FRAGMENT'))
    response=post(api,data)
    assert response.status_code==200
    call=api[1]['calls'][0]
    if 'messages' in call: text=json.dumps(call)
    else: text=call['contents'][0].parts[0].text
    assert 'PRIVATE-UNCERTAIN-FRAGMENT' not in text


def test_body_boundaries(api):
    assert api[0].post('/api/prepare-understanding',content='x',headers={'Content-Type':'text/plain'}).status_code==415
    assert api[0].post('/api/prepare-understanding',content='x'*262145,headers={'Content-Type':'application/json'}).status_code==413
    assert not api[1]['calls']


def test_prepare_openapi(api):
    # Development docs are disabled in this fixture; inspect app schema directly.
    operation=api[0].app.openapi()['paths']['/api/prepare-understanding']['post']
    assert operation['requestBody']['content']['application/json']['schema']['$ref'].endswith('/PrepareRequest')
    assert operation['responses']['200']['content']['application/json']['schema']['$ref'].endswith('/LearningPlan')


def test_only_question_subset_is_mapped(api):
    data=prepared(); data['question_criterion_indexes']=[2]
    api[1]['outcomes']=[data]
    response=post(api)
    assert response.status_code==200
    plan=response.json()
    assert plan['initial_question']['criterion_ids']==[plan['objective']['criteria'][1]['id']]


def test_false_insufficiency_with_fabricated_plan_rejected(api):
    bad=prepared(); bad['sufficient']=False
    api[1]['outcomes']=[bad,prepared()]
    with patch('app.ai.client._backoff',return_value=0),patch('app.ai.groq._backoff',return_value=0):
        assert post(api).status_code==200
    assert len(api[1]['calls'])==2


def test_misconception_annotation_cannot_be_correct_criterion(api):
    bad=prepared(); bad['criteria'][0]['description']+=' Misconception: sunlight is matter.'
    api[1]['outcomes']=[bad,prepared()]
    with patch('app.ai.client._backoff',return_value=0),patch('app.ai.groq._backoff',return_value=0):
        assert post(api).status_code==200
    assert len(api[1]['calls'])==2


@pytest.mark.parametrize('code,status', [('AI_TIMEOUT',504),('RATE_LIMITED',429),('AI_UNAVAILABLE',503),('CONTENT_UNSUPPORTED',422)])
def test_adapter_failures_preserve_safe_recovery(api,code,status):
    from app.ai.client import AIError
    api[1]['outcomes']=[AIError(code,status,'Try again.',retryable=status!=422)]
    response=post(api)
    assert response.status_code==status and response.json()['error']['code']==code
    assert len(api[1]['calls'])==1
