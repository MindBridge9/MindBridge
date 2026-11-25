import asyncio
import json
from unittest.mock import AsyncMock, patch
import httpx
import pytest
from app.ai.budgets import groq_budget
from app.ai.groq import GroqAdapter
from app.ai.client import AIError
from app.config import Settings
from app.ai.prompts import OCR_SYSTEM, SIMPLIFY_SYSTEM
from app.tests.test_groq import completion
from app.tests.test_ai_client import Result


def test_operations_input_image_and_schema_accounting():
    budgets={op:groq_budget(op,{},'instruction',{},image=False) for op in ('read','simplify','prepare','check','define','explain')}
    assert budgets['prepare'][0]==1536
    assert budgets['read'][0]==3072
    assert budgets['define'][0]==768
    assert budgets['read'][1]==min(8192,8000-budgets['read'][2]-256)
    assert groq_budget('read',{},'instruction',{},image=True)[2]==budgets['read'][2]+2048
    assert groq_budget('read',{},'instruction',{'description':'x'*300})[2]>budgets['read'][2]
    assert groq_budget('read',{},'x'*10000,{})[1]<budgets['read'][1]


def test_long_passages_have_more_output_capacity():
    short={'source':{'chunks':[{'text':'x'*100}]}}
    long={'source':{'chunks':[{'text':'x'*3000}]}}
    assert groq_budget('simplify',short,'',None)[0]<groq_budget('simplify',long,'',None)[0]
    assert groq_budget('simplify',long,'',None)[0]>2000


def test_length_retries_at_larger_budget():
    async def execute():
        calls=[]
        def handle(req):
            calls.append(json.loads(req.content))
            return httpx.Response(200,json=completion(reason='length') if len(calls)==1 else completion())
        client=httpx.AsyncClient(transport=httpx.MockTransport(handle))
        async with GroqAdapter(Settings(groq_api_key='synthetic'),client=client) as adapter:
            assert (await adapter.generate(operation='simplify',system_instruction='x',data={},output_model=Result)).answer=='ok'
        assert calls[1]['max_completion_tokens']==2*calls[0]['max_completion_tokens']
    with patch('app.ai.groq.asyncio.sleep',new_callable=AsyncMock): asyncio.run(execute())


def test_length_at_limit_never_returns_partial_json():
    async def execute():
        calls=[]
        def handle(req):
            calls.append(req)
            return httpx.Response(200,json=completion(reason='length'))
        client=httpx.AsyncClient(transport=httpx.MockTransport(handle))
        async with GroqAdapter(Settings(groq_api_key='synthetic'),client=client) as adapter:
            with pytest.raises(AIError) as caught:
                await adapter.generate(operation='define',system_instruction='x',data={},output_model=Result)
            assert caught.value.code=='AI_INVALID_RESPONSE'
        assert len(calls)==1
    asyncio.run(execute())


def test_oversized_estimate_does_not_send_or_truncate_source():
    async def execute():
        client=AsyncMock()
        async with GroqAdapter(Settings(groq_api_key='synthetic'),client=client) as adapter:
            with pytest.raises(AIError) as caught:
                await adapter.generate(operation='simplify',system_instruction='x',data={'text':'x'*24000})
            assert caught.value.code=='RATE_LIMITED'
        client.post.assert_not_awaited()
    asyncio.run(execute())


def test_fidelity_and_concision_instructions():
    assert 'Literal transcription takes priority' in OCR_SYSTEM
    assert 'cut-off token only as its visible letters' in OCR_SYSTEM
    assert 'partial' in OCR_SYSTEM and 'quality uncertain' in OCR_SYSTEM
    assert 'State each idea once' in SIMPLIFY_SYSTEM
    assert 'Do not infer the converse' in SIMPLIFY_SYSTEM


def test_repetitive_simplification_rejected_inside_adapter():
    from app.services.reading import simplify_text
    from app.schemas.content import SimplifyRequest
    from app.tests.smoke_simplify import standalone_request
    async def execute():
        async def generate(**kwargs):
            bad={'items':[{'chunk_id':'c0001','text':'Plants need light. Plants need light.',
                           'source_quotes':['Green plants']} ]}
            from pydantic import ValidationError
            with pytest.raises(ValidationError): kwargs['output_model'].model_validate(bad)
            # The fake adapter deliberately stops here after checking the validator.
            raise AIError('AI_INVALID_RESPONSE',502,'Invalid response')
        with pytest.raises(AIError):
            await simplify_text(type('Adapter',(),{'generate':staticmethod(generate)})(),SimplifyRequest.model_validate(standalone_request()))
    asyncio.run(execute())


@pytest.mark.parametrize('condition',['only if','only when','unless'])
def test_condition_strengthening_rejected(condition):
    from app.services.reading import simplify_text
    from app.schemas.content import SimplifyRequest
    from app.tests.smoke_simplify import standalone_request
    from pydantic import ValidationError
    request=standalone_request()
    request['source']['chunks'][0]['text']='The sample contains 20 mL of water if light is available.'
    request['source'].update(key_terms=[],key_terms_status='available')
    async def execute():
        async def generate(**kwargs):
            with pytest.raises(ValidationError):
                kwargs['output_model'].model_validate({'items':[{'chunk_id':'c0001',
                    'text':'The sample contains 20 mL of water '+condition+' light is available.',
                    'source_quotes':['The sample contains 20 mL of water if light is available.']}]})
            raise AIError('AI_INVALID_RESPONSE',502,'Invalid response')
        with pytest.raises(AIError):
            await simplify_text(type('Adapter',(),{'generate':staticmethod(generate)})(),SimplifyRequest.model_validate(request))
    asyncio.run(execute())
