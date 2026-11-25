"""B06 preparation, B07 initial evaluation and B08 independent retry."""
import re
from datetime import datetime, timezone
from typing import Annotated, Literal
from uuid import uuid4

from pydantic import Field, model_validator, ValidationError

from app.ai.client import AIError, logger
from app.ai.providers import AIProvider
from app.ai.prompts import PREPARE_SYSTEM, PREPARE_VERSION, EVALUATE_SYSTEM, EVALUATE_VERSION
from app.schemas.base import WireModel
from app.schemas.content import PrepareRequest, SourceReference, GeneratedText
from app.schemas.learning import (LearningPlan, LearningObjective, RubricCriterion, ComprehensionQuestion,
    ComprehensionRequest, CriterionAssessment, EvaluationUncertainty, ComprehensionFeedback,
    LearningAttempt, EvaluationResult, RetryResult)
from app.validation.sources import validate_source, require_chunk, select_source, validate_references


def normalized(text):
    return ' '.join(re.findall(r'\w+', text.casefold()))


class PreparedCriterion(WireModel):
    description: str = Field(min_length=1, max_length=400)
    source_refs: list[SourceReference] = Field(min_length=1, max_length=3)
    possible_misconception: str | None = Field(max_length=400)


class PrepareOutput(WireModel):
    sufficient: bool
    target_concept: str | None = Field(max_length=160)
    objective: str | None = Field(max_length=500)
    criteria: list[PreparedCriterion] = Field(max_length=4)
    question: str | None = Field(max_length=500)
    question_criterion_indexes: list[Annotated[int, Field(ge=1, le=4)]] = Field(max_length=4)

    @classmethod
    def model_json_schema(cls, *args, **kwargs):
        schema = super().model_json_schema(*args, **kwargs)
        def minimal(node):
            if isinstance(node, dict):
                return {k: minimal(v) for k, v in node.items() if k not in (
                    'title', 'default', 'minLength', 'maxLength', 'minItems', 'maxItems', 'minimum', 'maximum', 'pattern')}
            if isinstance(node, list):
                return [minimal(v) for v in node]
            return node
        return minimal(schema)

    @model_validator(mode='after')
    def integrity(self):
        if not self.sufficient:
            if (any(v is not None for v in (self.target_concept, self.objective, self.question))
                    or self.criteria or self.question_criterion_indexes):
                raise ValueError('Insufficient source must not contain a fabricated plan.')
            return self
        if (not all((self.target_concept, self.objective, self.question))
                or not 2 <= len(self.criteria) <= 4):
            raise ValueError('Preparation requires a complete objective and 2-4 criteria.')
        if any(re.search(r'\bmisconception\s*:', c.description, re.I) for c in self.criteria):
            raise ValueError('Correct criteria must not contain misconception annotations.')
        descriptions = [normalized(c.description) for c in self.criteria]
        if len(set(descriptions)) != len(descriptions):
            raise ValueError('Criteria must be distinct.')
        indexes = self.question_criterion_indexes
        if not indexes or len(set(indexes)) != len(indexes) or not set(indexes) <= set(range(1, len(self.criteria) + 1)):
            raise ValueError('Question must test a unique nonempty criterion subset.')
        if any(d and d in normalized(self.question) for d in descriptions):
            raise ValueError('Question must not copy the expected criterion answer.')
        return self


async def prepare_understanding(adapter: AIProvider, request: PrepareRequest) -> LearningPlan:
    source = validate_source(request.source)
    selected = require_chunk(source, request.chunk_id)
    if selected.kind != 'paragraph':
        raise AIError('INSUFFICIENT_SOURCE', 422, 'Select a clear paragraph with enough conceptual detail.')
    # Uncertain neighbouring text is not sent to either provider as evidence.
    context = select_source(source, [c.id for c in source.chunks if c.quality == 'clear'])

    class ValidatedPrepareOutput(PrepareOutput):
        @model_validator(mode='after')
        def evidence(self):
            if not self.sufficient:
                return self
            if request.target_concept is not None and self.target_concept != request.target_concept:
                raise ValueError('Target concept must match the request.')
            for criterion in self.criteria:
                refs = validate_references(context, criterion.source_refs, page_id=source.page_id)
                if not any(r.chunk_id == selected.id for r in refs):
                    raise ValueError('Criterion must be anchored to the selected paragraph.')
            return self

    result = await adapter.generate(operation='prepare', system_instruction=PREPARE_SYSTEM,
        data={'prompt_version': PREPARE_VERSION, 'selected_chunk_id': selected.id,
              'target_concept': request.target_concept, 'source': context.model_dump()},
        output_model=ValidatedPrepareOutput)
    if not result.sufficient:
        raise AIError('INSUFFICIENT_SOURCE', 422, 'This paragraph does not support a grounded question and rubric. Select another paragraph.')
    # Assign every identity locally after all evidence/output checks succeed.
    criteria = [RubricCriterion(id='criterion-' + uuid4().hex, description=c.description,
                               source_refs=c.source_refs) for c in result.criteria]
    return LearningPlan(id='plan-' + uuid4().hex, page_id=source.page_id, chunk_id=selected.id,
        target_concept=result.target_concept,
        objective=LearningObjective(id='objective-' + uuid4().hex, description=result.objective, criteria=criteria),
        initial_question=ComprehensionQuestion(id='question-' + uuid4().hex, text=result.question,
            criterion_ids=[criteria[i-1].id for i in result.question_criterion_indexes]))


# Shared B07/B08 judgement; comparison and stage management remain in Python.


class AssessmentOutput(WireModel):
    criterion_id: str = Field(min_length=1, max_length=80)
    status: Literal['demonstrated', 'missing', 'possible_misconception', 'unclear', 'not_tested']
    explanation: str = Field(min_length=1, max_length=500)
    student_quote: str | None = Field(max_length=2000)
    follow_up_question: str | None = Field(max_length=500)


class EvaluationOutput(WireModel):
    answer_interpretation: str | None = Field(max_length=500)
    status: Literal['evaluated', 'uncertain']
    message: str = Field(min_length=1, max_length=800)
    assessments: list[AssessmentOutput] = Field(min_length=1, max_length=4)
    uncertainty: EvaluationUncertainty | None
    targeted_explanation: GeneratedText | None
    hint: str | None = Field(max_length=300)
    recovery: Literal['clarify_answer', 'review_source', 'seek_help'] | None
    further_practice_useful: bool | None

    @classmethod
    def model_json_schema(cls, *args, **kwargs):
        schema = super().model_json_schema(*args, **kwargs)
        def minimal(node):
            if isinstance(node, dict):
                return {k: minimal(v) for k, v in node.items() if k not in (
                    'title', 'default', 'minLength', 'maxLength', 'minItems', 'maxItems', 'pattern')}
            if isinstance(node, list):
                return [minimal(v) for v in node]
            return node
        return minimal(schema)


def _bad_plan():
    return AIError('VALIDATION_ERROR', 422, 'Check the learning plan, question and assistance metadata.')


def validate_check_request(request: ComprehensionRequest):
    source = validate_source(request.source)
    plan = request.plan
    selected = require_chunk(source, plan.chunk_id)
    if selected.kind != 'paragraph' or plan.page_id != source.page_id:
        raise _bad_plan()
    criteria = plan.objective.criteria
    ids = [c.id for c in criteria]
    all_ids = [plan.id, plan.objective.id, plan.initial_question.id, *ids]
    if (len(set(all_ids)) != len(all_ids)
            or len({normalized(c.description) for c in criteria}) != len(criteria)):
        raise _bad_plan()
    tested = plan.initial_question.criterion_ids
    if len(set(tested)) != len(tested) or not set(tested) <= set(ids):
        raise _bad_plan()
    for criterion in criteria:
        validate_references(source, criterion.source_refs, page_id=plan.page_id, generated=False)
    if (request.assistance.used != bool(request.assistance.kinds)
            or len(set(request.assistance.kinds)) != len(request.assistance.kinds)):
        raise _bad_plan()
    if request.previous_attempt is None:
        if request.question.model_dump() != plan.initial_question.model_dump():
            raise _bad_plan()
    else:
        validate_baseline(request, source)

    return select_source(source, [c.id for c in source.chunks if c.quality == 'clear'])


async def check_understanding(adapter: AIProvider, request: ComprehensionRequest) -> EvaluationResult:
    # Revalidate a detached copy, including mutable nested lists. The service
    # cannot authenticate client-carried plans; it validates their relationships.
    request = ComprehensionRequest.model_validate(request.model_dump())
    context = validate_check_request(request)
    is_retry = request.previous_attempt is not None
    plan = request.plan
    criteria = {c.id: c for c in plan.objective.criteria}
    tested = set(request.question.criterion_ids)
    if needs_clarification(request.answer):
        # Conservative local abstention BEFORE provider use, not a replacement
        # for provider/schema failure or an inference about missing knowledge.
        feedback = ComprehensionFeedback(status='uncertain',
            message='Please describe the relationship you mean in your own words.',
            assessments=[CriterionAssessment(criterion_id=c.id,
                status='unclear' if c.id in tested else 'not_tested',
                explanation='Please clarify the idea you mean.' if c.id in tested else 'This criterion was not tested by this question.',
                student_quote=None, source_refs=c.source_refs) for c in plan.objective.criteria],
            uncertainty=EvaluationUncertainty(reason='ambiguous_answer', message='The answer does not identify a clear conceptual relationship.'),
            targeted_explanation=None, hint=None, follow_up_question=None,
            recommendation='clarify_answer', further_practice_useful=None)
        return build_evaluation_result(request, feedback)

    class ValidatedEvaluationOutput(EvaluationOutput):
        @classmethod
        def model_validate_json(cls, *args, **kwargs):
            try:
                return super().model_validate_json(*args, **kwargs)
            except ValidationError as exc:
                # Only code-defined field names, no provider values/paths/content.
                fields = {'assessments', 'targeted_explanation', 'follow_up_question', 'uncertainty'}
                affected = sorted({e['loc'][0] for e in exc.errors(include_input=False, include_context=False)
                                   if e['loc'] and e['loc'][0] in fields})
                rules = {
                    'Uninterpretable answers require clarification.': 'interpretation',
                    'Follow-up must be different and preserve targeted criterion coverage.': 'follow_up_coverage',
                    'Follow-up must not copy the rubric answer.': 'answer_leakage',
                    'Status must respect actual question coverage.': 'assessment_coverage',
                    'Student quotation must be exact.': 'student_quote',
                    'Understanding or misconception requires answer evidence.': 'missing_evidence',
                    'Uncertainty must offer recovery without assessment or repair claims.': 'uncertainty_state',
                    'Feedback must match the initial/retry stage.': 'stage_state',
                    'Incomplete or mistaken answers need grounded repair and a hint.': 'repair_required',
                }
                failed = sorted({rules.get(str(e.get('ctx', {}).get('error')), 'schema')
                                 for e in exc.errors(include_input=False)})
                logger.warning('evaluation_invalid fields=%s rules=%s', ','.join(affected) or 'other', ','.join(failed))
                raise

        @model_validator(mode='after')
        def evidence_and_states(self):
            ids = [a.criterion_id for a in self.assessments]
            if len(set(ids)) != len(ids) or set(ids) != tested:
                raise ValueError('Assess every tested criterion exactly once.')
            for assessment in self.assessments:
                status = assessment.status
                if status == 'not_tested':
                    raise ValueError('Status must respect actual question coverage.')
                quote = assessment.student_quote
                if quote is not None and quote not in request.answer:
                    raise ValueError('Student quotation must be exact.')
                if status in ('demonstrated', 'possible_misconception') and quote is None:
                    raise ValueError('Understanding or misconception requires answer evidence.')
                if status == 'not_tested' and quote is not None:
                    raise ValueError('Untested criterion cannot claim student evidence.')
            if self.answer_interpretation is None and self.status != 'uncertain':
                raise ValueError('Uninterpretable answers require clarification.')
            if self.status == 'uncertain':
                if (self.uncertainty is None or self.recovery is None
                        or any(v is not None for v in (self.targeted_explanation, self.hint,
                            self.further_practice_useful))
                        or any(a.status != 'unclear' or a.follow_up_question is not None for a in self.assessments)):
                    raise ValueError('Uncertainty must offer recovery without assessment or repair claims.')
            else:
                if (self.uncertainty is not None or self.recovery is not None
                        or self.further_practice_useful is None
                        or any((a.follow_up_question is None) != is_retry for a in self.assessments)):
                    raise ValueError('Feedback must match the initial/retry stage.')
                if not is_retry:
                    target = follow_up_targets(self.assessments, request.question.criterion_ids)[0]
                    text = next(a.follow_up_question for a in self.assessments if a.criterion_id == target)
                    if normalized(text) == normalized(request.question.text):
                        raise ValueError('Follow-up must be different and preserve targeted criterion coverage.')
                    if any(normalized(c.description) in normalized(text) for c in criteria.values()):
                        raise ValueError('Follow-up must not copy the rubric answer.')
                    # Do not turn a source quotation containing the relationship
                    # into a question which already supplies its answer. Single
                    # academic terms may still be named/quoted.
                    quoted = re.findall(r'["“\']([^"”\']+)["”\']', text)
                    if any(len(normalized(q).split()) >= 3 and q in ref.quote
                           for q in quoted for ref in criteria[target].source_refs):
                        raise ValueError('Follow-up must not copy the rubric answer.')
                if (any(a.status in ('missing', 'possible_misconception') for a in self.assessments)
                        and (self.targeted_explanation is None or self.hint is None)):
                    raise ValueError('Incomplete or mistaken answers need grounded repair and a hint.')
            if self.targeted_explanation:
                validate_references(context, self.targeted_explanation.source_refs, page_id=plan.page_id)
                # Conservative guard for the unsupported classification seen in
                # live feedback, without rejecting quotations of the student's belief.
                source_text=' '.join(c.text for c in context.chunks).casefold()
                if 'food' not in source_text and re.search(
                    r"\b(?:glucose\s+(?:is|as)\s+(?:the\s+|a\s+)?food|food\s+(?:called|or|is|named)\s+glucose|food,\s*(?:or\s+)?glucose)\b",
                    self.targeted_explanation.text,re.I):
                    raise ValueError('Repair adds a classification absent from the source.')
            return self

    result = await adapter.generate(operation='check', system_instruction=EVALUATE_SYSTEM,
        data={'prompt_version': EVALUATE_VERSION, 'stage': 'retry' if is_retry else 'initial', 'source': context.model_dump(),
              'objective': plan.objective.description,
              'criteria': [c.model_dump() for c in plan.objective.criteria if c.id in tested],
              'required_assessment_criterion_ids': list(request.question.criterion_ids),
              'question': request.question.model_dump(), 'answer': request.answer},
        output_model=ValidatedEvaluationOutput)
    by_id = {a.criterion_id: a for a in result.assessments}
    assessments = []
    for criterion in plan.objective.criteria:
        if criterion.id in tested:
            assessment = by_id[criterion.id].model_dump(exclude={'follow_up_question'})
        else:
            assessment = dict(criterion_id=criterion.id, status='not_tested',
                explanation='This criterion was not tested by this question.', student_quote=None)
        assessments.append(CriterionAssessment(**assessment, source_refs=criterion.source_refs))
    target = (follow_up_targets(result.assessments, request.question.criterion_ids)[0]
              if not is_retry and result.status == 'evaluated' else None)
    follow_up = (ComprehensionQuestion(id='question-' + uuid4().hex,
                    text=by_id[target].follow_up_question, criterion_ids=[target]) if target else None)
    feedback = ComprehensionFeedback(status=result.status, message=result.message, assessments=assessments,
        uncertainty=result.uncertainty, targeted_explanation=result.targeted_explanation, hint=result.hint,
        follow_up_question=follow_up, recommendation=(result.recovery if result.status == 'uncertain' else
            ('review_source' if any(a.status in ('missing', 'possible_misconception', 'unclear') for a in assessments)
             else 'read_original') if is_retry else 'try_retry'),
        further_practice_useful=result.further_practice_useful)
    return build_evaluation_result(request, feedback)


def build_evaluation_result(request, feedback):
    return EvaluationResult(attempt=LearningAttempt(id=request.attempt_id, plan_id=request.plan.id,
        question=request.question, answer=request.answer, assistance=request.assistance,
        submitted_at=datetime.now(timezone.utc).isoformat().replace('+00:00', 'Z'), feedback=feedback),
        retry_result=(compare_retry(request.previous_attempt, request.attempt_id, feedback.assessments, request.assistance)
                      if request.previous_attempt is not None and feedback.status == 'evaluated' else None))


def needs_clarification(answer):
    # Only content-free acknowledgements/deictic phrases. Never use length as a
    # proxy: short concept-bearing answers (including spelling errors) go to AI.
    generic = {'it', 'this', 'that', 'they', 'these', 'those', 'the', 'a', 'an', 'thing',
        'things', 'stuff', 'helps', 'help', 'does', 'do', 'works', 'work', 'happens',
        'is', 'are', 'with', 'and', 'somehow', 'maybe', 'yes', 'no', 'something'}
    words = re.findall(r'\w+', answer.casefold())
    return bool(words) and all(word in generic for word in words)


def follow_up_targets(assessments, tested_ids):
    by_id = {a.criterion_id: a.status for a in assessments}
    for states in ({'possible_misconception'}, {'missing', 'unclear'}):
        targets = [id for id in tested_ids if by_id[id] in states]
        if targets:
            return targets
    return list(tested_ids)


def validate_baseline(request, source):
    """Validate a client-carried evaluated INITIAL baseline, not its authenticity."""
    previous = request.previous_attempt
    plan = request.plan
    feedback = previous.feedback
    criteria = {c.id: c for c in plan.objective.criteria}
    tested = set(plan.initial_question.criterion_ids)
    follow = feedback.follow_up_question
    if (previous.id == request.attempt_id or previous.plan_id != plan.id
            or previous.question.model_dump() != plan.initial_question.model_dump()
            or feedback.status != 'evaluated' or feedback.uncertainty is not None
            or feedback.recommendation != 'try_retry' or feedback.further_practice_useful is None
            or follow is None or follow.id in {plan.id, plan.objective.id, plan.initial_question.id, *criteria}
            or normalized(follow.text) == normalized(plan.initial_question.text)
            or len(set(follow.criterion_ids)) != len(follow.criterion_ids)
            or not set(follow.criterion_ids) <= tested
            or request.question.model_dump() != follow.model_dump()
            or previous.assistance.used != bool(previous.assistance.kinds)
            or len(set(previous.assistance.kinds)) != len(previous.assistance.kinds)):
        raise _bad_plan()
    ids = [a.criterion_id for a in feedback.assessments]
    if len(set(ids)) != len(ids) or set(ids) != set(criteria):
        raise _bad_plan()
    for assessment in feedback.assessments:
        if ((assessment.criterion_id not in tested) != (assessment.status == 'not_tested')
                or (assessment.student_quote is not None and assessment.student_quote not in previous.answer)
                or (assessment.status in ('demonstrated', 'possible_misconception') and assessment.student_quote is None)
                or (assessment.status == 'not_tested' and assessment.student_quote is not None)):
            raise _bad_plan()
        validate_references(source, assessment.source_refs, generated=False)
        criterion_refs = criteria[assessment.criterion_id].source_refs
        if any(not any(r.chunk_id == c.chunk_id and r.quote in c.quote for c in criterion_refs)
               for r in assessment.source_refs):
            raise _bad_plan()
    if feedback.targeted_explanation:
        validate_references(source, feedback.targeted_explanation.source_refs, generated=False)
    if any(a.status in ('missing', 'possible_misconception') for a in feedback.assessments):
        if feedback.targeted_explanation is None or feedback.hint is None:
            raise _bad_plan()


def compare_retry(previous, current_id, assessments, assistance):
    """Contract comparison in rubric order; no scores or inferred semantic progress."""
    baseline = {a.criterion_id: a.status for a in previous.feedback.assessments}
    return RetryResult(previous_attempt_id=previous.id, current_attempt_id=current_id,
        independent_in_app=not assistance.used,
        newly_demonstrated_ids=[a.criterion_id for a in assessments
            if a.status == 'demonstrated' and baseline[a.criterion_id] in ('missing', 'possible_misconception', 'unclear')],
        retained_demonstrated_ids=[a.criterion_id for a in assessments
            if a.status == baseline[a.criterion_id] == 'demonstrated'],
        still_needs_practice_ids=[a.criterion_id for a in assessments
            if a.status in ('missing', 'possible_misconception', 'unclear')],
        not_retested_ids=[a.criterion_id for a in assessments if a.status == 'not_tested'])
