"""Wire primitives preserve submitted text and reject coercion/unknown fields."""
import re
from datetime import datetime, timedelta
from typing import Annotated
from uuid import UUID

from pydantic import AfterValidator, BaseModel, ConfigDict, Field, field_validator


def non_blank(value: str) -> str:
    if isinstance(value, str) and not value.strip():
        raise ValueError('Text must contain non-whitespace characters.')
    return value


def uuid_string(value: str) -> str:
    if not re.fullmatch(r'[0-9a-fA-F]{8}(?:-[0-9a-fA-F]{4}){3}-[0-9a-fA-F]{12}', value):
        raise ValueError('Expected a UUID.')
    UUID(value)
    return value


def utc_datetime(value: str) -> str:
    if not re.fullmatch(r'\d{4}-\d{2}-\d{2}[Tt]\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:[Zz]|[+-]\d{2}:\d{2})', value):
        raise ValueError('Expected an RFC3339 timestamp.')
    parsed = datetime.fromisoformat(value.upper().replace('Z', '+00:00'))
    if parsed.utcoffset() != timedelta(0):
        raise ValueError('Expected a UTC timestamp.')
    return value


def omit_default(schema: dict) -> None:
    # target_concept may be absent, but explicit null is not in the contract.
    schema.pop('default', None)


NonBlank = str
UUIDString = Annotated[NonBlank, AfterValidator(uuid_string), Field(json_schema_extra={'format': 'uuid'})]
UTCDateTimeString = Annotated[NonBlank, AfterValidator(utc_datetime), Field(json_schema_extra={'format': 'date-time'})]


class WireModel(BaseModel):
    model_config = ConfigDict(extra='forbid', strict=True, hide_input_in_errors=True)

    @field_validator('*')
    @classmethod
    def reject_blank_text(cls, value):
        def check(item):
            if isinstance(item, str):
                non_blank(item)
            elif isinstance(item, list):
                for child in item:
                    check(child)
        check(value)
        return value
