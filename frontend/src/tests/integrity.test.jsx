import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ApiProvider, useApi } from '../context/ApiContext';
import { checkFeatureAvailability, checkLearningAvailability } from '../config/features';
import { createInitialLearningState, learningSessionReducer } from '../hooks/useLearningSession';
import { validateResponse } from '../lib/validateResponse';
import health from '../test-data/health.initial.json';
import read from '../test-data/read.success.json';
import plan from '../test-data/prepare.success.json';
import check from '../test-data/check.misconception.json';
import retry from '../test-data/retry.independent-success.json';
import simplified from '../test-data/simplify.no-terms.json';

const source = { page_id: read.page.id, chunks: read.page.chunks, key_terms: [], key_terms_status: 'unavailable' };
const initialRequest = { source, plan, attempt_id: check.attempt.id, question: plan.initial_question, answer: check.attempt.answer, assistance: check.attempt.assistance, previous_attempt: null };

describe('learning integrity and offline review', () => {
  it('restores stage, draft and sticky assistance in memory without reading or writing student storage', () => {
    const spy = vi.spyOn(Storage.prototype, 'setItem');
    let state = createInitialLearningState({ pageId: read.page.id, chunkId: 'c0002' });
    state = learningSessionReducer(state, { type: 'PREPARE_SUCCESS', plan });
    state = learningSessionReducer(state, { type: 'SUBMIT_SUCCESS', result: check });
    state = learningSessionReducer(state, { type: 'START_RETRY' });
    state = learningSessionReducer(state, { type: 'REQUEST_HELP', kind: 'source' });
    state = learningSessionReducer(state, { type: 'SET_DRAFT', draft: 'Synthetic draft' });
    const snapshot = { id: state.sessionId, page_id: read.page.id, chunk_id: 'c0002', plan, attempts: state.attempts, stage: state.stage, draft: state.draft, assistance: state.assistance };
    const restored = createInitialLearningState({ pageId: read.page.id, chunkId: 'c0002', restoredSession: snapshot });
    expect(restored.stage).toBe('retrying');
    expect(restored.assistance).toEqual({ used: true, kinds: ['source'] });
    expect(restored.draft).toBe('Synthetic draft');
    const unrelated = createInitialLearningState({ pageId: 'different-page', chunkId: 'c0002', restoredSession: snapshot });
    expect(unrelated.plan).toBeNull();
    expect(unrelated.draft).toBe('');
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it('fails closed after a failed health refresh even if stale data is supplied', async () => {
    const readyHealth = { ...health, capabilities: { ...health.capabilities, read: true, prepare_understanding: true, check_understanding: true } };
    const releaseFlags = { read: true, prepare_understanding: true, check_understanding: true };
    expect(checkFeatureAvailability('read', { releaseFlags, health: readyHealth, healthStatus: 'error' }).available).toBe(false);
    expect(checkLearningAvailability({ releaseFlags, health: readyHealth, healthStatus: 'error' }).available).toBe(false);
    function Consumer() {
      const api = useApi();
      return <><span>{String(api.getFeatureState('read').available)}</span><button onClick={api.refreshHealth}>Refresh</button></>;
    }
    const fetcher = vi.fn().mockResolvedValueOnce(readyHealth).mockRejectedValueOnce({ code: 'NETWORK_ERROR' });
    render(<ApiProvider initialReleaseFlags={releaseFlags} healthFetcher={fetcher}><Consumer /></ApiProvider>);
    await screen.findByText('true');
    fireEvent.click(screen.getByText('Refresh'));
    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2));
    expect(screen.getByText('false')).toBeInTheDocument();
  });
});

describe('response integrity', () => {
  it('accepts the exact synthetic source-linked plan, evaluation and simplification', () => {
    expect(validateResponse('ReadResult', read)).toBe(read);
    expect(validateResponse('LearningPlan', plan, { source, chunk_id: 'c0002' })).toBe(plan);
    expect(validateResponse('EvaluationResult', check, initialRequest)).toBe(check);
    expect(validateResponse('SimplificationResult', simplified, { source, chunk_ids: ['c0002'], level: 'easy' })).toBe(simplified);
  });
  it.each(['page', 'chunk', 'quote', 'shape'])('rejects %s mismatches rather than displaying unrelated simplifications', (defect) => {
    const bad = structuredClone(simplified);
    if (defect === 'page') bad.page_id = '00000000-0000-0000-0000-000000000000';
    if (defect === 'chunk') bad.items[0].chunk_id = 'c0099';
    if (defect === 'quote') bad.items[0].source_refs[0].quote = 'invented source';
    if (defect === 'shape') delete bad.items[0].warnings;
    expect(() => validateResponse('SimplificationResult', bad, { source, chunk_ids: ['c0002'], level: 'easy' })).toThrow();
  });
  it.each(['answer', 'assistance', 'coverage', 'quote', 'question'])('rejects feedback with changed %s', (defect) => {
    const bad = structuredClone(check);
    if (defect === 'answer') bad.attempt.answer = 'Unrelated answer';
    if (defect === 'assistance') bad.attempt.assistance = { used: true, kinds: ['hint'] };
    if (defect === 'coverage') bad.attempt.feedback.assessments[0].status = 'not_tested';
    if (defect === 'quote') bad.attempt.feedback.assessments[0].student_quote = 'Fabricated student quote';
    if (defect === 'question') bad.attempt.question.criterion_ids = ['materials'];
    expect(() => validateResponse('EvaluationResult', bad, initialRequest)).toThrow();
  });
  it('rejects a fabricated retry comparison and independence claim', () => {
    const payload = { ...initialRequest, attempt_id: retry.attempt.id, question: retry.attempt.question, answer: retry.attempt.answer, previous_attempt: check.attempt };
    expect(validateResponse('EvaluationResult', retry, payload)).toBe(retry);
    const bad = structuredClone(retry);
    bad.retry_result.newly_demonstrated_ids = [];
    expect(() => validateResponse('EvaluationResult', bad, payload)).toThrow();
    bad.retry_result = structuredClone(retry.retry_result);
    bad.retry_result.independent_in_app = false;
    expect(() => validateResponse('EvaluationResult', bad, payload)).toThrow();
  });
});
