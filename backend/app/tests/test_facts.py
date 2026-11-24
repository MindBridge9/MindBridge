"""FactGuard signals are deterministic, conservative and bounded; no AI calls."""
import copy

import pytest

from app.ai.client import AIError
from app.schemas.content import OmissionWarning
from app.validation.facts import ExplicitDetail, check_facts


def context(text,terms=(),status='available'):
    return {'page_id':'11111111-1111-4111-8111-111111111111',
            'chunks':[dict(id='c0001',kind='paragraph',text=text,quality='clear')],
            'key_terms':[dict(term=t,chunk_ids=['c0001']) for t in terms], 'key_terms_status':status}


def checked(original,generated,**kwargs):
    result=check_facts(context(original), 'c0001', generated, **kwargs)
    for warning in result.warnings:
        OmissionWarning.model_validate(warning.model_dump())
        assert warning.source_value in original
        assert warning.generated_value is None or warning.generated_value in generated
        assert 'may' in warning.message and len(warning.message)<=400
    return result


@pytest.mark.parametrize('original,generated',[
    ('The sample contains 20 mL of water.','The sample contains water.'),
    ('The count is 1,200.','The count is many.'),
    ('The reading is -2.5.','The reading is low.'),
    ('The value is −.5.','The value is low.'),
    ('Growth was 12%.','Growth occurred.'),
    ('There are 1e3 cells.','There are cells.'),
])
def test_missing_numeric_values(original,generated):
    assert 'missing_number' in [w.code for w in checked(original,generated).warnings]


@pytest.mark.parametrize('original,generated,old,new',[
    ('There are 20 seeds.','There are 25 seeds.','20','25'),
    ('The reading is -2.5.','The reading is 2.5.','-2.5','2.5'),
    ('The volume is 20 mL.','The volume is 25 mL.','20','25'),
])
def test_defensible_changed_number(original,generated,old,new):
    warnings=checked(original,generated).warnings
    assert [(w.source_value,w.generated_value) for w in warnings if w.code=='changed_number']==[(old,new)]


@pytest.mark.parametrize('generated',['Plants grew 25 leaves.','There are 25 seeds and 30 roots.','There are many seeds.'])
def test_ambiguous_correspondence_is_missing_not_invented_change(generated):
    warnings=checked('There are 20 seeds.',generated).warnings
    assert 'missing_number' in [w.code for w in warnings]
    assert 'changed_number' not in [w.code for w in warnings]
    assert all(w.generated_value is None for w in warnings)


@pytest.mark.parametrize('original,generated',[
    ('There are 1,200 seeds.','There are 1200 seeds.'),
    ('There are 20 seeds.','Twenty is the count: 20 seeds.'),
    ('The value is 1.20.','The value is 1.2.'),
    ('The value is .5.','The value is 0.50.'),
    ('There are 1e3 cells.','There are 1000 cells.'),
    ('Growth was 20%.','Growth was 20 percent.'),
])
def test_numeric_formatting_and_paraphrase_retention(original,generated):
    assert not checked(original,generated).warnings


@pytest.mark.parametrize('original,generated',[
    ('The length is 1 m.','The length is 100 cm.'),
    ('The sample contains 20 mL.','The sample contains 0.02 L.'),
    ('The mass is 1 kg.','The mass is 1000 g.'),
    ('The time is 60 s.','The time is 1 minute.'),
    ('The temperature is 0 °C.','The temperature is 32 °F.'),
    ('The temperature is 0 °C.','The temperature is 273.15 K.'),
    ('The speed is 10 m/s.','The speed is 36 km/h.'),
    ('The pressure is 2 kPa.','The pressure is 2000 Pa.'),
    ('The density is 1 g/cm³.','The density is 1000 kg/m³.'),
    ('The area is 1 m².','The area is 10000 cm².'),
])
def test_supported_exact_unit_conversions_avoid_false_alarm(original,generated):
    assert not checked(original,generated).warnings


@pytest.mark.parametrize('original,generated',[
    ('The sample contains 20 mL.','The sample contains 20.'),
    ('The sample contains 20mL.','The sample contains 20 g.'),
    ('The length is 20 cm.','The length is 20 mm.'),
    ('The speed is 20 m/s.','The speed is 20 m.'),
    ('The sample contains 20 mL.','There are 20 seeds. Volume is measured in mL.'),
    ('Growth was 20%.','Growth was 20.'),
])
def test_missing_changed_or_detached_units(original,generated):
    assert 'missing_unit' in [w.code for w in checked(original,generated).warnings]


def test_numbers_and_units_cannot_be_recombined_arbitrarily():
    warnings=checked('Use 20 mL and 2 g.','Use 20 g and 2 mL.').warnings
    assert {w.source_value for w in warnings if w.code=='missing_unit'}=={'20 mL','2 g'}


def test_unknown_conversion_is_only_possible_issue_not_fact_error():
    warnings=checked('The length is 1 m.','The length is about 3.28 feet.').warnings
    assert warnings and all('may' in w.message and 'conversions' in w.message for w in warnings)


@pytest.mark.parametrize('original,generated',[
    ('It happened on 2024-03-12.','It happened on March 12, 2024.'),
    ('It happened on 12 March 2024.','It happened on Mar. 12th, 2024.'),
    ('It happened on 12/03/2024.','It happened on 12-03-2024.'),
])
def test_supported_date_paraphrases(original,generated):
    assert not checked(original,generated).warnings


@pytest.mark.parametrize('original,generated',[
    ('It happened on 2024-03-12.','It happened later.'),
    ('It happened on March 12, 2024.','It happened on March 13, 2024.'),
    ('It happened on 03/12/2024.','It happened on 12/03/2024.'),
])
def test_missing_or_ambiguous_dates_are_not_numeric_guesses(original,generated):
    warnings=checked(original,generated).warnings
    assert [w.code for w in warnings]==['missing_date']


def test_terms_metadata_and_source_remain_unchanged():
    data=context('Plants make glucose from carbon dioxide.',('glucose','carbon dioxide'))
    before=copy.deepcopy(data)
    result=check_facts(data,'c0001','Plants make GLUCOSE.')
    assert result.preserved_terms==('glucose',)
    assert [(w.code,w.source_value) for w in result.warnings]==[('missing_term','carbon dioxide')]
    assert result.terminology_check_status=='checked' and data==before


def test_supplied_names_and_key_details_only_no_implicit_entity_guessing():
    data=context('Newton studied the red leaf.',('Newton','red leaf'))
    result=check_facts(data,'c0001','A scientist studied a leaf.',explicit_details=(
        ExplicitDetail('Newton','name'),ExplicitDetail('red leaf','key_detail')))
    assert {w.code for w in result.warnings}=={'missing_name','missing_key_detail'}
    # With no supplied terms, capitalisation alone is not an entity detector.
    assert not check_facts(context('Newton studied a leaf.'),'c0001','A scientist studied a leaf.').warnings
    with pytest.raises(AIError):
        check_facts(data,'c0001','A scientist studied a leaf.',explicit_details=(ExplicitDetail('scientist','name'),))


def test_unicode_source_warning_is_exact_original_not_folded_label():
    result=check_facts(context('Eine Straße ist lang.',('STRASSE',)),'c0001','Ein Weg ist lang.')
    assert result.warnings[0].source_value=='Straße'


@pytest.mark.parametrize('status',['available','unavailable'])
def test_metadata_availability_is_not_inferred_from_empty_list(status):
    result=check_facts(context('There are 20 seeds.',status=status),'c0001','There are seeds.')
    assert result.terminology_check_status==('checked' if status=='available' else 'unavailable')
    assert result.preserved_terms==() and result.warnings


def test_uncertain_and_missing_metadata_cannot_be_successful_checks():
    data=context('There are 20 seeds.'); data['chunks'][0]['quality']='uncertain'
    with pytest.raises(AIError) as caught: check_facts(data,'c0001','There are seeds.')
    assert caught.value.code=='INSUFFICIENT_SOURCE'
    data=context('There are 20 seeds.'); del data['key_terms_status']
    with pytest.raises(AIError): check_facts(data,'c0001','There are seeds.')


@pytest.mark.parametrize('generated',['',' ',None,123,'x'*4501])
def test_generated_text_validation_is_safe_502(generated):
    with pytest.raises(AIError) as caught: check_facts(context('Text.'),'c0001',generated)
    assert caught.value.code=='AI_INVALID_RESPONSE' and caught.value.status==502


def test_warning_budget_is_explicit_not_silently_truncated():
    source='Values: '+', '.join(str(i) for i in range(1,31))+'.'
    assert len(checked(source,'No values are listed.').warnings)==30
    source='Values: '+', '.join(str(i) for i in range(1,32))+'.'
    with pytest.raises(AIError) as caught: checked(source,'No values are listed.')
    assert caught.value.code=='AI_INVALID_RESPONSE'


def test_repeated_source_values_do_not_duplicate_warnings():
    warnings=checked('20 seeds and 20 leaves.','Seeds and leaves.').warnings
    assert len(warnings)==1 and warnings[0].source_value=='20'


@pytest.mark.parametrize('value',['9'*161,'1e1001','1e'+'9'*100])
def test_pathological_numbers_are_bounded_safe_errors(value):
    with pytest.raises(AIError) as caught:
        check_facts(context('Value '+value+'.'),'c0001','A value.')
    assert caught.value.code=='CONTENT_UNSUPPORTED' and caught.value.status==422
    with pytest.raises(AIError) as caught:
        check_facts(context('A value.'),'c0001','Value '+value+'.')
    assert caught.value.code=='AI_INVALID_RESPONSE' and caught.value.status==502
