"""Groq chat completions using the existing HTTPX dependency, without SDK retries."""
import asyncio
import base64
import json
from types import SimpleNamespace
from uuid import uuid4

import httpx
from pydantic import BaseModel, ValidationError

from .budgets import groq_budget
from .attempts import active_budget
from .client import AIError, _backoff, _invalid, _timeout, _unavailable, _retry_after, logger


def strict_schema(model):
    # Use the underlying Pydantic schema, NOT Gemini's OCR override, which
    # deliberately leaves enrichment open. Groq strict mode requires closed
    # objects and every property required (nullable where appropriate).
    schema = BaseModel.model_json_schema.__func__(model)

    def convert(node):
        if isinstance(node, list):
            return [convert(v) for v in node]
        if not isinstance(node, dict):
            return node
        result = {k: convert(v) for k, v in node.items() if k not in {
            'title', 'default', 'minLength', 'maxLength', 'pattern', 'format',
            'minimum', 'maximum', 'exclusiveMinimum', 'exclusiveMaximum',
            'multipleOf', 'minItems', 'maxItems'}}
        if result.get('type') == 'object':
            if 'properties' not in result:
                raise ValueError('Groq strict output requires typed object properties.')
            result['additionalProperties'] = False
            result['required'] = list(result['properties'])
        return result
    return convert(schema)


def provider_failure(response):
    status = response.status_code
    hint = _retry_after(SimpleNamespace(details={}, response=response))
    public_hint = hint if hint is not None and 1 <= hint <= 86400 else None
    daily_tokens = False
    try:
        error = response.json().get('error', {})
        code = error.get('code') if isinstance(error, dict) else None
        message = str(error.get('message', '')).lower() if isinstance(error, dict) else ''
        daily_tokens = any(x in message for x in ('tokens per day', 'requests per day', '(tpd)', '(rpd)'))
    except (ValueError, AttributeError):
        code = None
    if status == 429:
        # Groq documents remaining-requests as DAILY, not RPM. Unknown limits
        # must not be treated as transient just because a delay was supplied.
        daily = response.headers.get('x-ratelimit-remaining-requests') == '0'
        exhausted = daily or daily_tokens or code in ('insufficient_quota', 'quota_exceeded') or hint is None
        failure = AIError('AI_QUOTA_EXHAUSTED' if exhausted else 'RATE_LIMITED', 429,
                          'AI quota or rate limit reached. Try later.', retryable=True,
                          retry_after_seconds=public_hint)
        return failure, not exhausted, hint or 0
    if status in (408, 504):
        failure = _timeout(fallback_eligible=True)
        failure.retry_after_seconds = public_hint
        return failure, True, hint or 0
    if status == 400 and code == 'json_validate_failed':
        return _invalid(), True, hint or 0
    if status in (400, 413, 422):
        return AIError('AI_INVALID_RESPONSE', 502, 'The AI request configuration was rejected.'), False, 0
    transient = status in (500, 502, 503)
    return AIError('AI_UNAVAILABLE', 503, 'The AI service or configured model is unavailable.',
                   retryable=transient, retry_after_seconds=public_hint, fallback_eligible=transient), transient, hint or 0


def validate_response(body, output_model):
    try:
        choices = body['choices']
        if len(choices) != 1:
            raise _invalid()
        choice = choices[0]
        reason=choice.get('finish_reason')
        logger.info('groq_finish reason=%s', reason if reason in ('stop','length','content_filter','tool_calls') else 'other')
        message = choice['message']
        if message.get('refusal') or choice.get('finish_reason') == 'content_filter':
            raise AIError('CONTENT_UNSUPPORTED', 422, 'The AI service could not process this content.')
        if choice.get('finish_reason') != 'stop' or message.get('tool_calls') or message.get('function_call'):
            raise _invalid()
        text = message['content']
        if not isinstance(text, str) or not text.strip():
            raise _invalid()
        if output_model:
            try:
                return output_model.model_validate_json(text)
            except ValidationError as exc:
                # Only fixed validation categories; no input, context, or paths.
                allowed={'missing','extra_forbidden','literal_error','string_too_long',
                         'string_too_short','too_long','too_short','value_error','json_invalid'}
                kinds=sorted({e['type'] if e['type'] in allowed else 'other' for e in exc.errors(include_input=False,include_context=False)})
                logger.warning('groq_validation categories=%s', json.dumps(kinds))
                raise _invalid() from None
        return text
    except (KeyError, TypeError, IndexError, AttributeError, ValidationError, ValueError):
        raise _invalid() from None


class GroqAdapter:
    typed_ocr_schema = True
    def __init__(self, settings, *, client=None):
        self.settings = settings
        self._closed = False
        self._slots = asyncio.Semaphore(settings.max_concurrent_ai_calls)
        self._client = client or httpx.AsyncClient(follow_redirects=False)

    async def aclose(self):
        if not self._closed:
            self._closed = True
            await self._client.aclose()

    async def __aenter__(self):
        return self

    async def __aexit__(self, *args):
        await self.aclose()

    async def generate(self, *, operation, system_instruction, data, output_model=None,
                       image=None, mime_type=None):
        s = self.settings
        budgets = dict(read=s.read_max_output_tokens, simplify=s.simplify_max_output_tokens,
                       prepare=s.learning_max_output_tokens, check=s.learning_max_output_tokens,
                       define=s.explanation_max_output_tokens, explain=s.explanation_max_output_tokens)
        if operation not in budgets:
            raise ValueError('Unknown AI operation.')
        if image is not None and (not image or mime_type not in ('image/png', 'image/jpeg', 'image/webp')):
            raise ValueError('Inline image requires nonempty bytes and an approved MIME type.')
        if self._closed or not s.groq_api_key or not s.groq_api_key.get_secret_value().strip():
            raise _unavailable()
        encoded = json.dumps(data, ensure_ascii=False, allow_nan=False, separators=(',', ':'))
        content = [{'type': 'text', 'text': encoded}]
        if image is not None:
            content.append({'type': 'image_url', 'image_url': {
                'url': f'data:{mime_type};base64,' + base64.b64encode(image).decode('ascii')}})
        payload = dict(model=s.groq_model, messages=[{'role': 'system', 'content': system_instruction},
                       {'role': 'user', 'content': content}], max_completion_tokens=budgets[operation], stream=False)
        if s.groq_model == 'qwen/qwen3.8-27b':
            payload['reasoning_effort'] = 'none'
        if output_model:
            payload['response_format'] = {'type': 'json_schema', 'json_schema': {
                'name': 'mindbridge_output', 'strict': True, 'schema': strict_schema(output_model)}}
        schema = payload.get('response_format', {}).get('json_schema', {}).get('schema')
        budget, maximum, estimated_input = groq_budget(operation, data, system_instruction, schema, image=image is not None)
        # No source truncation to fit quota. Ask for a smaller section instead.
        if budget < 512:
            raise AIError('RATE_LIMITED', 429, 'This section exceeds the estimated AI token budget. Select a smaller section.', retryable=True)
        payload['max_completion_tokens'] = budget
        total = s.read_deadline_seconds if operation == 'read' else s.text_deadline_seconds
        ceiling = s.read_call_timeout_seconds if operation == 'read' else s.text_call_timeout_seconds
        loop = asyncio.get_running_loop()
        shared = active_budget.get()
        deadline = min(loop.time() + total, shared.deadline) if shared else loop.time() + total
        call_id = str(uuid4())
        try:
            async with asyncio.timeout_at(deadline):
                async with self._slots:
                    for attempt in range(1 if shared else s.max_provider_attempts):
                        started = loop.time()
                        wait = 0
                        row = dict(provider='groq', call_id=call_id, operation=operation, attempt=attempt + 1,
                                   input_bytes=len(encoded.encode()), image_bytes=len(image or b''),
                                   max_output_tokens=payload['max_completion_tokens'], estimated_input_tokens=estimated_input)
                        try:
                            timeout = min(ceiling, deadline - loop.time())
                            if shared:
                                shared.consume()
                            async with asyncio.timeout(timeout):
                                response = await self._client.post('https://api.groq.com/openai/v1/chat/completions',
                                    headers={'Authorization': 'Bearer ' + s.groq_api_key.get_secret_value()},
                                    json=payload, timeout=timeout)
                            row['upstream_http'] = response.status_code
                            if response.status_code != 200:
                                failure, retry, wait = provider_failure(response)
                                failure.provider_retry_after_seconds = wait
                                row['category'] = 'upstream_' + failure.code.lower()
                                row['retry_after_seconds'] = failure.retry_after_seconds
                            else:
                                try:
                                    body = response.json()
                                except ValueError:
                                    raise _invalid() from None
                                choices = body.get('choices') if isinstance(body, dict) else None
                                truncated = (isinstance(choices, list) and len(choices) == 1
                                             and isinstance(choices[0], dict) and choices[0].get('finish_reason') == 'length')
                                row['truncated'] = truncated
                                if truncated:
                                    # A partial JSON document is never accepted or continued.
                                    # The one existing retry may regenerate at a larger ceiling.
                                    larger = min(maximum, payload['max_completion_tokens'] * 2)
                                    if larger <= payload['max_completion_tokens']:
                                        failure, retry = _invalid(), False
                                        row['category'] = 'output_limit'
                                    else:
                                        payload['max_completion_tokens'] = larger
                                        raise _invalid()
                                else:
                                    result = validate_response(body, output_model)
                                if truncated:
                                    raise AIError('AI_INVALID_RESPONSE', 502, 'The AI output exceeded the available token budget. Select a smaller section.', retryable=True)
                                row.update(category='success', seconds=round(loop.time() - started, 3))
                                # Documented numeric quota metadata only; never arbitrary headers.
                                for name in ('x-ratelimit-limit-requests', 'x-ratelimit-limit-tokens',
                                             'x-ratelimit-remaining-requests', 'x-ratelimit-remaining-tokens'):
                                    value = response.headers.get(name, '')
                                    if value.isdigit() and len(value) < 12:
                                        row[name] = int(value)
                                logger.info('ai_attempt %s', json.dumps(row))
                                return result
                        except (TimeoutError, httpx.TimeoutException):
                            failure, retry = _timeout(fallback_eligible=True), True
                            row['category'] = 'timeout'
                        except httpx.TransportError:
                            failure, retry = _unavailable(fallback_eligible=True), True
                            row['category'] = 'transport'
                        except AIError as exc:
                            failure, retry = exc, exc.code == 'AI_INVALID_RESPONSE' and row.get('category') != 'output_limit'
                            row['category'] = 'local_' + exc.code.lower()
                        wait = max(wait, _backoff(attempt))
                        retry = retry and shared is None and attempt + 1 < s.max_provider_attempts and deadline - loop.time() >= wait + ceiling
                        row.update(seconds=round(loop.time() - started, 3), retry_scheduled=retry,
                                   retry_delay=round(wait, 3) if retry else None)
                        logger.warning('ai_attempt %s', json.dumps(row))
                        if not retry:
                            raise failure from None
                        await asyncio.sleep(wait)
        except TimeoutError:
            raise _timeout() from None
