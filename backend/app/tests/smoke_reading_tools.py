"""Opt-in synthetic define/explain checks against normal Uvicorn; no HTTP retries."""
import copy
import json
import time
from pathlib import Path
import httpx
from app.schemas.content import GlossaryEntry, ConceptExplanation
from app.tests.smoke_evaluation import synthetic_request
from app.validation.sources import validate_references


def main():
    source=synthetic_request('correct')['source']; rows=[]
    with httpx.Client(base_url='http://127.0.0.1:8765',timeout=45) as client:
        for tool,model in [('define',GlossaryEntry),('explain',ConceptExplanation)]:
            request=dict(source=copy.deepcopy(source),chunk_id='c0001',language='en')
            request.update(dict(phrase='glucose',surrounding_sentence=source['chunks'][0]['text']) if tool=='define'
                           else dict(concept='The role of sunlight'))
            before=copy.deepcopy(request); started=time.perf_counter()
            response=client.post('/api/'+tool,json=request)
            row=dict(tool=tool,http_status=response.status_code,seconds=round(time.perf_counter()-started,3))
            rows.append(row)
            if response.status_code==200:
                result=model.model_validate(response.json())
                validate_references(source,result.source_refs,page_id=source['page_id'] if tool=='explain' else None)
                assert result.language=='en' and request==before
                row.update(schema_valid=True,exact_refs=True,source_unchanged=True)
                Path('/tmp/mindbridge-b09-'+tool+'-result.json').write_text(result.model_dump_json(indent=2))
            else:
                row['error_code']=response.json()['error']['code']
                if response.status_code in (429,503,504): break
    Path('/tmp/mindbridge-b09-tools-evidence.json').write_text(json.dumps(rows,indent=2))
    print(json.dumps(rows))
    return len(rows)==2 and all(r['http_status']==200 for r in rows)


if __name__=='__main__':
    raise SystemExit(0 if main() else 1)
