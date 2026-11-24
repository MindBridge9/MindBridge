"""MindBridge v1 wire schemas; no runtime dependency on private planning files."""

from typing import Annotated, Literal

from pydantic import Field

from .base import NonBlank, WireModel


class APIErrorErrorDetailsItem(WireModel):
    field: Annotated[NonBlank, Field(min_length=1, max_length=200)]
    reason: Annotated[NonBlank, Field(min_length=1, max_length=300)]


class APIErrorError(WireModel):
    code: Literal['INVALID_REQUEST', 'IMAGE_TOO_LARGE', 'REQUEST_TOO_LARGE', 'UNSUPPORTED_IMAGE_TYPE', 'VALIDATION_ERROR', 'INVALID_IMAGE', 'INSUFFICIENT_SOURCE', 'UNSUPPORTED_LANGUAGE', 'CONTENT_UNSUPPORTED', 'RATE_LIMITED', 'AI_QUOTA_EXHAUSTED', 'FEATURE_UNAVAILABLE', 'AI_INVALID_RESPONSE', 'AI_UNAVAILABLE', 'SERVER_BUSY', 'AI_TIMEOUT', 'INTERNAL_ERROR', 'NOT_FOUND', 'METHOD_NOT_ALLOWED']
    message: Annotated[NonBlank, Field(min_length=1, max_length=500)]
    retryable: bool
    request_id: Annotated[NonBlank, Field(min_length=1, max_length=80, pattern='^[A-Za-z0-9][A-Za-z0-9_-]*$')]
    retry_after_seconds: Annotated[int, Field(ge=1, le=86400)] | None
    details: Annotated[list[APIErrorErrorDetailsItem], Field(min_length=0, max_length=20)]


class APIError(WireModel):
    error: APIErrorError
