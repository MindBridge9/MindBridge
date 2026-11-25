"""Opt-in, one synthetic initial evaluation over HTTP; no automatic HTTP retry."""
import argparse
import copy
import json
import time
from pathlib import Path

import httpx
from app.schemas.learning import EvaluationResult
from app.validation.sources import validate_references

ANSWERS={'correct':'Sunlight provides energy for plants to make glucose.',
         'misconception':"Sunlight itself is the plant's food.", 'ambiguous':'It helps.'}


def synthetic_request(case):
    # Fixed synthetic rubric/question chosen before these answers. Only energy
    # is asked here: materials must remain not_tested for all three submissions.
    source=dict(page_id='11111111-1111-4111-8111-111111111111',chunks=[dict(id='c0001',kind='paragraph',quality='clear',
        text='Green plants use light energy from sunlight to make glucose from carbon dioxide and water during photosynthesis.')],
        key_terms=[],key_terms_status='unavailable')
    question=dict(id='question-energy',text='How does sunlight help green plants make glucose?',criterion_ids=['energy'])
    plan=dict(id='synthetic-plan',page_id=source['page_id'],chunk_id='c0001',target_concept='How plants make glucose',
      objective=dict(id='objective-roles',description='Distinguish energy from materials in photosynthesis.',criteria=[
        dict(id='energy',description='Sunlight supplies light energy to make glucose.',source_refs=[dict(chunk_id='c0001',quote='use light energy from sunlight to make glucose')]),
        dict(id='materials',description='Plants make glucose from carbon dioxide and water.',source_refs=[dict(chunk_id='c0001',quote='make glucose from carbon dioxide and water')])]),
      initial_question=question)
    return dict(source=source,plan=plan,question=copy.deepcopy(question),answer=ANSWERS[case],attempt_id='synthetic-'+case,
                assistance=dict(used=False,kinds=[]),previous_attempt=None)


def main(case):
    request=synthetic_request(case); before=copy.deepcopy(request)
    Path('/tmp/mindbridge-b07-'+case+'-request.json').write_text(json.dumps(request,indent=2))
    started=time.perf_counter()
    with httpx.Client(base_url='http://127.0.0.1:8765',timeout=45) as client:
        response=client.post('/api/check-understanding',json=request)
    evidence=dict(case=case,http_status=response.status_code,seconds=round(time.perf_counter()-started,3))
    if response.status_code==200:
        result=EvaluationResult.model_validate(response.json()); attempt=result.attempt; feedback=attempt.feedback
        assert request==before and attempt.answer==request['answer'] and attempt.question.model_dump()==request['question']
        assert attempt.id==request['attempt_id'] and attempt.plan_id==request['plan']['id'] and result.retry_result is None
        assert {a.criterion_id for a in feedback.assessments}=={'energy','materials'}
        for a in feedback.assessments:
            validate_references(request['source'],a.source_refs,page_id=request['source']['page_id'])
            assert a.student_quote is None or a.student_quote in request['answer']
        if feedback.targeted_explanation:
            validate_references(request['source'],feedback.targeted_explanation.source_refs)
        if feedback.status=='uncertain':
            assert feedback.uncertainty and feedback.follow_up_question is None and feedback.hint is None
            assert feedback.targeted_explanation is None and feedback.further_practice_useful is None
        else:
            assert feedback.follow_up_question and feedback.follow_up_question.text != request['question']['text']
        expected='demonstrated' if case=='correct' else 'possible_misconception' if case=='misconception' else 'unclear'
        actual={a.criterion_id:a.status for a in feedback.assessments}
        evidence.update(status=feedback.status,assessments=actual,expected_states_match=actual=={'energy':expected,'materials':'not_tested'},
                        exact_refs_and_quotes=True,source_and_plan_unchanged=True)
        # Validated SYNTHETIC response only, for explicit human quality review.
        Path('/tmp/mindbridge-b07-'+case+'-result.json').write_text(result.model_dump_json(indent=2))
    else:
        evidence['error_code']=response.json()['error']['code']
    Path('/tmp/mindbridge-b07-'+case+'-evidence.json').write_text(json.dumps(evidence,indent=2))
    print(json.dumps(evidence))
    return response.status_code==200 and evidence.get('expected_states_match',False)


if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--case',choices=list(ANSWERS),default='correct')
    parser.add_argument('--write-request-only',action='store_true',help='Create synthetic Swagger input without a provider call.')
    args=parser.parse_args()
    if args.write_request_only:
        path=Path('/tmp/mindbridge-b07-'+args.case+'-request.json')
        path.write_text(json.dumps(synthetic_request(args.case),indent=2))
        print(str(path))
    else:
        raise SystemExit(0 if main(args.case) else 1)
