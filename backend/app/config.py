"""Backend configuration; process environment overrides the local .env file."""
import os
import shlex
from pathlib import Path
from typing import ClassVar, Literal

from pydantic import BaseModel, ConfigDict, Field, SecretStr, field_validator, model_validator


class Settings(BaseModel):
    model_config = ConfigDict(extra='forbid', frozen=True, hide_input_in_errors=True)
    # Readiness is an explicit reviewed allowlist, never inferred from secrets.
    approved_capabilities: tuple[Literal['read', 'simplify', 'define', 'explain', 'prepare_understanding'], ...] = ()
    synthetic_development_integration: bool = False
    ai_enabled: bool = True
    ai_fallback_enabled: bool = False
    client_requests_per_minute: int = Field(default=6, ge=1, le=1000)
    global_requests_per_minute: int = Field(default=12, ge=1, le=10000)
    global_requests_per_day: int = Field(default=400, ge=1, le=1000000)
    max_rate_limit_clients: int = Field(default=2048, ge=1, le=100000)
    trusted_proxy_cidrs: tuple[str, ...] = ()
    ai_provider: Literal['gemini', 'groq'] = 'gemini'
    groq_api_key: SecretStr | None = Field(default=None, repr=False)
    groq_model: str = Field(default='qwen/qwen3.8-27b', min_length=1)
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

    @field_validator('trusted_proxy_cidrs')
    @classmethod
    def explicit_proxy_networks(cls, values):
        from ipaddress import ip_network
        for value in values:
            network = ip_network(value, strict=False)
            if network.prefixlen == 0:
                raise ValueError('Trust explicit proxy networks, never all addresses.')
        return values

    @model_validator(mode='after')
    def fallback_configuration(self):
        if self.synthetic_development_integration and self.environment != 'development':
            raise ValueError('Synthetic integration is restricted to development; no production acceptance is implied.')
        if self.ai_fallback_enabled and (self.ai_provider != 'groq' or
            not self.groq_api_key or not self.groq_api_key.get_secret_value().strip() or
            not self.gemini_api_key or not self.gemini_api_key.get_secret_value().strip()):
            raise ValueError('Fallback requires Groq primary and both backend API keys.')
        return self

    def validate_production(self):
        from urllib.parse import urlsplit
        from ipaddress import ip_address
        if self.environment != 'production' or not self.cors_origins:
            raise ValueError('Production requires explicit production mode and frontend origins.')
        for origin in self.cors_origins:
            parsed = urlsplit(origin)
            if parsed.scheme != 'https' or parsed.hostname in ('localhost', 'testclient'):
                raise ValueError('Production frontend origins require HTTPS and public hosts.')
            try:
                address = ip_address(parsed.hostname)
            except ValueError:
                address = None
            if address is not None and not address.is_global:
                raise ValueError('Production frontend origins require public hosts.')
            if parsed.hostname.endswith('.localhost'):
                raise ValueError('Production frontend origins require public hosts.')
        key = self.groq_api_key if self.ai_provider == 'groq' else self.gemini_api_key
        if self.ai_enabled and (key is None or not key.get_secret_value().strip()):
            raise ValueError('The selected production provider requires its backend API key.')

    @field_validator('gemini_model', 'groq_model')
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
                    or parsed.username is not None or parsed.password is not None or '*' in origin
                    or parsed.hostname is None or not origin.isascii() or any(c.isspace() for c in origin)):
                raise ValueError('CORS requires explicit HTTP origins without trailing paths.')
            if parsed.port is not None and not 1 <= parsed.port <= 65535:
                raise ValueError('CORS requires a valid port.')
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
                if separator and name in ('GEMINI_API_KEY', 'GEMINI_MODEL', 'GROQ_API_KEY', 'GROQ_MODEL', 'AI_PROVIDER', 'CORS_ORIGINS', 'MINDBRIDGE_ENV', 'AI_ENABLED', 'AI_FALLBACK_ENABLED',
                    'CLIENT_REQUESTS_PER_MINUTE', 'GLOBAL_REQUESTS_PER_MINUTE', 'GLOBAL_REQUESTS_PER_DAY',
                    'MAX_RATE_LIMIT_CLIENTS', 'TRUSTED_PROXY_CIDRS', 'APPROVED_CAPABILITIES', 'SYNTHETIC_DEVELOPMENT_INTEGRATION'):
                    try:
                        parts = shlex.split(raw, comments=True)
                    except ValueError:
                        raise ValueError('Invalid backend environment file syntax.') from None
                    if len(parts) > 1:
                        raise ValueError('Quote environment values containing spaces.')
                    values[name] = parts[0] if parts else ''
        values.update(os.environ)
        return cls(
            approved_capabilities=tuple(x.strip() for x in values.get('APPROVED_CAPABILITIES', '').split(',') if x.strip()),
            synthetic_development_integration=values.get('SYNTHETIC_DEVELOPMENT_INTEGRATION', 'false'),
            ai_enabled=values.get('AI_ENABLED', 'true'),
            ai_fallback_enabled=values.get('AI_FALLBACK_ENABLED', 'false'),
            client_requests_per_minute=values.get('CLIENT_REQUESTS_PER_MINUTE', 6),
            global_requests_per_minute=values.get('GLOBAL_REQUESTS_PER_MINUTE', 12),
            global_requests_per_day=values.get('GLOBAL_REQUESTS_PER_DAY', 400),
            max_rate_limit_clients=values.get('MAX_RATE_LIMIT_CLIENTS', 2048),
            trusted_proxy_cidrs=tuple(x.strip() for x in values.get('TRUSTED_PROXY_CIDRS', '').split(',') if x.strip()),
            ai_provider=values.get('AI_PROVIDER', 'gemini'),
            groq_api_key=values.get('GROQ_API_KEY') or None,
            groq_model=values.get('GROQ_MODEL', 'qwen/qwen3.8-27b'),
            gemini_api_key=values.get('GEMINI_API_KEY') or None,
            gemini_model=values.get('GEMINI_MODEL', 'gemini-3.5-flash-lite'),
            environment=values.get('MINDBRIDGE_ENV', 'production'),
            cors_origins=tuple(x.strip() for x in values.get(
                'CORS_ORIGINS', 'http://localhost:5173').split(',') if x.strip()),
        )
