"""SourceContext and exact evidence tests; synthetic text, no provider calls."""
import copy

import pytest
from pydantic import ValidationError

from app.ai.client import AIError
from app.schemas.content import SourceContext
from app.validation.sources import (phrase_present, phrase_span, require_chunk, select_source,
                                    validate_references, validate_source)


def source():
    return {'page_id':'11111111-1111-4111-8111-111111111111',
            'chunks':[{'id':'c0001','kind':'paragraph','text':'Water reaches the leaf.\nLight makes glucose.','quality':'clear'},
                      {'id':'c0002','kind':'paragraph','text':'Water also reaches roots.','quality':'clear'},
                      {'id':'c0003','kind':'caption','text':'A leaf fragment','quality':'uncertain'}],
            'key_terms':[{'term':'water','chunk_ids':['c0001','c0002']},
                         {'term':'glucose','chunk_ids':['c0001']}], 'key_terms_status':'available'}


def test_original_source_is_preserved_and_frozen():
    data=source(); before=copy.deepcopy(data)
    checked=validate_source(data)
    refs=validate_references(checked,[{'chunk_id':'c0001','quote':'leaf.\nLight'}],page_id=data['page_id'])
    assert refs[0].quote=='leaf.\nLight'
    assert data==before and checked.model_dump()==before
    with pytest.raises(ValidationError): checked.chunks[0].text='altered'


@pytest.mark.parametrize('change',[
    lambda d:d['chunks'].append(d['chunks'][0]),
    lambda d:d['chunks'][0].update(id='c0000'),
    lambda d:d['chunks'][0].update(id='c0101'),
    lambda d:d['chunks'][0].update(id='bad-id'),
    lambda d:d['chunks'].reverse(),
    lambda d:d['key_terms'][0].update(chunk_ids=['c0099']),
    lambda d:d['key_terms'][0].update(chunk_ids=['c0001','c0001']),
    lambda d:d['key_terms'].append({'term':'WATER','chunk_ids':['c0001']}),
    lambda d:d['key_terms'][0].update(term='at'),
    lambda d:d['key_terms'][0].update(term='soil'),
    lambda d:d['key_terms'][0].update(chunk_ids=['c0003']),
    lambda d:d.update(key_terms_status='unavailable'),
    lambda d:d.pop('key_terms_status'),
    lambda d:d.pop('key_terms'),
])
def test_bad_source_relationships_and_metadata(change,caplog):
    data=source(); change(data)
    with pytest.raises(AIError) as caught: validate_source(data)
    assert caught.value.status==422 and caught.value.code=='VALIDATION_ERROR'
    assert 'Water' not in str(caught.value) and 'Water' not in caplog.text


def test_context_total_character_limit():
    data=source(); data['key_terms']=[]
    data['chunks']=[dict(id=f'c{i:04d}',kind='paragraph',text='x'*3000,quality='clear') for i in range(1,6)]
    with pytest.raises(AIError): validate_source(data)
    data['chunks']=data['chunks'][:4]
    assert len(validate_source(data).chunks)==4


@pytest.mark.parametrize('quote',['water reaches the leaf.','Water reaches the leaf!','Water  reaches the leaf.',
                                  'leaf. Light','Water … glucose.','not in source'])
def test_quotation_is_exact_not_normalized(quote):
    with pytest.raises(AIError) as caught:
        validate_references(source(),[{'chunk_id':'c0001','quote':quote}])
    assert caught.value.code=='AI_INVALID_RESPONSE' and caught.value.status==502 and caught.value.retryable


@pytest.mark.parametrize('refs',[
    [],[{'chunk_id':'c0099','quote':'Water'}],[{'chunk_id':'c0003','quote':'leaf'}],
    [{'chunk_id':'bad','quote':'Water'}],[{'chunk_id':'c0001','quote':' '}],
    [{'chunk_id':'c0001','quote':'Water'}]*2,
    [{'chunk_id':'c0001','quote':'Water','unexpected':'sensitive'}],
    [{'chunk_id':'c0001','quote':'Water'}]*13,
])
def test_invalid_duplicate_dangling_and_uncertain_references(refs):
    with pytest.raises(AIError) as caught: validate_references(source(),refs)
    assert caught.value.code=='AI_INVALID_RESPONSE'


def test_distinct_quotes_in_same_chunk_and_page_scope():
    refs=[{'chunk_id':'c0001','quote':'Water'},{'chunk_id':'c0001','quote':'glucose'}]
    assert len(validate_references(source(),refs))==2
    with pytest.raises(AIError) as caught: validate_references(source(),refs,page_id='different-page')
    assert caught.value.status==502
    with pytest.raises(AIError) as caught: validate_references(source(),refs,page_id='different-page',generated=False)
    assert caught.value.status==422


def test_subsets_filter_metadata_and_preserve_reading_order_without_mutation():
    data=source(); before=copy.deepcopy(data)
    subset=select_source(data,['c0002','c0001'])
    assert [c.id for c in subset.chunks]==['c0001','c0002']
    subset=select_source(data,['c0002'])
    assert subset.key_terms[0].chunk_ids==['c0002'] and len(subset.key_terms)==1
    subset.key_terms[0].chunk_ids.append('c0001')
    assert data==before
    with pytest.raises(AIError): validate_references(select_source(data,['c0002']),[{'chunk_id':'c0001','quote':'Water'}])


@pytest.mark.parametrize('ids',[[],['c0001','c0001'],['c0099'],['c0003'],'c0001',[None]])
def test_invalid_or_uncertain_selection(ids):
    with pytest.raises(AIError): select_source(source(),ids)


def test_uncertain_source_can_be_retained_but_not_used_as_clear_evidence():
    assert require_chunk(source(),'c0003',clear=False).quality=='uncertain'
    with pytest.raises(AIError) as caught: require_chunk(source(),'c0003')
    assert caught.value.code=='INSUFFICIENT_SOURCE'
    with pytest.raises(AIError): require_chunk(source(),'c0099')


@pytest.mark.parametrize('term,text,found',[
    ('water','WATER reaches roots.',True),('at','water',False),('root','roots',False),
    ('carbon dioxide','Carbon dioxide is present.',True),('carbon dioxide','carbon  dioxide',False),
    ('STRASSE','Die Straße.',True),('C++','Use C++.',True),('','water',False),
])
def test_unicode_phrase_boundaries_match_b03_policy(term,text,found):
    from app.services.reading import _contains
    assert phrase_present(term,text)==found
    if term: assert phrase_present(term,text)==_contains(term,text)
    if found:
        start,end=phrase_span(term,text)
        assert text[start:end].casefold()==term.casefold()


def test_existing_models_revalidated_after_mutating_nested_lists():
    parsed=SourceContext.model_validate(source())
    parsed.chunks.append(parsed.chunks[0])
    with pytest.raises(AIError): validate_source(parsed)


@pytest.mark.parametrize('status',['available','unavailable'])
def test_empty_terms_keep_explicit_availability(status):
    data=source(); data.update(key_terms=[],key_terms_status=status)
    assert select_source(data,['c0001']).key_terms_status==status


def test_noncontiguous_valid_ids_keep_original_order():
    data=source(); data['chunks'][1]['id']='c0100'; data['chunks']=data['chunks'][:2]
    data['key_terms']=[]
    assert [c.id for c in validate_source(data).chunks]==['c0001','c0100']
