"""Validated single-worker production entry point. No deployment side effects."""
import os
import sys
import uvicorn
from .config import Settings


def production_options(settings, port):
    if sys.version_info[:2] != (3, 12):
        raise ValueError('This release requires Python 3.12.')
    settings.validate_production()
    if not str(port).isascii() or not str(port).isdigit() or not 1 <= int(port) <= 65535:
        raise ValueError('PORT must be an integer from 1 to 65535.')
    return dict(host='0.0.0.0', port=int(port), workers=1, proxy_headers=False,
                access_log=False, server_header=False)


def main():
    try:
        options = production_options(Settings.from_env(), os.environ.get('PORT', '10000'))
    except (ValueError, OSError):
        print('Invalid production configuration. Check Python, provider keys, CORS, fallback and PORT settings.', file=sys.stderr)
        raise SystemExit(2) from None
    uvicorn.run('app.main:app', **options)


if __name__ == '__main__': main()
