"""Independent B09 tools, offline provider validation across Groq/Gemini."""
import copy
import pytest
from app.ai.client import AIError
from app.schemas.content import GlossaryEntry, ConceptExplanation
from app.tests.test_prepare import api, request as prepare_request, TEXT


def request(tool):
    source=prepare_request()['source']
    base=dict(source=source,chunk_id='c0001',language='en')
    base.update(dict(phrase='glucose',surrounding_sentence=TEXT) if tool=='define' else dict(concept='The role of sunlight'))
    return base


def output(tool):
    refs=[dict(chunk_id='c0001',quote=TEXT)]
    if tool=='define':
        return dict(supported=True,definition='A sugar.',contextual_meaning='The substance plants make in photosynthesis.',example=None,source_refs=refs)
    return dict(supported=True,text='Plants use light energy to make glucose from carbon dioxide and water.',important_terms=['light energy','glucose'],source_refs=refs)


def post(api,tool,data=None):
    return api[0].post('/api/'+tool,json=request(tool) if data is None else data)


@pytest.mark.parametrize('tool',['define','explain'])
def test_grounded_success_and_immutability(api,tool):
    data=request(tool); before=copy.deepcopy(data); api[1]['outcomes']=[output(tool)]
    response=post(api,tool,data); assert response.status_code==200,response.text
    result=(GlossaryEntry if tool=='define' else ConceptExplanation).model_validate(response.json())
    assert result.language=='en' and data==before and len(api[1]['calls'])==1
    assert all(r.quote in TEXT for r in result.source_refs)
    if tool=='define': assert result.phrase==data['phrase'] and result.example is None
    else: assert result.page_id==data['source']['page_id'] and result.concept==data['concept']
    assert 'supported' not in response.json() and response.headers['cache-control']=='no-store'


@pytest.mark.parametrize('tool',['define','explain'])
@pytest.mark.parametrize('change',['uncertain','missing_chunk','duplicate_id','bad_terms','language'])
def test_invalid_source_before_provider(api,tool,change):
    data=request(tool)
    if change=='uncertain': data['source']['chunks'][0]['quality']='uncertain'
    if change=='missing_chunk': data['chunk_id']='c0099'
    if change=='duplicate_id': data['source']['chunks']*=2
    if change=='bad_terms': data['source'].update(key_terms_status='available',key_terms=[{'term':'soil','chunk_ids':['c0001']}])
    if change=='language': data['language']='hi'
    assert post(api,tool,data).status_code==422 and not api[1]['calls']


@pytest.mark.parametrize('change',['phrase_absent','substring','sentence_changed','phrase_outside_sentence'])
def test_definition_sentence_and_phrase(api,change):
    data=request('define')
    if change=='phrase_absent': data['phrase']='soil'
    if change=='substring': data['phrase']='gluc'
    if change=='sentence_changed': data['surrounding_sentence']=TEXT.lower()
    if change=='phrase_outside_sentence': data['surrounding_sentence']='Green plants'
    assert post(api,'define',data).status_code==422 and not api[1]['calls']


@pytest.mark.parametrize('tool',['define','explain'])
@pytest.mark.parametrize('change',['quote','chunk','empty_refs','extra','long'])
def test_bad_output_bounded_recovery(api,tool,change):
    bad=output(tool)
    if change=='quote': bad['source_refs'][0]['quote']='Invented wording'
    if change=='chunk': bad['source_refs'][0]['chunk_id']='c0099'
    if change=='empty_refs': bad['source_refs']=[]
    if change=='extra': bad['confidence']=0.99
    if change=='long': bad['definition' if tool=='define' else 'text']='x'*1600
    api[1]['outcomes']=[bad,output(tool)]
    from unittest.mock import patch
    with patch('app.ai.client._backoff',return_value=0),patch('app.ai.groq._backoff',return_value=0):
        assert post(api,tool).status_code==200
    assert len(api[1]['calls'])==2


@pytest.mark.parametrize('terms',[['glucose','GLUCOSE'],['soil'],['photosynthesis']])
def test_important_terms_must_be_unique_in_source_and_output(api,terms):
    bad=output('explain'); bad['important_terms']=terms; api[1]['outcomes']=[bad,bad]
    from unittest.mock import patch
    with patch('app.ai.client._backoff',return_value=0),patch('app.ai.groq._backoff',return_value=0):
        assert post(api,'explain').status_code==502


@pytest.mark.parametrize('tool',['define','explain'])
def test_insufficient_context_is_not_fabricated(api,tool):
    result=output(tool); result.update(supported=False,source_refs=[])
    if tool=='define': result.update(definition=None,contextual_meaning=None,example=None)
    else: result.update(text=None,important_terms=[])
    api[1]['outcomes']=[result]
    assert post(api,tool).status_code==422 and len(api[1]['calls'])==1


@pytest.mark.parametrize('tool',['define','explain'])
@pytest.mark.parametrize('code,status',[('AI_TIMEOUT',504),('RATE_LIMITED',429),('AI_QUOTA_EXHAUSTED',429),('CONTENT_UNSUPPORTED',422),('AI_UNAVAILABLE',503)])
def test_provider_errors_remain_errors(api,tool,code,status):
    api[1]['outcomes']=[AIError(code,status,'Try later.')]
    response=post(api,tool); assert response.status_code==status and response.json()['error']['code']==code


@pytest.mark.parametrize('tool',['define','explain'])
def test_uncertain_neighbour_not_sent_and_json_limits(api,tool):
    data=request(tool); data['source']['chunks'].append(dict(id='c0002',kind='paragraph',text='PRIVATE_UNCERTAIN',quality='uncertain'))
    api[1]['outcomes']=[output(tool)]; assert post(api,tool,data).status_code==200
    call=api[1]['calls'][0]
    body=call['messages'][1]['content'][0]['text'] if 'messages' in call else call['contents'][0].parts[0].text
    assert 'PRIVATE_UNCERTAIN' not in body
    assert api[0].post('/api/'+tool,content='x',headers={'Content-Type':'text/plain'}).status_code==415
    assert api[0].post('/api/'+tool,content='x'*262145,headers={'Content-Type':'application/json'}).status_code==413
