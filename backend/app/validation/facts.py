"""Basic FactGuard: lexical preservation signals, never semantic fact verification.

Only explicit source terms can support name/detail warnings. Known unit aliases,
numeric formatting and exact supported conversions avoid unnecessary warnings.
Unsupported paraphrases/conversions can still produce possible-issue warnings.
"""
import re
from dataclasses import dataclass
from datetime import date
from decimal import Decimal, InvalidOperation
from fractions import Fraction
from typing import Annotated, Literal

from pydantic import Field, TypeAdapter, ValidationError

from app.ai.client import AIError
from app.schemas.content import OmissionWarning, SourceContext
from app.validation.sources import phrase_span, require_chunk, validate_source

_NUMBER = re.compile(r'(?<![\w.])[+\-−]?(?:(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?|\.\d+)(?:[eE][+\-]?\d+)?(?!\d|[.,]\d)')

# Symbol case is significant (m is not M); written aliases are explicit.
_UNITS = {
    'mm': ('length', '.001'), 'cm': ('length', '.01'), 'm': ('length', '1'), 'km': ('length', '1000'),
    'millimeter': ('length', '.001'), 'millimeters': ('length', '.001'),
    'centimeter': ('length', '.01'), 'centimeters': ('length', '.01'),
    'meter': ('length', '1'), 'meters': ('length', '1'), 'metre': ('length', '1'), 'metres': ('length', '1'),
    'kilometer': ('length', '1000'), 'kilometers': ('length', '1000'),
    'mg': ('mass', '.001'), 'g': ('mass', '1'), 'kg': ('mass', '1000'),
    'gram': ('mass', '1'), 'grams': ('mass', '1'), 'kilogram': ('mass', '1000'), 'kilograms': ('mass', '1000'),
    'mL': ('volume', '.001'), 'ml': ('volume', '.001'), 'L': ('volume', '1'), 'l': ('volume', '1'),
    'milliliter': ('volume', '.001'), 'milliliters': ('volume', '.001'),
    'millilitre': ('volume', '.001'), 'millilitres': ('volume', '.001'),
    'liter': ('volume', '1'), 'liters': ('volume', '1'), 'litre': ('volume', '1'), 'litres': ('volume', '1'),
    'ms': ('time', '.001'), 's': ('time', '1'), 'sec': ('time', '1'),
    'second': ('time', '1'), 'seconds': ('time', '1'), 'min': ('time', '60'),
    'minute': ('time', '60'), 'minutes': ('time', '60'), 'h': ('time', '3600'),
    'hour': ('time', '3600'), 'hours': ('time', '3600'),
    '%': ('percent', '1'), 'percent': ('percent', '1'), 'per cent': ('percent', '1'),
    '°C': ('temperature_c', '1'), '°F': ('temperature_f', '1'), 'K': ('temperature_k', '1'),
    'm²': ('area', '1'), 'cm²': ('area', '.0001'), 'm^2': ('area', '1'), 'cm^2': ('area', '.0001'),
    'm³': ('volume', '1000'), 'cm³': ('volume', '.001'),
    'N': ('force', '1'), 'J': ('energy', '1'), 'kJ': ('energy', '1000'),
    'W': ('power', '1'), 'V': ('voltage', '1'), 'A': ('current', '1'),
    'Pa': ('pressure', '1'), 'kPa': ('pressure', '1000'),
    'm/s': ('speed', '1'), 'km/h': ('speed', '5/18'),
    'm/s²': ('acceleration', '1'), 'm/s^2': ('acceleration', '1'),
    'kg/m³': ('density', '1'), 'g/cm³': ('density', '1000'), 'g/mL': ('density', '1000'),
    'mol': ('amount', '1'), 'mmol': ('amount', '.001'),
}
_UNIT = re.compile(r'\s*(?P<unit>' + '|'.join(re.escape(u) for u in sorted(_UNITS, key=len, reverse=True)) + r')(?!\w)')
_MONTHS = ('january february march april may june july august september october november december').split()
_MONTH_MAP = {alias: i for i, name in enumerate(_MONTHS, 1) for alias in (name, name[:3])}
_MONTH = r'(?:' + '|'.join(sorted(_MONTH_MAP, key=len, reverse=True)) + r')\.?'
_DATE = re.compile(r'(?<!\w)(?:\d{4}-\d{2}-\d{2}|\d{1,2}[/\-]\d{1,2}[/\-]\d{4}|'
                   r'\d{1,2}(?:st|nd|rd|th)?\s+' + _MONTH + r'\s+\d{4}|'
                   + _MONTH + r'\s+\d{1,2}(?:st|nd|rd|th)?,?\s+\d{4})(?!\w)', re.IGNORECASE)


@dataclass(frozen=True)
class ExplicitDetail:
    """Internal classification of an EXISTING validated key term; no new wire field."""
    phrase: str
    kind: Literal['name', 'key_detail']


@dataclass(frozen=True)
class FactGuardResult:
    warnings: tuple[OmissionWarning, ...]
    preserved_terms: tuple[str, ...]
    terminology_check_status: Literal['checked', 'unavailable']


@dataclass(frozen=True)
class _Number:
    start: int
    end: int
    raw: str
    value: Decimal
    unit: str | None
    unit_end: int


def _dates(text):
    result = []
    for match in _DATE.finditer(text):
        raw = match.group()
        try:
            if re.fullmatch(r'\d{4}-\d{2}-\d{2}', raw):
                key = date.fromisoformat(raw)
            elif re.fullmatch(r'\d{1,2}[/\-]\d{1,2}[/\-]\d{4}', raw):
                # No assumed locale for ambiguous numeric dates. Keep their order.
                day, month, year = map(int, re.split(r'[/\-]', raw))
                if not ((1 <= month <= 12 and 1 <= day <= 31) or (1 <= day <= 12 and 1 <= month <= 31)):
                    continue
                valid = False
                for d, m in ((day, month), (month, day)):
                    try:
                        date(year, m, d)
                        valid = True
                    except ValueError:
                        pass
                if not valid:
                    continue
                key = ('numeric_date', day, month, year)
            else:
                words = re.sub(r'(\d)(st|nd|rd|th)\b', r'\1', raw.casefold())
                tokens = re.findall(r'\d+|[a-z]+', words)
                if tokens[0].isdigit():
                    day, month, year = int(tokens[0]), _MONTH_MAP[tokens[1]], int(tokens[2])
                else:
                    month, day, year = _MONTH_MAP[tokens[0]], int(tokens[1]), int(tokens[2])
                key = date(year, month, day)
        except (ValueError, KeyError):
            continue
        result.append((match.start(), match.end(), raw, key))
    return result


def _numbers(text, dates, *, generated=False):
    result = []
    for match in _NUMBER.finditer(text):
        if any(start <= match.start() < end for start, end, _, _ in dates):
            continue
        # SI superscripts are units, not additional independent numeric facts.
        if match.start() and text[match.start()-1] == '^':
            continue
        raw = match.group()
        try:
            if len(raw) > 160:
                raise ValueError()
            value = Decimal(raw.replace(',', '').replace('−', '-'))
            if abs(value.as_tuple().exponent) > 1000:
                raise ValueError()
        except (ValueError, InvalidOperation):
            if generated:
                raise AIError('AI_INVALID_RESPONSE', 502, 'A generated numeric value exceeds the supported preservation-check limits.', retryable=True) from None
            raise AIError('CONTENT_UNSUPPORTED', 422, 'A numeric value exceeds the supported preservation-check limits.') from None
        unit = _UNIT.match(text, match.end())
        result.append(_Number(match.start(), match.end(), raw,
                              value,
                              unit['unit'] if unit else None, unit.end() if unit else match.end()))
    return result


def _quantity(number):
    dimension, factor = _UNITS[number.unit]
    value = Fraction(number.value) * Fraction(factor)
    if dimension == 'temperature_c':
        return 'temperature', value + Fraction('273.15')
    if dimension == 'temperature_f':
        return 'temperature', (value - 32) * Fraction(5, 9) + Fraction('273.15')
    if dimension == 'temperature_k':
        return 'temperature', value
    return dimension, value


def _equivalent(left, right):
    ld, lv = _quantity(left)
    rd, rv = _quantity(right)
    return ld == rd and lv == rv


def _frame(text, number):
    # Exact surrounding wording gives defensible correspondence. Paraphrased or
    # ambiguous surroundings deliberately do NOT justify changed_number.
    return ' '.join((text[:number.start] + '<number>' + text[number.end:]).casefold().split())


def check_facts(source: SourceContext | dict, chunk_id: str, generated_text: str,
                *, explicit_details: tuple[ExplicitDetail, ...] = ()) -> FactGuardResult:
    source = validate_source(source)
    chunk = require_chunk(source, chunk_id)
    try:
        TypeAdapter(Annotated[str, Field(min_length=1, max_length=4500)]).validate_python(generated_text, strict=True)
        if not generated_text.strip():
            raise ValueError()
    except (ValidationError, ValueError):
        raise AIError('AI_INVALID_RESPONSE', 502, 'Generated text could not be validated.', retryable=True) from None
    original = chunk.text
    terms = [t for t in source.key_terms if chunk_id in t.chunk_ids]
    classifications = {}
    for detail in explicit_details:
        if (not isinstance(detail, ExplicitDetail) or detail.kind not in ('name', 'key_detail')
                or not isinstance(detail.phrase, str)
                or detail.phrase.casefold() not in {t.term.casefold() for t in terms}
                or detail.phrase.casefold() in classifications):
            raise AIError('VALIDATION_ERROR', 422, 'Details must identify unique validated source terms.') from None
        classifications[detail.phrase.casefold()] = 'missing_' + detail.kind
    warnings, seen = [], set()

    def warn(code, source_value, generated_value=None):
        key = code, source_value, generated_value
        if key in seen:
            return
        if len(source_value) > 160 or generated_value is not None and len(generated_value) > 160 or len(warnings) >= 30:
            raise AIError('AI_INVALID_RESPONSE', 502, 'Too many or overly long possible omissions. Use a smaller source selection.', retryable=True) from None
        seen.add(key)
        warnings.append(OmissionWarning(code=code, chunk_id=chunk_id, source_value=source_value,
                                        generated_value=generated_value,
                                        message='A source detail may be missing or changed. Compare it with the original; paraphrases or conversions may explain the difference.'))

    source_dates, output_dates = _dates(original), _dates(generated_text)
    for _, _, raw, value in source_dates:
        if not any(value == other for _, _, _, other in output_dates):
            warn('missing_date', raw)
    numbers, output_numbers = _numbers(original, source_dates), _numbers(generated_text, output_dates, generated=True)
    for number in numbers:
        number_changed = False
        if number.unit and any(other.unit and _equivalent(number, other) for other in output_numbers):
            continue
        # A percentage requires percentage context; an unrelated bare value is
        # not preservation of 20% (nor is 20% preservation of a plain 20).
        same_value = [other for other in output_numbers if other.value == number.value
                      and ((number.unit in ('%', 'percent', 'per cent')) == (other.unit in ('%', 'percent', 'per cent')))]
        if not same_value:
            counterparts = [other for other in output_numbers
                            if other.value != number.value and _frame(original, number) == _frame(generated_text, other)]
            if len(counterparts) == 1:
                warn('changed_number', number.raw, counterparts[0].raw)
                number_changed = True
            else:
                warn('missing_number', number.raw)
        if number.unit:
            dimension, factor = _UNITS[number.unit]
            aliases = [name for name, unit in _UNITS.items() if unit == (dimension, factor)]
            unit_present = any(phrase_span(alias, generated_text) for alias in aliases) or any(other.unit in aliases for other in output_numbers)
            if not unit_present:
                warn('missing_unit', number.unit)
            elif not number_changed and not any(other.unit in aliases and other.value == number.value for other in output_numbers):
                warn('missing_unit', original[number.start:number.unit_end])
    preserved = []
    for term in terms:
        if phrase_span(term.term, generated_text):
            preserved.append(term.term)
        else:
            start, end = phrase_span(term.term, original)
            warn(classifications.get(term.term.casefold(), 'missing_term'), original[start:end])
    return FactGuardResult(tuple(warnings), tuple(preserved),
                           'checked' if source.key_terms_status == 'available' else 'unavailable')
