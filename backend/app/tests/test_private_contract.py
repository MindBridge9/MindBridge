"""Opt-in private-pack checks, never a public CI dependency.

From backend: MINDBRIDGE_PRIVATE_CONTRACT=1 python -m pytest app/tests -q
The normal test run skips this module without reading the private pack.
"""
import json
import os
from pathlib import Path

import pytest
from pydantic import TypeAdapter, ValidationError

if os.environ.get('MINDBRIDGE_PRIVATE_CONTRACT') != '1':
    pytest.skip('Private planning pack checks are opt-in.', allow_module_level=True)

from app.schemas import content, errors, health, learning, local

ROOT = Path(__file__).resolve().parents[3]
SCHEMAS = json.loads((ROOT / 'docs/contracts/openapi.json').read_text())['components']['schemas']
FIXTURES = ROOT / 'docs/fixtures'
MANIFEST = json.loads((FIXTURES / 'manifest.json').read_text())['fixtures']
MODELS = {name: getattr(module, name) for name in SCHEMAS
          for module in (content, errors, health, learning, local) if hasattr(module, name)}


@pytest.mark.parametrize('entry', MANIFEST, ids=lambda x: x['file'])
def test_private_fixture(entry):
    payload = (FIXTURES / entry['file']).read_text()
    adapter = TypeAdapter(MODELS[entry['schema']])
    if entry['valid']:
        adapter.validate_json(payload)
    else:
        with pytest.raises(ValidationError):
            adapter.validate_json(payload)


def normalize(node, definitions):
    if isinstance(node, list):
        return [normalize(x, definitions) for x in node]
    if not isinstance(node, dict):
        return node
    if '$ref' in node:
        return normalize(definitions[node['$ref'].split('/')[-1]], definitions)
    result = {k: normalize(v, definitions) for k, v in node.items()
              if k not in ('title', 'description', '$defs')}
    if 'const' in result:
        result.pop('type', None)
    if 'enum' in result and len(result['enum']) == 1:
        result['const'] = result.pop('enum')[0]
        result.pop('type', None)
    return result


@pytest.mark.parametrize('name', list(SCHEMAS))
def test_schema_equivalence(name):
    generated = TypeAdapter(MODELS[name]).json_schema()
    assert normalize(generated, generated.get('$defs', {})) == normalize(SCHEMAS[name], SCHEMAS)


def test_required_nullable_extra_fields():
    for entry in MANIFEST:
        if not entry['valid']:
            continue
        payload = json.loads((FIXTURES / entry['file']).read_text())
        adapter = TypeAdapter(MODELS[entry['schema']])
        schema = SCHEMAS[entry['schema']]
        for field in schema['required']:
            with pytest.raises(ValidationError):
                adapter.validate_python({k: v for k, v in payload.items() if k != field})
        with pytest.raises(ValidationError):
            adapter.validate_python({**payload, 'unexpected': 'rejected'})
        for field, spec in schema['properties'].items():
            if field not in payload or payload[field] is None:
                continue
            if not any(x.get('type') == 'null' for x in spec.get('anyOf', [])):
                with pytest.raises(ValidationError):
                    adapter.validate_python({**payload, field: None})


def test_all_seven_endpoint_request_and_success_contracts():
    from app.main import create_app
    from app.config import Settings
    approved=json.loads((ROOT / 'docs/contracts/openapi.json').read_text())['paths']
    actual=create_app(Settings(environment='development',ai_enabled=False)).openapi()['paths']
    assert set(actual)==set(approved) and len(actual)==7
    for path,operations in approved.items():
        for method,operation in operations.items():
            generated=actual[path][method]
            assert generated['operationId']==operation['operationId']
            assert generated['responses']['200']['content']==operation['responses']['200']['content']
            if path!='/api/read' and method=='post':
                assert generated['requestBody']['content']==operation['requestBody']['content']
            elif path=='/api/read':
                assert 'multipart/form-data' in generated['requestBody']['content']
