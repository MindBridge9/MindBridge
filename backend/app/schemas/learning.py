"""MindBridge v1 wire schemas; no runtime dependency on private planning files."""

from typing import Annotated, Literal

from pydantic import Field

from .base import NonBlank, UTCDateTimeString, UUIDString, WireModel
from .content import SourceContext, SourceReference, GeneratedText


class RubricCriterion(WireModel):
    id: Annotated[NonBlank, Field(min_length=1, max_length=80, pattern='^[A-Za-z0-9][A-Za-z0-9_-]*$')]
    description: Annotated[NonBlank, Field(min_length=1, max_length=400)]
    source_refs: Annotated[list[SourceReference], Field(min_length=1, max_length=12)]


class LearningObjective(WireModel):
    id: Annotated[NonBlank, Field(min_length=1, max_length=80, pattern='^[A-Za-z0-9][A-Za-z0-9_-]*$')]
    description: Annotated[NonBlank, Field(min_length=1, max_length=500)]
    criteria: Annotated[list[RubricCriterion], Field(min_length=2, max_length=4)]


class ComprehensionQuestion(WireModel):
    id: Annotated[NonBlank, Field(min_length=1, max_length=80, pattern='^[A-Za-z0-9][A-Za-z0-9_-]*$')]
    text: Annotated[NonBlank, Field(min_length=1, max_length=500)]
    criterion_ids: Annotated[list[Annotated[NonBlank, Field(min_length=1, max_length=80, pattern='^[A-Za-z0-9][A-Za-z0-9_-]*$')]], Field(min_length=1, max_length=4)]


class LearningPlan(WireModel):
    id: Annotated[NonBlank, Field(min_length=1, max_length=80, pattern='^[A-Za-z0-9][A-Za-z0-9_-]*$')]
    page_id: Annotated[UUIDString, Field(min_length=1, max_length=36)]
    chunk_id: Annotated[NonBlank, Field(min_length=1, max_length=5, pattern='^c[0-9]{4}$')]
    target_concept: Annotated[NonBlank, Field(min_length=1, max_length=160)]
    objective: LearningObjective
    initial_question: ComprehensionQuestion


class AssistanceRecord(WireModel):
    used: bool
    kinds: Annotated[list[Literal['hint', 'source', 'explanation', 'previous_feedback']], Field(min_length=0, max_length=4)]


class CriterionAssessment(WireModel):
    criterion_id: Annotated[NonBlank, Field(min_length=1, max_length=80, pattern='^[A-Za-z0-9][A-Za-z0-9_-]*$')]
    status: Literal['demonstrated', 'missing', 'possible_misconception', 'unclear', 'not_tested']
    explanation: Annotated[NonBlank, Field(min_length=1, max_length=500)]
    student_quote: Annotated[NonBlank, Field(min_length=1, max_length=2000)] | None
    source_refs: Annotated[list[SourceReference], Field(min_length=1, max_length=12)]


class EvaluationUncertainty(WireModel):
    reason: Literal['ambiguous_answer', 'insufficient_source', 'unsupported_claim', 'evaluation_uncertain']
    message: Annotated[NonBlank, Field(min_length=1, max_length=500)]


class ComprehensionFeedback(WireModel):
    status: Literal['evaluated', 'uncertain']
    message: Annotated[NonBlank, Field(min_length=1, max_length=800)]
    assessments: Annotated[list[CriterionAssessment], Field(min_length=2, max_length=4)]
    uncertainty: EvaluationUncertainty | None
    targeted_explanation: GeneratedText | None
    hint: Annotated[NonBlank, Field(min_length=1, max_length=300)] | None
    follow_up_question: ComprehensionQuestion | None
    recommendation: Literal['try_retry', 'clarify_answer', 'review_source', 'seek_help', 'read_original']
    further_practice_useful: bool | None


class LearningAttempt(WireModel):
    id: Annotated[NonBlank, Field(min_length=1, max_length=80, pattern='^[A-Za-z0-9][A-Za-z0-9_-]*$')]
    plan_id: Annotated[NonBlank, Field(min_length=1, max_length=80, pattern='^[A-Za-z0-9][A-Za-z0-9_-]*$')]
    question: ComprehensionQuestion
    answer: Annotated[NonBlank, Field(min_length=1, max_length=2000)]
    assistance: AssistanceRecord
    submitted_at: Annotated[UTCDateTimeString, Field(min_length=1, max_length=35)]
    feedback: ComprehensionFeedback


class ComprehensionRequest(WireModel):
    source: SourceContext
    plan: LearningPlan
    attempt_id: Annotated[NonBlank, Field(min_length=1, max_length=80, pattern='^[A-Za-z0-9][A-Za-z0-9_-]*$')]
    question: ComprehensionQuestion
    answer: Annotated[NonBlank, Field(min_length=1, max_length=2000)]
    assistance: AssistanceRecord
    previous_attempt: LearningAttempt | None = None


class RetryResult(WireModel):
    previous_attempt_id: Annotated[NonBlank, Field(min_length=1, max_length=80, pattern='^[A-Za-z0-9][A-Za-z0-9_-]*$')]
    current_attempt_id: Annotated[NonBlank, Field(min_length=1, max_length=80, pattern='^[A-Za-z0-9][A-Za-z0-9_-]*$')]
    independent_in_app: bool
    newly_demonstrated_ids: Annotated[list[Annotated[NonBlank, Field(min_length=1, max_length=80, pattern='^[A-Za-z0-9][A-Za-z0-9_-]*$')]], Field(min_length=0, max_length=4)]
    retained_demonstrated_ids: Annotated[list[Annotated[NonBlank, Field(min_length=1, max_length=80, pattern='^[A-Za-z0-9][A-Za-z0-9_-]*$')]], Field(min_length=0, max_length=4)]
    still_needs_practice_ids: Annotated[list[Annotated[NonBlank, Field(min_length=1, max_length=80, pattern='^[A-Za-z0-9][A-Za-z0-9_-]*$')]], Field(min_length=0, max_length=4)]
    not_retested_ids: Annotated[list[Annotated[NonBlank, Field(min_length=1, max_length=80, pattern='^[A-Za-z0-9][A-Za-z0-9_-]*$')]], Field(min_length=0, max_length=4)]


class EvaluationResult(WireModel):
    attempt: LearningAttempt
    retry_result: RetryResult | None


class LearningSession(WireModel):
    id: Annotated[NonBlank, Field(min_length=1, max_length=80, pattern='^[A-Za-z0-9][A-Za-z0-9_-]*$')]
    page_id: Annotated[UUIDString, Field(min_length=1, max_length=36)]
    chunk_id: Annotated[NonBlank, Field(min_length=1, max_length=5, pattern='^c[0-9]{4}$')]
    plan: LearningPlan
    attempts: Annotated[list[LearningAttempt], Field(min_length=0, max_length=20)]
    retry_result: RetryResult | None
