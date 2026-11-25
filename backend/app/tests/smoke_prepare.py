"""One opt-in synthetic B06 HTTP call. Start Uvicorn separately; no HTTP retries."""
import copy
import json
import time
from pathlib import Path
import httpx
from app.schemas.learning import LearningPlan
from app.validation.sources import validate_references
from app.tests.smoke_simplify import standalone_request


def main():
    sample=standalone_request()
    request={'source':sample['source'],'chunk_id':'c0001','target_concept':'How plants make glucose'}
    before=copy.deepcopy(request)
    started=time.perf_counter()
    with httpx.Client(base_url='http://127.0.0.1:8765',timeout=45) as client:
        response=client.post('/api/prepare-understanding',json=request)
    evidence={'http_status':response.status_code,'seconds':round(time.perf_counter()-started,3)}
    if response.status_code==200:
        plan=LearningPlan.model_validate(response.json())
        assert plan.page_id==request['source']['page_id'] and plan.chunk_id=='c0001'
        assert plan.target_concept==request['target_concept']
        assert 2<=len(plan.objective.criteria)<=4
        ids=[c.id for c in plan.objective.criteria]
        assert len(ids)==len(set(ids)) and set(plan.initial_question.criterion_ids)<=set(ids)
        assert plan.initial_question.criterion_ids
        for criterion in plan.objective.criteria:
            validate_references(request['source'],criterion.source_refs,page_id=plan.page_id)
        assert request==before
        evidence.update(exact_refs=True,source_unchanged=True,criteria=len(ids))
        # Explicitly synthetic, validated API result for manual quality review.
        Path('/tmp/mindbridge-b06-synthetic-plan.json').write_text(plan.model_dump_json(indent=2))
    else:
        evidence['error_code']=response.json()['error']['code']
    Path('/tmp/mindbridge-b06-evidence.json').write_text(json.dumps(evidence,indent=2))
    print(json.dumps(evidence))
    return response.status_code==200


if __name__=='__main__':
    raise SystemExit(0 if main() else 1)
