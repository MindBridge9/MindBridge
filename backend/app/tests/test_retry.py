"""B08 offline integrity/comparison tests; not evidence of provider quality."""
import copy
from unittest.mock import patch
import pytest
from app.ai.client import AIError
from app.schemas.learning import LearningAttempt, CriterionAssessment, AssistanceRecord
from app.services.learning import compare_retry
from app.tests.test_prepare import api
from app.tests.test_evaluation import evaluation_request, feedback, ANSWERS, post, repair_post


def retry_request(case='correct', narrow=True):
    data=evaluation_request('misconception'); baseline=feedback('misconception')
    baseline.pop('answer_interpretation'); baseline.pop('recovery'); baseline['recommendation']='try_retry'
    baseline['follow_up_question']=dict(id='question-retry',text=baseline['assessments'][0]['follow_up_question'],criterion_ids=['energy'])
    if not narrow:
        baseline['follow_up_question'].update(text='Explain the roles of sunlight, water and carbon dioxide when plants make glucose.',criterion_ids=['energy','materials'])
    for assessment,c in zip(baseline['assessments'],data['plan']['objective']['criteria']):
        assessment.pop('follow_up_question')
        assessment['source_refs']=copy.deepcopy(c['source_refs'])
    previous=dict(id='initial-attempt',plan_id=data['plan']['id'],question=copy.deepcopy(data['question']),
        answer=data['answer'],assistance=copy.deepcopy(data['assistance']),submitted_at='2026-11-25T12:00:00Z',feedback=baseline)
    data.update(previous_attempt=previous,attempt_id='retry-attempt',question=copy.deepcopy(baseline['follow_up_question']),answer=ANSWERS[case])
    return data


def retry_feedback(case='correct',narrow=True):
    result=feedback(case)
    for a in result['assessments']: a['follow_up_question']=None
    if narrow:
        result['assessments']=result['assessments'][:1]
    return result


@pytest.mark.parametrize('case',['correct','spelling','partial','misconception','ambiguous','missing'])
@pytest.mark.parametrize('assisted',[True,False])
def test_retry_states_and_independence(api,case,assisted):
    data=retry_request(case); before=copy.deepcopy(data)
    data['assistance']=dict(used=assisted,kinds=['hint'] if assisted else [])
    before=copy.deepcopy(data); api[1]['outcomes']=[retry_feedback(case)]
    response=post(api,data); assert response.status_code==200,response.text
    result=response.json(); assert data==before
    assert result['attempt']['answer']==data['answer'] and result['attempt']['question']==data['question']
    assert result['attempt']['assistance']==data['assistance']
    assert result['attempt']['feedback']['follow_up_question'] is None
    if case=='ambiguous':
        assert result['retry_result'] is None
        assert result['attempt']['feedback']['recommendation']=='clarify_answer'
        assert result['attempt']['feedback']['further_practice_useful'] is None
    else:
        compare=result['retry_result']; assert compare['independent_in_app']==(not assisted)
        assert compare['not_retested_ids']==['materials']
        assert compare['previous_attempt_id']=='initial-attempt' and compare['current_attempt_id']=='retry-attempt'
        good=case in ('correct','spelling','partial')
        assert compare['newly_demonstrated_ids']==(['energy'] if good else [])
        assert compare['still_needs_practice_ids']==([] if good else ['energy'])
        assert result['attempt']['feedback']['recommendation']==('read_original' if good else 'review_source')
    assert len(api[1]['calls'])==(0 if case=='ambiguous' else 1)


def test_partial_improvement_keeps_other_need_visible(api):
    data=retry_request('partial',narrow=False); api[1]['outcomes']=[retry_feedback('partial',narrow=False)]
    response=post(api,data); assert response.status_code==200,response.text
    result=response.json()['retry_result']
    assert result['newly_demonstrated_ids']==['energy'] and result['still_needs_practice_ids']==['materials']
    assert result['not_retested_ids']==[]


@pytest.mark.parametrize('change',['id','plan','question_text','question_id','coverage','prior_question','prior_plan','prior_uncertain',
 'missing_followup','same_followup','followup_id','prior_quote','prior_refs','repair_ref','duplicate_assessment',
 'prior_assistance','prior_not_tested','unasked_followup','blank_answer','wrong_recommendation'])
def test_invalid_retry_context_before_provider(api,change):
    d=retry_request(); p=d['previous_attempt']; f=p['feedback']
    if change=='id': d['attempt_id']=p['id']
    if change=='plan': d['plan']['id']='different-plan'
    if change=='question_text': d['question']['text']='Changed question'
    if change=='question_id': d['question']['id']='other-question'
    if change=='coverage': d['question']['criterion_ids']=['materials']
    if change=='prior_question': p['question']['text']='Not the initial question'
    if change=='prior_plan': p['plan_id']='wrong-plan'
    if change=='prior_uncertain': f['status']='uncertain'
    if change=='missing_followup': f['follow_up_question']=None
    if change=='same_followup': f['follow_up_question']['text']=d['plan']['initial_question']['text']
    if change=='followup_id': f['follow_up_question']['id']=d['plan']['initial_question']['id']
    if change=='prior_quote': f['assessments'][0]['student_quote']='Not actual answer words'
    if change=='prior_refs': f['assessments'][0]['source_refs'][0]['quote']='Invented source'
    if change=='repair_ref': f['targeted_explanation']['source_refs'][0]['chunk_id']='c0099'
    if change=='duplicate_assessment': f['assessments'][1]['criterion_id']='energy'
    if change=='prior_assistance': p['assistance']['used']=True
    if change=='prior_not_tested': f['assessments'][0]['status']='not_tested'
    if change=='unasked_followup':
        d['plan']['initial_question']['criterion_ids']=['energy']; p['question']['criterion_ids']=['energy']
        f['assessments'][1]['status']='not_tested'; f['follow_up_question']['criterion_ids']=['materials']
        d['question']['criterion_ids']=['materials']
    if change=='blank_answer': d['answer']='  '
    if change=='wrong_recommendation': f['recommendation']='read_original'
    response=post(api,d); assert response.status_code==422,response.text
    assert not api[1]['calls']


def test_uncertain_retry_then_clarification_reuses_initial_baseline(api):
    data=retry_request('ambiguous'); before=copy.deepcopy(data['previous_attempt'])
    api[1]['outcomes']=[retry_feedback('ambiguous')]
    uncertain=post(api,data).json(); assert uncertain['retry_result'] is None
    data['answer']=ANSWERS['correct']; data['attempt_id']='clarified-retry'
    api[1]['outcomes']=[retry_feedback()]
    result=post(api,data); assert result.status_code==200,result.text
    assert result.json()['retry_result']['newly_demonstrated_ids']==['energy']
    assert data['previous_attempt']==before
    data['previous_attempt']=uncertain['attempt']; api[1]['calls'].clear()
    assert post(api,data).status_code==422 and not api[1]['calls']


@pytest.mark.parametrize('change',['third_question','bad_quote','assessed_untested','no_interpretation'])
def test_bad_retry_output_shares_repair_budget(api,change):
    bad=retry_feedback()
    if change=='third_question': bad['assessments'][0]['follow_up_question']=feedback()['assessments'][0]['follow_up_question']
    if change=='bad_quote': bad['assessments'][0]['student_quote']='Invented answer'
    if change=='assessed_untested': bad['assessments'].append(dict(criterion_id='materials',status='demonstrated',student_quote=ANSWERS['correct'],explanation='Shown.',follow_up_question=None))
    if change=='no_interpretation': bad['answer_interpretation']=None
    api[1]['outcomes']=[bad,retry_feedback()]
    response=repair_post(api,retry_request()); assert response.status_code==200,response.text
    assert len(api[1]['calls'])==2


@pytest.mark.parametrize('code,status',[('AI_TIMEOUT',504),('RATE_LIMITED',429),('AI_UNAVAILABLE',503),('AI_INVALID_RESPONSE',502)])
def test_provider_failure_not_comparison(api,code,status):
    api[1]['outcomes']=[AIError(code,status,'Try later.')]*2
    response=repair_post(api,retry_request()); assert response.status_code==status
    assert 'retry_result' not in response.json()


def test_prior_answer_not_sent_for_current_judgement(api):
    data=retry_request(); data['previous_attempt']['answer']+=' BASELINE_ONLY_PRIVATE'
    api[1]['outcomes']=[retry_feedback()]; assert post(api,data).status_code==200
    call=api[1]['calls'][0]
    text=call['messages'][1]['content'][0]['text'] if 'messages' in call else call['contents'][0].parts[0].text
    assert 'BASELINE_ONLY_PRIVATE' not in text and 'previous_attempt' not in text
    assert '"stage":"retry"' in text.replace(' ','')


def test_comparison_unusual_states_never_invent_improvement():
    d=retry_request(); previous=LearningAttempt.model_validate(d['previous_attempt'])
    previous.feedback.assessments[0].status='demonstrated'
    previous.feedback.assessments[1].status='not_tested'
    now=[CriterionAssessment(criterion_id=c['id'],status='demonstrated',explanation='Shown.',student_quote='energy',source_refs=c['source_refs']) for c in d['plan']['objective']['criteria']]
    result=compare_retry(previous,'current',now,AssistanceRecord(used=False,kinds=[]))
    assert result.retained_demonstrated_ids==['energy'] and result.newly_demonstrated_ids==[]
    # First demonstration of a previously untested concept is not improvement.


@pytest.mark.parametrize('text',['It helps.','That works','The thing helps with stuff.','Maybe it does.'])
def test_generic_acknowledgement_abstains_before_provider(api,text):
    data=retry_request(); data['answer']=text
    response=post(api,data); assert response.status_code==200
    result=response.json()
    assert result['attempt']['feedback']['status']=='uncertain' and result['retry_result'] is None
    assert result['attempt']['feedback']['targeted_explanation'] is None and not api[1]['calls']


@pytest.mark.parametrize('text',['Light energy','sun lite energee','I do not know','Glucose comes from water'])
def test_short_or_specific_answers_are_not_locally_graded(text):
    from app.services.learning import needs_clarification
    assert not needs_clarification(text)


def test_safe_rejection_diagnostics_exclude_answer_source(api,caplog):
    data=retry_request(); data['answer']+=' SENSITIVE_TEST_MARKER'
    bad=retry_feedback(); bad['assessments'][0]['follow_up_question']=feedback()['assessments'][0]['follow_up_question']
    api[1]['outcomes']=[bad,bad]
    response=repair_post(api,data)
    assert response.status_code==502
    assert 'SENSITIVE_TEST_MARKER' not in caplog.text
    assert data['source']['chunks'][0]['text'] not in caplog.text
