import { useCallback, useEffect, useReducer, useRef } from 'react';
import { checkUnderstanding, prepareUnderstanding } from '../lib/api';
import { buildSourceContext } from '../lib/sourceContext';

export const MAX_SESSION_ATTEMPTS = 20;
export const MAX_ANSWER_CHARS = 2000;

function getDraftStorageKey(pageId, chunkId) {
  return pageId && chunkId ? `mindbridge:draft:${pageId}:${chunkId}` : null;
}

function readSessionDraft(pageId, chunkId) {
  try {
    const key = getDraftStorageKey(pageId, chunkId);
    if (!key || typeof window === 'undefined' || !window.sessionStorage) return '';
    return window.sessionStorage.getItem(key) || '';
  } catch {
    return '';
  }
}

function writeSessionDraft(pageId, chunkId, draft) {
  try {
    const key = getDraftStorageKey(pageId, chunkId);
    if (!key || typeof window === 'undefined' || !window.sessionStorage) return;
    if (draft) {
      window.sessionStorage.setItem(key, draft);
    } else {
      window.sessionStorage.removeItem(key);
    }
  } catch {
    // Ignore storage denial
  }
}

function generateId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `id-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function addAssistanceKind(assistance, kind) {
  if (!kind) return assistance;
  const kinds = assistance.kinds.includes(kind)
    ? assistance.kinds
    : [...assistance.kinds, kind];
  return {
    used: kinds.length > 0,
    kinds,
  };
}

export function createInitialLearningState({ pageId = null, chunkId = null, restoredSession = null } = {}) {
  const savedDraft = readSessionDraft(pageId, chunkId);

  if (
    restoredSession &&
    restoredSession.page_id === pageId &&
    restoredSession.chunk_id === chunkId &&
    restoredSession.plan
  ) {
    const attempts = Array.isArray(restoredSession.attempts) ? restoredSession.attempts : [];
    const lastAttempt = attempts[attempts.length - 1] || null;
    const baseline =
      attempts.find(
        (a) => a.feedback?.status === 'evaluated' && Boolean(a.feedback?.follow_up_question)
      ) || null;

    let stage = 'answering';
    if (restoredSession.retry_result) {
      stage = 'results';
    } else if (lastAttempt) {
      stage = 'feedback';
    }

    return {
      sessionId: restoredSession.id || generateId(),
      pageId,
      chunkId,
      stage,
      plan: restoredSession.plan,
      draft: restoredSession.draft || savedDraft || '',
      validationError: null,
      error: null,
      assistance: { used: false, kinds: [] },
      attempts,
      evaluatedInitialBaseline: baseline,
      latestRetryResult: restoredSession.retry_result || null,
      showingSourceDuringStage: false,
    };
  }

  return {
    sessionId: generateId(),
    pageId,
    chunkId,
    stage: 'preparing',
    plan: null,
    draft: savedDraft,
    validationError: null,
    error: null,
    assistance: { used: false, kinds: [] },
    attempts: [],
    evaluatedInitialBaseline: null,
    latestRetryResult: null,
    showingSourceDuringStage: false,
  };
}

export function learningSessionReducer(state, action) {
  switch (action.type) {
    case 'RESET':
      return {
        ...createInitialLearningState({
          pageId: action.pageId ?? state.pageId,
          chunkId: action.chunkId ?? state.chunkId,
        }),
        draft: '',
      };

    case 'PREPARE_START':
      return {
        ...state,
        stage: 'preparing',
        error: null,
        validationError: null,
      };

    case 'PREPARE_SUCCESS':
      return {
        ...state,
        stage: 'answering',
        plan: action.plan,
        error: null,
        validationError: null,
        assistance: { used: false, kinds: [] },
      };

    case 'PREPARE_ERROR':
      return {
        ...state,
        stage: 'prep_error',
        error: action.error,
      };

    case 'SET_DRAFT':
      return {
        ...state,
        draft: action.draft,
        validationError: null,
      };

    case 'SET_VALIDATION_ERROR':
      return {
        ...state,
        validationError: action.message,
      };

    case 'SUBMIT_START': {
      const nextStage = state.evaluatedInitialBaseline ? 'submitting_retry' : 'submitting';
      return {
        ...state,
        stage: nextStage,
        error: null,
        validationError: null,
      };
    }

    case 'SUBMIT_SUCCESS': {
      const { attempt, retry_result } = action.result;
      const nextAttempts = [...state.attempts, attempt];
      const isInitialEvaluated =
        !state.evaluatedInitialBaseline &&
        attempt.feedback?.status === 'evaluated' &&
        Boolean(attempt.feedback?.follow_up_question);

      const nextBaseline = isInitialEvaluated ? attempt : state.evaluatedInitialBaseline;
      const isRetryEvaluated =
        Boolean(state.evaluatedInitialBaseline) &&
        attempt.feedback?.status === 'evaluated' &&
        Boolean(retry_result);

      return {
        ...state,
        stage: isRetryEvaluated ? 'results' : 'feedback',
        attempts: nextAttempts,
        evaluatedInitialBaseline: nextBaseline,
        latestRetryResult: isRetryEvaluated ? retry_result : state.latestRetryResult,
        draft: attempt.feedback?.status === 'uncertain' ? state.draft : '',
        error: null,
        validationError: null,
        showingSourceDuringStage: false,
      };
    }

    case 'SUBMIT_ERROR':
      return {
        ...state,
        stage: state.evaluatedInitialBaseline ? 'retrying' : 'answering',
        error: action.error,
      };

    case 'SUBMIT_CANCEL':
      return {
        ...state,
        stage: state.evaluatedInitialBaseline ? 'retrying' : 'answering',
      };

    case 'START_RETRY':
      if (!state.evaluatedInitialBaseline?.feedback?.follow_up_question) {
        return state;
      }
      return {
        ...state,
        stage: 'retrying',
        draft: '',
        error: null,
        validationError: null,
        assistance: { used: false, kinds: [] },
        showingSourceDuringStage: false,
      };

    case 'CLARIFY_UNCERTAIN': {
      const lastAttempt = state.attempts[state.attempts.length - 1];
      return {
        ...state,
        stage: state.evaluatedInitialBaseline ? 'retrying' : 'answering',
        draft: state.draft || lastAttempt?.answer || '',
        error: null,
        validationError: null,
      };
    }

    case 'REQUEST_HELP':
      return {
        ...state,
        assistance: addAssistanceKind(state.assistance, action.kind),
        showingSourceDuringStage:
          action.kind === 'source' ? true : state.showingSourceDuringStage,
      };

    case 'CLOSE_SOURCE_REVIEW':
      return {
        ...state,
        showingSourceDuringStage: false,
      };

    case 'VIEW_RESULTS':
      if (!state.latestRetryResult) return state;
      return {
        ...state,
        stage: 'results',
      };

    default:
      return state;
  }
}

export function useLearningSession({ page, chunkId, restoredSession = null, onSessionChange = null }) {
  const [state, dispatch] = useReducer(
    learningSessionReducer,
    { pageId: page?.id || null, chunkId, restoredSession },
    createInitialLearningState
  );

  const invocationRef = useRef(0);
  const controllerRef = useRef(null);

  const cancelInFlight = useCallback(() => {
    invocationRef.current += 1;
    if (controllerRef.current) {
      controllerRef.current.abort();
      controllerRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => {
      cancelInFlight();
    };
  }, [cancelInFlight]);

  // Preserve student draft across accidental tab refresh
  useEffect(() => {
    if (!page?.id || !chunkId) return;
    writeSessionDraft(page.id, chunkId, state.draft);
  }, [page?.id, chunkId, state.draft]);

  // Sync session snapshot upwards when plan/attempts/draft update
  useEffect(() => {
    if (!onSessionChange || !state.plan || !page) return;
    onSessionChange({
      id: state.sessionId,
      page_id: page.id,
      chunk_id: chunkId,
      plan: state.plan,
      attempts: state.attempts,
      retry_result: state.latestRetryResult,
      draft: state.draft,
    });
  }, [
    onSessionChange,
    page,
    chunkId,
    state.sessionId,
    state.plan,
    state.attempts,
    state.latestRetryResult,
    state.draft,
  ]);

  const prepare = useCallback(async () => {
    if (!page || !chunkId) return;
    cancelInFlight();
    const controller = new AbortController();
    controllerRef.current = controller;
    const invocationId = ++invocationRef.current;

    dispatch({ type: 'PREPARE_START' });

    try {
      const source = buildSourceContext(page, [chunkId], {
        requireClear: true,
        includeAdjacent: true,
      });
      const plan = await prepareUnderstanding(
        { source, chunk_id: chunkId },
        { signal: controller.signal }
      );

      if (invocationId !== invocationRef.current) return;
      controllerRef.current = null;

      if (
        !plan ||
        plan.page_id !== page.id ||
        plan.chunk_id !== chunkId ||
        !plan.objective?.criteria ||
        plan.objective.criteria.length < 2 ||
        !plan.initial_question?.id
      ) {
        dispatch({
          type: 'PREPARE_ERROR',
          error: {
            origin: 'server',
            code: 'AI_INVALID_RESPONSE',
            message: 'The prepared learning plan did not match the selected textbook section.',
            retryable: true,
          },
        });
        return;
      }

      dispatch({ type: 'PREPARE_SUCCESS', plan });
    } catch (err) {
      if (invocationId !== invocationRef.current || err?.aborted) return;
      controllerRef.current = null;
      dispatch({
        type: 'PREPARE_ERROR',
        error: err?.code
          ? err
          : {
              origin: 'client',
              code: 'VALIDATION_ERROR',
              message: err?.message || 'Could not prepare a question for this section.',
              retryable: false,
            },
      });
    }
  }, [page, chunkId, cancelInFlight]);

  const currentQuestion = state.evaluatedInitialBaseline
    ? state.evaluatedInitialBaseline.feedback.follow_up_question
    : state.plan?.initial_question || null;

  const atAttemptCap = state.attempts.length >= MAX_SESSION_ATTEMPTS;

  const submitAnswer = useCallback(async () => {
    if (!page || !state.plan || !currentQuestion) return;
    if (atAttemptCap) {
      dispatch({
        type: 'SET_VALIDATION_ERROR',
        message: 'You have reached the 20-attempt limit for this session. Review your session or start a fresh one.',
      });
      return;
    }

    const trimmed = state.draft.trim();
    if (!trimmed) {
      dispatch({
        type: 'SET_VALIDATION_ERROR',
        message: 'Write an explanation in your own words before submitting.',
      });
      return;
    }

    if (state.draft.length > MAX_ANSWER_CHARS) {
      dispatch({
        type: 'SET_VALIDATION_ERROR',
        message: `Keep your answer within ${MAX_ANSWER_CHARS} characters.`,
      });
      return;
    }

    cancelInFlight();
    const controller = new AbortController();
    controllerRef.current = controller;
    const invocationId = ++invocationRef.current;

    const attemptId = generateId();
    dispatch({ type: 'SUBMIT_START' });

    try {
      const source = buildSourceContext(page, [chunkId], {
        requireClear: true,
        includeAdjacent: true,
      });

      const payload = {
        source,
        plan: state.plan,
        attempt_id: attemptId,
        question: currentQuestion,
        answer: state.draft,
        assistance: state.assistance,
        previous_attempt: state.evaluatedInitialBaseline || null,
      };

      const result = await checkUnderstanding(payload, { signal: controller.signal });
      if (invocationId !== invocationRef.current) return;
      controllerRef.current = null;

      const returnedAttempt = result?.attempt;
      if (
        !returnedAttempt ||
        returnedAttempt.id !== attemptId ||
        returnedAttempt.plan_id !== state.plan.id ||
        returnedAttempt.question?.id !== currentQuestion.id ||
        returnedAttempt.question?.text !== currentQuestion.text
      ) {
        dispatch({
          type: 'SUBMIT_ERROR',
          error: {
            origin: 'server',
            code: 'AI_INVALID_RESPONSE',
            message: 'The feedback response did not match your submitted question. Your answer is preserved—please try again.',
            retryable: true,
          },
        });
        return;
      }

      dispatch({ type: 'SUBMIT_SUCCESS', result });
    } catch (err) {
      if (invocationId !== invocationRef.current || err?.aborted) return;
      controllerRef.current = null;
      dispatch({ type: 'SUBMIT_ERROR', error: err });
    }
  }, [
    page,
    chunkId,
    state.plan,
    state.draft,
    state.assistance,
    state.evaluatedInitialBaseline,
    currentQuestion,
    atAttemptCap,
    cancelInFlight,
  ]);

  const cancelSubmit = useCallback(() => {
    cancelInFlight();
    dispatch({ type: 'SUBMIT_CANCEL' });
  }, [cancelInFlight]);

  return {
    state,
    currentQuestion,
    atAttemptCap,
    prepare,
    setDraft: (draft) => dispatch({ type: 'SET_DRAFT', draft }),
    submitAnswer,
    cancelSubmit,
    startRetry: () => dispatch({ type: 'START_RETRY' }),
    clarifyUncertain: () => dispatch({ type: 'CLARIFY_UNCERTAIN' }),
    requestHelp: (kind) => dispatch({ type: 'REQUEST_HELP', kind }),
    closeSourceReview: () => dispatch({ type: 'CLOSE_SOURCE_REVIEW' }),
    viewResults: () => dispatch({ type: 'VIEW_RESULTS' }),
    resetSession: () => {
      cancelInFlight();
      writeSessionDraft(page?.id, chunkId, '');
      dispatch({ type: 'RESET', pageId: page?.id || null, chunkId });
    },
  };
}
