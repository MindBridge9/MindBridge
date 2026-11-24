"""Backend configuration; process environment overrides the local .env file."""
import os
import shlex
from pathlib import Path
from typing import ClassVar, Literal

from pydantic import BaseModel, ConfigDict, Field, SecretStr, field_validator


class Settings(BaseModel):
    model_config = ConfigDict(extra='forbid', frozen=True, hide_input_in_errors=True)
    gemini_api_key: SecretStr | None = Field(default=None, repr=False)
    gemini_model: str = Field(default='gemini-3.5-flash-lite', min_length=1)
    environment: Literal['development', 'production'] = 'production'
    cors_origins: tuple[str, ...] = ('http://localhost:5173',)
    max_image_bytes: ClassVar[int] = 8 * 1024 * 1024
    max_upload_body_bytes: ClassVar[int] = 9 * 1024 * 1024
    max_json_body_bytes: ClassVar[int] = 256 * 1024
    max_image_pixels: ClassVar[int] = 20_000_000
    max_image_dimension: ClassVar[int] = 10_000
    max_source_chars: ClassVar[int] = 12_000
    max_page_chars: ClassVar[int] = 30_000
    max_answer_chars: ClassVar[int] = 2_000
    read_deadline_seconds: ClassVar[int] = 75
    text_deadline_seconds: ClassVar[int] = 35
    read_call_timeout_seconds: ClassVar[int] = 45
    text_call_timeout_seconds: ClassVar[int] = 15
    read_max_output_tokens: ClassVar[int] = 8192
    simplify_max_output_tokens: ClassVar[int] = 4096
    learning_max_output_tokens: ClassVar[int] = 4096
    explanation_max_output_tokens: ClassVar[int] = 1536
    max_provider_attempts: ClassVar[int] = 2
    max_concurrent_ai_calls: ClassVar[int] = 2

    @field_validator('gemini_model')
    @classmethod
    def model_not_blank(cls, value):
        if not value.strip():
            raise ValueError('Model must not be blank.')
        return value

    @field_validator('cors_origins')
    @classmethod
    def explicit_origins(cls, origins):
        from urllib.parse import urlsplit
        for origin in origins:
            parsed = urlsplit(origin)
            if (parsed.scheme not in ('http', 'https') or not parsed.netloc
                    or parsed.path or parsed.query or parsed.fragment
                    or parsed.username or parsed.password or '*' in origin):
                raise ValueError('CORS requires explicit HTTP origins without trailing paths.')
        return origins

    @classmethod
    def from_env(cls, env_file: Path | None = None):
        values = {}
        path = env_file if env_file is not None else Path(__file__).resolve().parents[1] / '.env'
        if path.is_file():
            # Only these settings are read; no expansion, execution or environment mutation.
            for line in path.read_text().splitlines():
                name, separator, raw = line.removeprefix('export ').partition('=')
                name = name.strip()
                if separator and name in ('GEMINI_API_KEY', 'GEMINI_MODEL', 'CORS_ORIGINS', 'MINDBRIDGE_ENV'):
                    try:
                        parts = shlex.split(raw, comments=True)
                    except ValueError:
                        raise ValueError('Invalid backend environment file syntax.') from None
                    if len(parts) > 1:
                        raise ValueError('Quote environment values containing spaces.')
                    values[name] = parts[0] if parts else ''
        values.update(os.environ)
        return cls(
            gemini_api_key=values.get('GEMINI_API_KEY') or None,
            gemini_model=values.get('GEMINI_MODEL', 'gemini-3.5-flash-lite'),
            environment=values.get('MINDBRIDGE_ENV', 'production'),
            cors_origins=tuple(x.strip() for x in values.get(
                'CORS_ORIGINS', 'http://localhost:5173').split(',') if x.strip()),
        )
