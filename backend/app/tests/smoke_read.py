"""Opt-in B03 smoke. cd backend && .venv/bin/python -m app.tests.smoke_read.

Uses original synthetic text/image and the actual API handler/provider adapter.
No automatic test discovery, fixture fallback or provider-content logging.
"""
import io
import argparse
import json
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from unittest.mock import patch

from fastapi.testclient import TestClient
from google import genai
from google.genai import errors, types
from PIL import Image, ImageDraw, ImageFont
from pydantic import ValidationError

from app.config import Settings
from app.main import create_app
from app.schemas.content import ReadResult
from app.schemas.errors import APIError
from app.services.reading import OCRResponse

LINES = ['Plant nutrition', 'Plants use sunlight to make glucose from carbon dioxide and water.',
         'A leaf is 12 cm long.', '- Water enters through roots.', 'Figure 1: A green leaf.']


def main(thinking=None):
    evidence = {'timestamp_utc': datetime.now(timezone.utc).isoformat(), 'attempts': []}
    settings = Settings.from_env()
    evidence['model'] = settings.gemini_model
    original_client = genai.Client

    def measured_client(*args, **kwargs):
        client = original_client(*args, **kwargs)
        aio = client.aio
        original_generate = aio.models.generate_content

        async def measured_generate(**kwargs):
            row, started = {}, time.perf_counter()
            if thinking == 'minimal':
                kwargs['config'].thinking_config = types.ThinkingConfig(thinking_level='MINIMAL')
            try:
                result = await original_generate(**kwargs)
                row['status'] = 'success'
                try:
                    OCRResponse.model_validate_json(result.text)
                    row['core_valid'] = True
                except ValidationError as exc:
                    row['core_valid'] = False
                    row['validation_error_types'] = [e['type'] for e in exc.errors(include_input=False, include_context=False)]
                return result
            except errors.APIError as exc:
                # Only allowlisted boolean diagnostics; never emit provider prose.
                msg = (exc.message or '').lower()
                row.update(status='provider_error', http_status=exc.code,
                           schema_complexity=any(s in msg for s in ['too many states', 'too complex', 'complexity', 'nesting depth']),
                           schema_rejected='schema' in msg, invalid_argument=exc.status == 'INVALID_ARGUMENT')
                raise
            finally:
                row['latency_seconds'] = round(time.perf_counter()-started, 3)
                evidence['attempts'].append(row)

        aio.models.generate_content = measured_generate
        return client

    with Image.new('RGB', (1400,600), 'white') as image, io.BytesIO() as stream:
        draw, font = ImageDraw.Draw(image), ImageFont.load_default(size=32)
        for i, line in enumerate(LINES):
            draw.text((40,40+i*85),line,font=font,fill='black')
        image.save(stream, format='PNG')
        data = stream.getvalue()
    Path('/tmp/mindbridge-b03-page.png').write_bytes(data)
    with patch('app.ai.client.genai.Client', side_effect=measured_client):
        with TestClient(create_app(settings)) as api:
            started = time.perf_counter()
            response = api.post('/api/read', files={'image':('synthetic-page.png',data,'image/png')})
            evidence.update(http_status=response.status_code, latency_seconds=round(time.perf_counter()-started,3))
            if response.status_code == 200:
                result = ReadResult.model_validate(response.json())
                evidence.update(schema_valid=True, readability=result.readability, page_present=result.page is not None)
                page = result.page
                if page:
                    chunks={c.id:c for c in page.chunks}
                    refs=([*page.summary.source_refs] if page.summary else [])+[r for e in page.glossary for r in e.source_refs]
                    evidence.update(exact_source=' '.join(' '.join(c.text for c in page.chunks).split()) == ' '.join(LINES),
                                    chunk_kinds=[c.kind for c in page.chunks], enrichment_status=page.enrichment_status,
                                    key_terms_count=len(page.key_terms), glossary_count=len(page.glossary),
                                    exact_clear_refs=all(r.chunk_id in chunks and chunks[r.chunk_id].quality=='clear' and r.quote in chunks[r.chunk_id].text for r in refs))
            else:
                evidence['error_code'] = APIError.model_validate(response.json()).error.code
    Path('/tmp/mindbridge-b03-evidence.json').write_text(json.dumps(evidence,indent=2))
    print(json.dumps(evidence))
    return response.status_code==200 and evidence.get('exact_source',False)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--thinking', choices=['minimal'])
    sys.exit(0 if main(parser.parse_args().thinking) else 1)
