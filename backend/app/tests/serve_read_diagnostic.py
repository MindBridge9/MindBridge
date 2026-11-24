"""Temporary localhost diagnostic server; metadata-only provider attempt output."""
import json
import time
from unittest.mock import patch
import uvicorn
from google import genai
from google.genai import errors
from app.config import Settings


def main():
    original_client=genai.Client
    def factory(*args,**kwargs):
        client=original_client(*args,**kwargs)
        original=client.aio.models.generate_content
        async def generate(**kwargs):
            config=kwargs['config']
            started=time.perf_counter()
            row={'model':kwargs['model'],'tokens':config.max_output_tokens,
                 'thinking':str(config.thinking_config.thinking_level) if config.thinking_config else None}
            try:
                result=await original(**kwargs)
                row['status']='success'
                return result
            except errors.APIError as exc:
                msg=(exc.message or '').lower()
                row.update(status='provider_error',http_status=exc.code,overloaded='overload' in msg or 'capacity' in msg or 'high demand' in msg)
                raise
            except Exception as exc:
                row.update(status='transport_error',error_type=type(exc).__name__)
                raise
            finally:
                row['seconds']=round(time.perf_counter()-started,3)
                print(json.dumps(row),flush=True)
        client.aio.models.generate_content=generate
        return client
    with patch('app.ai.client.genai.Client',side_effect=factory):
        from app.main import create_app
        settings=Settings.from_env()
        print(json.dumps({'configured_model':settings.gemini_model,'key_configured':bool(settings.gemini_api_key)}),flush=True)
        uvicorn.run(create_app(settings),host='127.0.0.1',port=8765,workers=1)


if __name__=='__main__': main()
