"""Offline classification regressions; mocked outputs do not prove OCR perception."""
import copy
import io
import json
from unittest.mock import patch

import httpx
import pytest
from fastapi.testclient import TestClient
from PIL import Image, ImageDraw, ImageFont
from pydantic import ValidationError

from app.ai.groq import GroqAdapter
from app.ai.prompts import OCR_VERSION
from app.config import Settings
from app.main import create_app
from app.schemas.content import ReadResult
from app.services.reading import OCRResponse, build_result
from app.tests.test_read import api, output, upload
from app.validation.sources import select_source
from app.ai.client import AIError


def partial(reasons):
    return dict(readability='partial', retake_reasons=reasons, warnings=[], enrichment=None,
                blocks=[dict(block_index=1, kind='paragraph', quality='clear',
                             text='Plants use sunlight to make glucose.'),
                        dict(block_index=2, kind='paragraph', quality='uncertain',
                             text='Water enters through')])


@pytest.mark.parametrize('provider', ['gemini', 'groq'])
@pytest.mark.parametrize('reasons', [['cropped_text'], ['small_text'], ['small_text', 'cropped_text']])
def test_small_cropped_page_retains_usable_source(api, provider, reasons):
    data = partial(reasons)
    before = copy.deepcopy(data)
    # Real synthetic 509 x 655 raster; incomplete bottom line, small intact line.
    with Image.new('RGB', (509, 655), 'white') as im, io.BytesIO() as stream:
        draw = ImageDraw.Draw(im)
        font = ImageFont.load_default(size=16)
        draw.text((12, 30), data['blocks'][0]['text'], font=font, fill='black')
        draw.text((12, 645), data['blocks'][1]['text'], font=font, fill='black')
        im.save(stream, format='PNG')
        raster = stream.getvalue()
    if provider == 'gemini':
        api[1].models.generate_content.return_value = output(data)
        response = upload(api, raster)
        instruction = api[1].models.generate_content.call_args.kwargs['config'].system_instruction
        assert api[1].models.generate_content.await_count == 1
    else:
        requests = []
        def handle(request):
            requests.append(json.loads(request.content))
            return httpx.Response(200, json={'choices': [{'finish_reason': 'stop',
                'message': {'content': json.dumps(data)}}]})
        adapter = GroqAdapter(Settings(groq_api_key='synthetic-secret'),
                              client=httpx.AsyncClient(transport=httpx.MockTransport(handle)))
        with patch('app.ai.providers.create_provider', return_value=adapter):
            with TestClient(create_app(Settings(ai_provider='groq'))) as client:
                response = client.post('/api/read', files={'image': ('synthetic.png', raster, 'image/png')})
        assert len(requests) == 1
        instruction = requests[0]['messages'][0]['content']
    assert response.status_code == 200
    result = ReadResult.model_validate(response.json())
    assert result.readability == 'partial' and result.retake_reasons == reasons
    assert [(c.text, c.quality) for c in result.page.chunks] == [
        (b['text'], b['quality']) for b in data['blocks']]
    assert result.page.extraction_warnings[0].chunk_ids == ['c0002']
    assert data == before  # No invented completion or source mutation.
    assert OCR_VERSION == 'ocr-v4'
    assert 'Assess readability region by region' in instruction
    # Uncertain fragments remain ineligible for downstream generation.
    context = dict(page_id=result.page.id, chunks=[c.model_dump() for c in result.page.chunks],
                   key_terms=[], key_terms_status='unavailable')
    with pytest.raises(AIError):
        select_source(context, ['c0002'])


@pytest.mark.parametrize('blocks', [[], [dict(block_index=1, kind='heading', text='Plants', quality='clear')],
    [dict(block_index=1, kind='paragraph', text='Water enters', quality='uncertain')]])
def test_no_usable_prose_remains_unreadable(blocks):
    data = partial(['small_text', 'cropped_text'])
    data.update(readability='unreadable', blocks=blocks)
    result = build_result(OCRResponse.model_validate(data))
    assert result.page is None and result.readability == 'unreadable'
    assert result.retake_reasons == data['retake_reasons']


def test_contradictory_unreadable_output_still_rejected():
    data = partial(['cropped_text'])
    data['readability'] = 'unreadable'
    with pytest.raises(ValidationError):
        OCRResponse.model_validate(data)
