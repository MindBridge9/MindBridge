"""Opt-in synthetic prepare -> misconception -> independent retry; stop on failure."""
import argparse
import copy
import json
import time
from pathlib import Path
import httpx
from app.schemas.learning import LearningPlan, EvaluationResult
from app.tests.smoke_evaluation import synthetic_request
from app.validation.sources import validate_references


def main(resume=False):
    sample=synthetic_request('misconception')
    source=sample['source']; evidence={'checks':[]}
    # Never leave a previous successful synthetic result looking current after
    # a later failed run. Archived evidence uses separate versioned filenames.
    for name in ('initial', 'retry'):
        Path('/tmp/mindbridge-b08-'+name+'-result.json').unlink(missing_ok=True)
    with httpx.Client(base_url='http://127.0.0.1:8765',timeout=90) as client:
        def call(name,path,data,model):
            # Explicit synthetic, non-personal request/result artifacts for review.
            Path('/tmp/mindbridge-b08-'+name+'-request.json').write_text(json.dumps(data,indent=2))
            before=copy.deepcopy(data); started=time.perf_counter()
            response=client.post(path,json=data)
            row={'case':name,'http_status':response.status_code,'seconds':round(time.perf_counter()-started,3)}
            evidence['checks'].append(row)
            if response.status_code!=200:
                row['error_code']=response.json()['error']['code']; return None
            parsed=model.model_validate(response.json()); assert data==before
            Path('/tmp/mindbridge-b08-'+name+'-result.json').write_text(parsed.model_dump_json(indent=2))
            return parsed
        plan=(LearningPlan.model_validate_json(Path('/tmp/mindbridge-b08-prepare-result.json').read_text()) if resume else
              call('prepare','/api/prepare-understanding',{'source':source,'chunk_id':'c0001',
                   'target_concept':'Roles of sunlight and materials in photosynthesis'},LearningPlan))
        evidence['resumed_synthetic_prepare']=resume
        passed=False
        if plan:
            request=dict(source=source,plan=plan.model_dump(),question=plan.initial_question.model_dump(),
                answer="Sunlight itself is the plant's food.",attempt_id='b08-initial',assistance=dict(used=False,kinds=[]),previous_attempt=None)
            initial=call('initial','/api/check-understanding',request,EvaluationResult)
            if initial:
                f=initial.attempt.feedback
                wrong=[a.criterion_id for a in f.assessments if a.status=='possible_misconception']
                evidence['initial_misconception_detected']=bool(wrong)
                follow=f.follow_up_question
                evidence['follow_up_ids_match_misconception']=bool(follow and bool(follow.criterion_ids) and set(follow.criterion_ids)<=set(wrong))
                if follow and wrong and evidence['follow_up_ids_match_misconception']:
                    request.update(question=follow.model_dump(),answer='Sunlight supplies light energy. Plants use this energy to make glucose from carbon dioxide and water.',
                        attempt_id='b08-retry',previous_attempt=initial.attempt.model_dump())
                    retry=call('retry','/api/check-understanding',request,EvaluationResult)
                    if retry:
                        for a in retry.attempt.feedback.assessments:
                            validate_references(source,a.source_refs)
                            assert a.student_quote is None or a.student_quote in request['answer']
                        result=retry.retry_result
                        passed=bool(result and result.independent_in_app and set(result.newly_demonstrated_ids)==set(follow.criterion_ids)
                            and not result.still_needs_practice_ids and retry.attempt.feedback.follow_up_question is None)
                        evidence['comparison_valid']=passed
                        evidence['source_and_rubric_unchanged']=source==sample['source'] and request['plan']==plan.model_dump()
    evidence['structural_loop_passed']=passed
    Path('/tmp/mindbridge-b08-evidence.json').write_text(json.dumps(evidence,indent=2))
    print(json.dumps(evidence))
    return passed


if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--resume-prepare',action='store_true',help='Reuse the saved synthetic live plan, not a response fallback.')
    raise SystemExit(0 if main(parser.parse_args().resume_prepare) else 1)
