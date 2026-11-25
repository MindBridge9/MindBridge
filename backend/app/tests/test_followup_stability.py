"""Focused follow-up generation regressions across both provider adapters."""
import copy
import pytest
from app.tests.test_prepare import api
from app.tests.test_evaluation import evaluation_request, feedback, post, repair_post


def test_real_uuid_criterion_ids_assigned_from_assessments(api):
    data=evaluation_request('misconception')
    ids=['criterion-6e946780e0ab40778b191ada4072b20d','criterion-faba151c2aab4d3b9ab4c176615fbd6d']
    for c,id in zip(data['plan']['objective']['criteria'],ids): c['id']=id
    data['question']['criterion_ids']=ids[:]; data['plan']['initial_question']['criterion_ids']=ids[:]
    result=feedback('misconception')
    for a,id in zip(result['assessments'],ids): a['criterion_id']=id
    result['assessments'].reverse()
    api[1]['outcomes']=[result]; before=copy.deepcopy(data)
    response=post(api,data); assert response.status_code==200,response.text
    follow=response.json()['attempt']['feedback']['follow_up_question']
    assert follow['criterion_ids']==ids[:1] and follow['text']==result['follow_up_question']['text']
    assert data==before and len(api[1]['calls'])==1


@pytest.mark.parametrize('text',[evaluation_request()['question']['text'].upper(),
    'Sunlight supplies light energy. Explain this.'])
def test_repetition_and_literal_answer_leakage_still_fail(api,text):
    result=feedback('misconception'); result['follow_up_question']['text']=text
    api[1]['outcomes']=[result,result]
    response=repair_post(api,evaluation_request('misconception'))
    assert response.status_code==502 and len(api[1]['calls'])==2


@pytest.mark.parametrize('ids',[['materials'],['energy','materials'],['unknown']])
def test_model_cannot_choose_or_expand_followup_ids(api,ids):
    result=feedback('misconception'); result['follow_up_question']['criterion_ids']=ids
    api[1]['outcomes']=[result,result]
    assert repair_post(api,evaluation_request('misconception')).status_code==502


def test_multiple_misconceptions_keep_their_priority_in_question_order(api):
    data=evaluation_request('misconception'); result=feedback('misconception')
    result['assessments'][1].update(status='possible_misconception',student_quote=data['answer'])
    api[1]['outcomes']=[result]
    response=post(api,data); assert response.status_code==200,response.text
    assert response.json()['attempt']['feedback']['follow_up_question']['criterion_ids']==['energy','materials']


def test_internal_provider_schema_has_no_followup_id_choice():
    from app.services.learning import EvaluationOutput
    from app.ai.groq import strict_schema
    for schema in (EvaluationOutput.model_json_schema(),strict_schema(EvaluationOutput)):
        assert set(schema['$defs']['FollowUpOutput']['properties'])=={'text'}
        assert schema['$defs']['FollowUpOutput']['additionalProperties'] is False
