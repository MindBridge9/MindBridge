"""Prepare a fixed rubric, then evaluate initial and retry answers without changing it."""
from fastapi import APIRouter, Request
from app.api.reading import ReadingRoute
from app.schemas.content import PrepareRequest
from app.schemas.learning import LearningPlan, ComprehensionRequest, EvaluationResult
from app.schemas.errors import APIError
from app.services.learning import prepare_understanding, check_understanding

router = APIRouter(route_class=ReadingRoute)


@router.post('/api/prepare-understanding', operation_id='prepare_understanding', response_model=LearningPlan,
             responses={status: {'model': APIError} for status in (400, 413, 415, 422, 429, 501, 502, 503, 504, 500)},
             description='A source-grounded conceptual question and fixed 2-4 criterion rubric for one clear paragraph. No student answer is accepted.')
async def prepare(request: Request, body: PrepareRequest) -> LearningPlan:
    return await prepare_understanding(request.app.state.gemini, body)


@router.post('/api/check-understanding', operation_id='check_understanding', response_model=EvaluationResult,
             responses={status: {'model': APIError} for status in (400, 413, 415, 422, 429, 501, 502, 503, 504, 500)},
             description='Conceptual evaluation against a fixed source-grounded rubric, with repair, one independent retry and clarification.')
async def check(request: Request, body: ComprehensionRequest) -> EvaluationResult:
    return await check_understanding(request.app.state.gemini, body)
