"""Manual B03 diagnostics, one provider attempt per case; synthetic data only."""
import argparse
import asyncio
import io
import json
import time
from pathlib import Path
from google.genai import errors, types
from PIL import Image, ImageDraw, ImageFont
from app.ai.client import GeminiAdapter
from app.ai.prompts import OCR_SYSTEM, OCR_VERSION
from app.config import Settings
from app.services.reading import OCRResponse, build_result


def sample():
    with Image.new('RGB',(1400,600),'white') as im, io.BytesIO() as output:
        draw=ImageDraw.Draw(im)
        for i,line in enumerate(['Plant nutrition','Plants use sunlight to make glucose from carbon dioxide and water.',
                                 'A leaf is 12 cm long.','- Water enters through roots.','Figure 1: A green leaf.']):
            draw.text((40,40+i*85),line,font=ImageFont.load_default(size=32),fill='black')
        im.save(output,format='PNG')
        return output.getvalue()


async def main(args):
    settings=Settings.from_env()
    configured=settings.gemini_model
    settings=settings.model_copy(update={'gemini_model':args.model or configured})
    rows=[]
    async with GeminiAdapter(settings) as adapter:
        async def record(name, function):
            started=time.perf_counter(); row={'case':name,'model':settings.gemini_model}
            try:
                result=await function()
                row['status']='success'
                if name.startswith('metadata'):
                    row['generate_content_supported']='generateContent' in (result.supported_actions or [])
                else:
                    row['finish_reason']=str(result.candidates[0].finish_reason) if result.candidates else None
                    row['output_tokens']=result.usage_metadata.candidates_token_count if result.usage_metadata else None
                    row['thinking_tokens']=result.usage_metadata.thoughts_token_count if result.usage_metadata else None
                    if name.startswith('ocr'):
                        try:
                            page=build_result(OCRResponse.model_validate_json(result.text)).page
                            row.update(valid_page=page is not None,enrichment=page.enrichment_status if page else None)
                        except Exception as exc:
                            row.update(validation_error=type(exc).__name__)
                    elif name=='image':
                        row['known_text_present']='12 cm' in result.text
                    elif name=='text':
                        row['expected_text']=result.text.strip()=='OK'
            except errors.APIError as exc:
                message=(exc.message or '').lower()
                row.update(status='provider_error',http_status=exc.code,
                           schema_complexity=any(v in message for v in ['too many states','too complex','complexity','nesting depth']),
                           overloaded=any(v in message for v in ['overload','high demand','capacity']),
                           internal_error='internal' in message,
                           thinking_rejected='thinking' in message)
            except Exception as exc:
                row.update(status='failure',error_type=type(exc).__name__)
            row['latency_seconds']=round(time.perf_counter()-started,3)
            rows.append(row); print(json.dumps(row),flush=True)
            return row

        async def generate(case):
            config=types.GenerateContentConfig(candidate_count=1,automatic_continuation=False,
                automatic_function_calling=types.AutomaticFunctionCallingConfig(disable=True),
                max_output_tokens=(64 if case=='text' else 512 if case=='image' else args.tokens),
                http_options=types.HttpOptions(timeout=45000,retry_options=types.HttpRetryOptions(attempts=1)))
            if args.thinking=='minimal': config.thinking_config=types.ThinkingConfig(thinking_level='MINIMAL')
            if case=='text':
                contents='Return exactly OK.'
            elif case=='image':
                contents=[types.Content(role='user',parts=[types.Part.from_text(text='Transcribe the printed image exactly.'),
                                                          types.Part.from_bytes(data=sample(),mime_type='image/png')])]
            else:
                config.system_instruction=OCR_SYSTEM
                config.response_mime_type='application/json'
                config.response_json_schema=OCRResponse.model_json_schema()
                if args.schema=='core':
                    from app.services.reading import ProviderEnrichment
                    config.system_instruction += '\nEnrichment object schema (validate independently): ' + json.dumps(ProviderEnrichment.model_json_schema())
                    config.response_json_schema['properties']['enrichment']={'type':['object','null'],'additionalProperties':True}
                    config.response_json_schema['$defs']={k:v for k,v in config.response_json_schema['$defs'].items() if k in ('Block','ProviderWarning')}
                if args.schema=='inline':
                    definitions=config.response_json_schema.get('$defs',{})
                    def inline(node):
                        if isinstance(node,dict):
                            if '$ref' in node: return inline(definitions[node['$ref'].split('/')[-1]])
                            return {k:inline(v) for k,v in node.items() if k!='$defs'}
                        if isinstance(node,list): return [inline(v) for v in node]
                        return node
                    config.response_json_schema=inline(config.response_json_schema)
                contents=[types.Content(role='user',parts=[types.Part.from_text(text=json.dumps({'prompt_version':OCR_VERSION,'task':'Transcribe the printed image and enrich clear source text.'})),
                                                          types.Part.from_bytes(data=sample(),mime_type='image/png')])]
            return await adapter._client.models.generate_content(model=settings.gemini_model,contents=contents,config=config)

        if args.case=='baseline':
            await record('metadata',lambda:adapter._client.models.get(model=settings.gemini_model))
            await record('text',lambda:generate('text'))
            await record('image',lambda:generate('image'))
            await record('ocr',lambda:generate('ocr'))
            alternative='gemini-3.1-flash-lite'
            settings=settings.model_copy(update={'gemini_model':alternative})
            accessible=await record('metadata_alternative',lambda:adapter._client.models.get(model=alternative))
            if accessible['status']=='success': await record('ocr_alternative',lambda:generate('ocr'))
        else:
            await record('ocr_'+args.schema+'_'+args.thinking,lambda:generate('ocr'))
    Path('/tmp/mindbridge-ocr-diagnostic-'+args.case+'-'+args.schema+'-'+args.thinking+'.json').write_text(json.dumps(rows,indent=2))


if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--case',choices=['baseline','ocr'],default='baseline')
    parser.add_argument('--schema',choices=['original','inline','core'],default='original')
    parser.add_argument('--thinking',choices=['default','minimal'],default='default')
    parser.add_argument('--tokens',type=int,default=8192)
    parser.add_argument('--model')
    asyncio.run(main(parser.parse_args()))
