"""B03 synthetic image, multipart, OCR and enrichment checks; never live calls."""
import copy
import io
import json
import struct
import zlib
from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock, patch

import pytest
from fastapi.testclient import TestClient
from google.genai import errors, types
from PIL import Image, PngImagePlugin
from pydantic import ValidationError

from app.ai.client import AIError
from app.config import Settings
from app.main import create_app
from app.schemas.content import ReadResult
from app.schemas.errors import APIError
from app.services.reading import OCRResponse, build_result
from app.validation.images import sanitize_image

TEXT = 'Plants use sunlight to make glucose from carbon dioxide and water. A leaf is 12 cm long.'


def core():
    return dict(readability='readable',retake_reasons=[],warnings=[],blocks=[
        dict(block_index=1,kind='heading',text='Plant nutrition',quality='clear'),
        dict(block_index=2,kind='paragraph',text=TEXT,quality='clear'),
        dict(block_index=3,kind='list_item',text='- Water enters through roots.',quality='clear'),
        dict(block_index=4,kind='caption',text='Figure 1: A green leaf.',quality='clear')],enrichment={
        'summary':{'text':'Plants make glucose.','source_refs':[{'block_index':2,'quote':'Plants use sunlight to make glucose'}]},
        'key_terms':[{'term':'glucose','block_indexes':[2]}],
        'glossary':[{'phrase':'glucose','language':'en','definition':'A sugar.',
                    'contextual_meaning':'The sugar plants make.','example':None,
                    'source_refs':[{'block_index':2,'quote':'make glucose from carbon dioxide and water'}]}]})


def output(value,reason='STOP'):
    return types.GenerateContentResponse(candidates=[types.Candidate(finish_reason=reason,
        content=types.Content(parts=[types.Part.from_text(text=value if isinstance(value,str) else json.dumps(value))]))])


def image(fmt='PNG',size=(120,80),**options):
    with Image.new('RGB',size,'white') as im, io.BytesIO() as stream:
        im.save(stream,format=fmt,**options)
        return stream.getvalue()


@pytest.fixture
def api():
    provider=SimpleNamespace(models=SimpleNamespace(generate_content=AsyncMock(return_value=output(core()))),aclose=AsyncMock())
    owner=SimpleNamespace(aio=provider,close=Mock())
    app=create_app(Settings(gemini_api_key='synthetic-secret',environment='development'))
    with patch('app.ai.client.genai.Client',return_value=owner):
        with TestClient(app) as client:
            yield client,provider
    provider.aclose.assert_awaited_once()
    owner.close.assert_called_once()


def upload(api,data=None,mime='image/png'):
    return api[0].post('/api/read',files={'image':('page.png',image() if data is None else data,mime)})


def error(response,status,code):
    assert response.status_code==status, response.text
    parsed=APIError.model_validate(response.json()).error
    assert parsed.code==code
    assert parsed.request_id==response.headers['x-request-id']
    assert response.headers['cache-control']=='no-store'
    assert 'synthetic-secret' not in response.text


@pytest.mark.parametrize('fmt,mime',[('JPEG','image/jpeg'),('PNG','image/png'),('WEBP','image/webp')])
def test_formats_and_source_mapping(api,fmt,mime):
    response=upload(api,image(fmt),mime)
    assert response.status_code==200
    result=ReadResult.model_validate(response.json())
    page=result.page
    assert result.readability=='readable' and page.enrichment_status=='complete'
    assert page.title=='Plant nutrition' and page.title_origin=='source'
    assert [c.id for c in page.chunks]==['c0001','c0002','c0003','c0004']
    assert [c.kind for c in page.chunks]==['heading','paragraph','list_item','caption']
    assert page.chunks[1].text==TEXT
    assert page.key_terms[0].chunk_ids==['c0002']
    assert page.summary.source_refs[0].chunk_id=='c0002'
    assert page.glossary[0].source_refs[0].chunk_id=='c0002'
    assert page.created_at.endswith('Z')
    assert api[1].models.generate_content.await_count==1
    sent=api[1].models.generate_content.call_args.kwargs
    assert sent['contents'][0].parts[1].inline_data.mime_type==mime
    assert sent['config'].automatic_continuation is False
    assert sent['config'].http_options.retry_options.attempts==1


def test_unreadable_and_partial(api):
    api[1].models.generate_content.return_value=output(dict(readability='unreadable',retake_reasons=['blur'],blocks=[],warnings=[],enrichment=None))
    assert upload(api).json()==dict(readability='unreadable',retake_reasons=['blur'],page=None)
    data=core()
    data.update(readability='partial',retake_reasons=['cropped_text'])
    data['blocks'][3].update(text='Figure 1: A green',quality='uncertain')
    api[1].models.generate_content.return_value=output(data)
    result=ReadResult.model_validate(upload(api).json())
    assert result.readability=='partial'
    assert result.page.chunks[3].text=='Figure 1: A green'
    assert result.page.extraction_warnings[0].chunk_ids==['c0004']


@pytest.mark.parametrize('bad',[None,'invalid',[],{'summary':{'text':'bad'},'key_terms':None,'glossary':None}])
def test_bad_enrichment_preserves_core_without_retry(api,bad):
    data=core(); data['enrichment']=bad
    api[1].models.generate_content.return_value=output(data)
    response=upload(api)
    assert response.status_code==200
    page=response.json()['page']
    assert page['chunks'][1]['text']==TEXT
    assert page['enrichment_status']=='unavailable'
    assert page['summary'] is None and page['key_terms']==[] and page['glossary']==[]
    assert page['key_terms_status']=='unavailable'
    assert api[1].models.generate_content.await_count==1


def test_missing_enrichment_and_valid_empty_metadata(api):
    data=core(); del data['enrichment']
    api[1].models.generate_content.return_value=output(data)
    assert upload(api).json()['page']['enrichment_status']=='unavailable'
    data=core(); data['enrichment'].update(key_terms=[],glossary=[])
    api[1].models.generate_content.return_value=output(data)
    page=upload(api).json()['page']
    assert page['key_terms_status']=='available' and page['enrichment_status']=='complete'


@pytest.mark.parametrize('component',['summary','key_terms','glossary'])
def test_independent_enrichment_failure(api,component):
    data=core(); data['enrichment'][component]={'invalid':'shape'}
    api[1].models.generate_content.return_value=output(data)
    page=upload(api).json()['page']
    assert page['enrichment_status']=='partial'
    assert page['chunks'][1]['text']==TEXT
    assert api[1].models.generate_content.await_count==1


@pytest.mark.parametrize('component,field,value',[
    ('summary','quote','invented quotation'),('summary','block_index',99),
    ('summary','quote','plants use sunlight'),('key_terms','term','soil'),
    ('key_terms','term','at'),('key_terms','block_indexes',[99]),
    ('glossary','phrase','soil'),('glossary','quote','invented quotation')])
def test_invalid_enrichment_relationships(api,component,field,value):
    data=core(); target=data['enrichment'][component]
    if isinstance(target,list): target=target[0]
    if field in ('quote','block_index'): target=target['source_refs'][0]
    target[field]=value
    api[1].models.generate_content.return_value=output(data)
    page=upload(api).json()['page']
    assert page['enrichment_status']=='partial'
    assert page[component]==(None if component=='summary' else [])
    assert api[1].models.generate_content.await_count==1


def test_uncertain_source_not_used_by_enrichment(api):
    data=core(); data['blocks'][1]['quality']='uncertain'
    api[1].models.generate_content.return_value=output(data)
    assert upload(api).json()['page']['enrichment_status']=='unavailable'


@pytest.mark.parametrize('bad',['{',{'bad':'shape'}])
def test_bad_provider_response_retry_budget(api,bad):
    api[1].models.generate_content.return_value=output(bad)
    error(upload(api),502,'AI_INVALID_RESPONSE')
    assert api[1].models.generate_content.await_count==2


def test_invalid_core_can_recover(api):
    data=core(); data['blocks'][1]['block_index']=1
    api[1].models.generate_content.side_effect=[output(data),output(core())]
    assert upload(api).status_code==200
    assert api[1].models.generate_content.await_count==2


def test_quota_and_refusal(api):
    api[1].models.generate_content.side_effect=errors.APIError(429,{'error':{'message':'synthetic-secret'}})
    error(upload(api),429,'AI_QUOTA_EXHAUSTED')
    assert api[1].models.generate_content.await_count==1
    api[1].models.generate_content.side_effect=None
    api[1].models.generate_content.return_value=output({},reason='SAFETY')
    error(upload(api),422,'CONTENT_UNSUPPORTED')
    assert api[1].models.generate_content.await_count==2


@pytest.mark.parametrize('data,mime,status,code',[
    (b'','image/png',422,'INVALID_IMAGE'),(b'not image','image/png',422,'INVALID_IMAGE'),
    (image()[:50],'image/png',422,'INVALID_IMAGE'),(image(),'image/jpeg',415,'UNSUPPORTED_IMAGE_TYPE'),
    (image('GIF'),'image/png',415,'UNSUPPORTED_IMAGE_TYPE'),(image(),'application/octet-stream',415,'UNSUPPORTED_IMAGE_TYPE'),
    (b'x'*(8*1024*1024+1),'image/png',413,'IMAGE_TOO_LARGE')])
def test_invalid_images_do_not_call_ai(api,data,mime,status,code):
    error(upload(api,data,mime),status,code)
    api[1].models.generate_content.assert_not_called()


def png_header(width,height):
    def chunk(kind,data):
        return struct.pack('>I',len(data))+kind+data+struct.pack('>I',zlib.crc32(kind+data))
    return b'\x89PNG\r\n\x1a\n'+chunk(b'IHDR',struct.pack('>IIBBBBB',width,height,8,2,0,0,0))+chunk(b'IDAT',b'')+chunk(b'IEND',b'')


@pytest.mark.parametrize('size',[(10001,1),(5000,4001),(100000,100000)])
def test_dimensions_pixels_and_bombs(api,size):
    error(upload(api,png_header(*size)),413,'IMAGE_TOO_LARGE')
    api[1].models.generate_content.assert_not_called()


@pytest.mark.parametrize('fmt,mime',[('PNG','image/png'),('WEBP','image/webp')])
def test_multiframe(api,fmt,mime):
    with Image.new('RGB',(30,30),'white') as a, Image.new('RGB',(30,30),'black') as b, io.BytesIO() as stream:
        a.save(stream,format=fmt,save_all=True,append_images=[b],duration=100,loop=0)
        error(upload(api,stream.getvalue(),mime),422,'INVALID_IMAGE')
    api[1].models.generate_content.assert_not_called()


def test_orientation_and_metadata():
    exif=Image.Exif(); exif[274]=6; exif[315]='synthetic-author'
    clean=sanitize_image(image('JPEG',size=(100,60),exif=exif),'image/jpeg')
    assert (clean.width,clean.height)==(60,100)
    with Image.open(io.BytesIO(clean.data)) as im:
        assert not im.getexif() and 'icc_profile' not in im.info
    metadata=PngImagePlugin.PngInfo(); metadata.add_text('Comment','synthetic-metadata')
    clean=sanitize_image(image(pnginfo=metadata),'image/png')
    with Image.open(io.BytesIO(clean.data)) as im: assert 'Comment' not in im.info


def test_exactly_one_image_and_no_extra_fields(api):
    cases=[[('image',('a',image(),'image/png')),('image',('b',image(),'image/png'))],
           [('other',('a',image(),'image/png'))]]
    for files in cases:
        error(api[0].post('/api/read',files=files),422,'VALIDATION_ERROR')
    error(api[0].post('/api/read',files={'image':('a',image(),'image/png')},data={'extra':'sensitive'}),422,'VALIDATION_ERROR')
    api[1].models.generate_content.assert_not_called()


def test_wrong_content_type_and_bad_multipart(api):
    error(api[0].post('/api/read',json={'image':'bad'}),415,'INVALID_REQUEST')
    error(api[0].post('/api/read',content=b'bad',headers={'Content-Type':'multipart/form-data'}),400,'INVALID_REQUEST')
    api[1].models.generate_content.assert_not_called()


def test_declared_and_actual_body_limits_before_parser(api):
    with patch('starlette.requests.MultiPartParser.parse',new_callable=AsyncMock) as parse:
        error(api[0].post('/api/read',content=b'',headers={'Content-Length':str(9*1024*1024+1)}),413,'REQUEST_TOO_LARGE')
        def stream():
            for _ in range(10): yield b'x'*(1024*1024)
        error(api[0].post('/api/read',content=stream(),headers={'Content-Type':'multipart/form-data; boundary=x'}),413,'REQUEST_TOO_LARGE')
    parse.assert_not_awaited()


def test_upload_closed_after_provider_failure(api):
    from starlette.datastructures import UploadFile
    original=UploadFile.close; closed=[]
    async def close(file):
        await original(file); closed.append(file.file.closed)
    api[1].models.generate_content.side_effect=AIError('AI_TIMEOUT',504,'Try again.',retryable=True)
    with patch.object(UploadFile,'close',close): error(upload(api),504,'AI_TIMEOUT')
    assert closed and all(closed)


def test_sentence_splitting_keeps_all_original_characters_and_remaps():
    data=core(); text=('A leaf is 12 cm long. '*145)+'Glucose is food.'
    data['blocks']=[dict(block_index=1,kind='paragraph',text=text,quality='clear')]
    data['enrichment']={'summary':{'text':'Leaves and food.','source_refs':[{'block_index':1,'quote':'Glucose is food.'}]},
                        'key_terms':[{'term':'Glucose','block_indexes':[1]}],'glossary':[]}
    a=build_result(OCRResponse.model_validate(data)).page
    b=build_result(OCRResponse.model_validate(data)).page
    assert ''.join(c.text for c in a.chunks)==text
    assert len(a.chunks)==2 and all(len(c.text)<=3000 for c in a.chunks)
    assert a.summary.source_refs[0].chunk_id=='c0002'
    assert a.key_terms[0].chunk_ids==['c0002']
    assert a.title_origin=='generated' and a.id!=b.id
    assert [c.id for c in a.chunks]==[c.id for c in b.chunks]


def test_unsplittable_overflow_is_explicit(api):
    data=core(); data['blocks'][1]['text']='x'*3001
    api[1].models.generate_content.return_value=output(data)
    error(upload(api),422,'CONTENT_UNSUPPORTED')
    assert api[1].models.generate_content.await_count==1


def test_no_clear_usable_text_is_unreadable():
    data=core(); data['blocks']=[data['blocks'][0]]
    result=build_result(OCRResponse.model_validate(data))
    assert result.readability=='unreadable' and result.page is None
    assert result.retake_reasons==['no_printed_text']


def test_development_docs_and_capability_gate(api):
    assert api[0].get('/docs').status_code==200
    operation=api[0].get('/openapi.json').json()['paths']['/api/read']['post']
    assert operation['operationId']=='read'
    assert 'multipart/form-data' in operation['requestBody']['content']
    assert not any(api[0].get('/api/health').json()['capabilities'].values())
    with TestClient(create_app(Settings())) as client:
        error(client.get('/docs'),404,'NOT_FOUND')
        error(client.get('/openapi.json'),404,'NOT_FOUND')


def test_environment_development_flag(monkeypatch,tmp_path):
    monkeypatch.setenv('MINDBRIDGE_ENV','development')
    assert Settings.from_env(tmp_path/'missing').environment=='development'


def test_provider_schema_complexity_reduction_preserves_local_bounds():
    schema=OCRResponse.model_json_schema()
    assert 'maxItems' not in json.dumps(schema)
    assert schema['properties']['blocks']['type']=='array'
    assert schema['properties']['enrichment']=={'type':['object','null'],'additionalProperties':True}
    assert set(schema['$defs'])=={'Block','ProviderWarning'}
    data=core(); data['blocks'][0]['block_index']=101
    with pytest.raises(ValidationError): OCRResponse.model_validate(data)
    data=core(); data['retake_reasons']=['blur']*9
    with pytest.raises(ValidationError): OCRResponse.model_validate(data)


def test_optional_enrichment_shape_is_trusted_prompt_and_locally_checked(api):
    response=upload(api)
    assert response.status_code==200
    config=api[1].models.generate_content.call_args.kwargs['config']
    assert 'Enrichment object schema (validate independently)' in config.system_instruction
    assert 'ProviderGlossary' in config.system_instruction
    assert 'ProviderGlossary' not in json.dumps(config.response_json_schema)
    assert config.max_output_tokens==8192
    assert config.thinking_config.thinking_level=='MINIMAL'


def test_core_total_text_overflow_and_dangling_warning():
    data=core(); data['blocks']=[dict(block_index=i+1,kind='paragraph',text='x'*3000,quality='clear') for i in range(11)]
    with pytest.raises(AIError) as caught: OCRResponse.model_validate(data)
    assert caught.value.code=='CONTENT_UNSUPPORTED'
    data=core(); data['warnings']=[dict(code='uncertain_text',message='Review text.',block_indexes=[99])]
    with pytest.raises(ValidationError): OCRResponse.model_validate(data)
