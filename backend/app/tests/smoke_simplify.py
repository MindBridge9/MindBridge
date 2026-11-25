"""Manual synthetic HTTP OCR -> simplification smoke; never collected by pytest.

Start the backend separately, then: .venv/bin/python -m app.tests.smoke_simplify
One read and one simplify request; no automatic HTTP retries or raw content logs.
If read fails, stop; standalone simplification requires --standalone.
"""
import copy
import argparse
import io
import json
import sys
import textwrap
import time
from datetime import datetime, timezone
from pathlib import Path

import httpx
from PIL import Image, ImageDraw, ImageFont

from app.config import Settings
from app.schemas.content import ReadResult, SimplificationResult, SourceContext
from app.schemas.errors import APIError
from app.validation.facts import check_facts
from app.validation.sources import select_source, validate_references

SOURCE='Green plants use light energy from sunlight to make glucose from carbon dioxide and water during photosynthesis.'


def standalone_request():
    return {'source':{'page_id':'11111111-1111-4111-8111-111111111111',
                     'chunks':[{'id':'c0001','kind':'paragraph','text':SOURCE,'quality':'clear'}],
                     'key_terms':[{'term':t,'chunk_ids':['c0001']} for t in ['light energy','glucose','carbon dioxide','water','photosynthesis']],
                     'key_terms_status':'available'},'chunk_ids':['c0001'],'level':'easy'}


def main(standalone=False):
    evidence={'timestamp_utc':datetime.now(timezone.utc).isoformat(),'provider':Settings.from_env().ai_provider,
              'model':(Settings.from_env().groq_model if Settings.from_env().ai_provider == 'groq' else Settings.from_env().gemini_model),
              'material':'original synthetic photosynthesis text/image; no personal information'}
    lines=['Photosynthesis',*textwrap.wrap(SOURCE,width=75),'The sample contains 20 mL of water if light is available.']
    with Image.new('RGB',(1500,500),'white') as image,io.BytesIO() as stream:
        draw=ImageDraw.Draw(image); font=ImageFont.load_default(size=28)
        for i,line in enumerate(lines): draw.text((35,35+i*85),line,font=font,fill='black')
        image.save(stream,format='PNG'); data=stream.getvalue()
    request=standalone_request()
    with httpx.Client(base_url='http://127.0.0.1:8765',timeout=90) as api:
        if standalone:
            evidence['pipeline_input']='direct_synthetic_request_with_explicit_metadata'
        else:
            started=time.perf_counter()
            read=api.post('/api/read',files={'image':('synthetic-photosynthesis.png',data,'image/png')})
            evidence['read']={'http_status':read.status_code,'latency_seconds':round(time.perf_counter()-started,3)}
            if read.status_code==200:
                result=ReadResult.model_validate(read.json())
                evidence['read'].update(schema_valid=True,readability=result.readability)
                if result.page:
                    expected=' '.join(lines)
                    actual=' '.join(c.text for c in result.page.chunks)
                    evidence['read']['exact_synthetic_text']=' '.join(actual.split())==' '.join(expected.split())
                    assert evidence['read']['exact_synthetic_text']
                if result.page is not None:
                    page=result.page
                    # At most three paragraphs, in original order, with original text.
                    ids=[c.id for c in page.chunks if c.kind=='paragraph' and c.quality=='clear'][:3]
                    if ids:
                        context=SourceContext(page_id=page.id,chunks=page.chunks,key_terms=page.key_terms,key_terms_status=page.key_terms_status)
                        selected=select_source(context,ids)
                        request={'source':selected.model_dump(),'chunk_ids':ids,'level':'easy'}
                        evidence['pipeline_input']='fresh_read_result'
                        evidence['read']['enrichment_status']=page.enrichment_status
            else:
                evidence['read']['error_code']=APIError.model_validate(read.json()).error.code
        if 'pipeline_input' not in evidence:
            evidence['pipeline_passed']=False
            Path('/tmp/mindbridge-b05-evidence.json').write_text(json.dumps(evidence,indent=2))
            print(json.dumps(evidence))
            return False
        before=copy.deepcopy(request)
        suffix='-standalone' if standalone else ''
        Path('/tmp/mindbridge-b05-request'+suffix+'.json').write_text(json.dumps(request,indent=2))
        started=time.perf_counter()
        response=api.post('/api/simplify',json=request)
        evidence['simplify']={'http_status':response.status_code,'latency_seconds':round(time.perf_counter()-started,3)}
        passed=False
        if response.status_code==200:
            result=SimplificationResult.model_validate(response.json())
            assert result.page_id==request['source']['page_id']
            assert [i.chunk_id for i in result.items]==request['chunk_ids']
            assert result.level=='easy' and request==before
            for item in result.items:
                context=select_source(request['source'],[item.chunk_id])
                validate_references(context,item.source_refs,page_id=result.page_id)
                facts=check_facts(context,item.chunk_id,item.text)
                assert item.warnings==list(facts.warnings)
                assert item.preserved_terms==list(facts.preserved_terms)
                assert item.terminology_check_status==facts.terminology_check_status
            evidence['simplify'].update(schema_valid=True,exact_clear_refs=True,deterministic_checks_match=True,
                source_unchanged=True,items=len(result.items),warnings=[w.code for i in result.items for w in i.warnings],
                terminology=[i.terminology_check_status for i in result.items],
                retained_terms=sum(len(i.preserved_terms) for i in result.items))
            passed=True
            # Validated synthetic API output for explicit manual quality review;
            # never provider responses or real user material.
            Path('/tmp/mindbridge-synthetic-simplification-review.json').write_text(result.model_dump_json(indent=2))
            combined=' '.join(i.text for i in result.items).casefold()
            required=['light energy','glucose','carbon dioxide','water','photosynthesis']
            evidence['simplify']['known_academic_terms_retained']=all(t in combined for t in required)
            evidence['simplify']['synthetic_quantity_retained']=standalone or ('20 ml' in combined)
            evidence['simplify']['condition_marker_retained']=standalone or (any(word in combined.split() for word in ('if','when','provided')) and 'light' in combined)
            passed=passed and all(evidence['simplify'][k] for k in (
                'known_academic_terms_retained','synthetic_quantity_retained','condition_marker_retained'))
        else:
            evidence['simplify']['error_code']=APIError.model_validate(response.json()).error.code
    evidence['pipeline_passed']=passed and evidence['pipeline_input']=='fresh_read_result'
    Path('/tmp/mindbridge-b05-evidence'+suffix+'.json').write_text(json.dumps(evidence,indent=2))
    print(json.dumps(evidence))
    return passed if standalone else evidence['pipeline_passed']


if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--standalone',action='store_true',help='One direct simplification request; skip OCR.')
    sys.exit(0 if main(parser.parse_args().standalone) else 1)
