import { useCallback, useRef, useState } from 'react';
import { defineTerm, explainConcept, simplify } from '../lib/api';
import { buildSourceContext } from '../lib/sourceContext';
import { useApiRequest } from './useApiRequest';
import { usePage } from '../context/PageContext';

function normalizeKey(value) {
  return String(value || '').trim().toLowerCase();
}

export function useReadingTools(page) {
  const {
    simplificationCache,
    definitionCache,
    explanationCache,
    cacheSimplification,
    cacheDefinition,
    cacheExplanation,
  } = usePage();

  const [mode, setMode] = useState('original');
  const [glossaryState, setGlossaryState] = useState({
    open: false,
    phrase: '',
    chunkId: null,
    sentence: '',
    entry: null,
    status: 'idle',
    error: null,
  });
  const [explanationState, setExplanationState] = useState({
    open: false,
    concept: '',
    chunkId: null,
    explanation: null,
    status: 'idle',
    error: null,
  });

  const simplifyReq = useApiRequest(simplify);
  const defineReq = useApiRequest(defineTerm);
  const explainReq = useApiRequest(explainConcept);

  // Track active in-flight lookup keys to avoid duplicate concurrent calls
  const inflightSimplifyRef = useRef(null);
  const inflightDefineRef = useRef(null);
  const inflightExplainRef = useRef(null);

  const simplifyChunk = useCallback(
    async (chunkId, level = 'easy') => {
      if (!page || !chunkId) return null;
      const cacheKey = `${page.id}:${chunkId}:${level}`;
      if (simplificationCache[cacheKey]) {
        setMode(level);
        return { ok: true, item: simplificationCache[cacheKey] };
      }

      if (inflightSimplifyRef.current === cacheKey && simplifyReq.status === 'pending') {
        return null;
      }

      inflightSimplifyRef.current = cacheKey;
      try {
        const source = buildSourceContext(page, [chunkId], {
          requireClear: true,
          includeAdjacent: true,
        });
        const outcome = await simplifyReq.run({
          source,
          chunk_ids: [chunkId],
          level,
        });

        if (outcome?.ok && outcome.data?.items?.length) {
          const item = outcome.data.items.find((i) => i.chunk_id === chunkId) || outcome.data.items[0];
          cacheSimplification(cacheKey, item);
          setMode(level);
          return { ok: true, item };
        }
        return outcome;
      } catch (err) {
        return { ok: false, error: { origin: 'client', code: 'VALIDATION_ERROR', message: err.message } };
      } finally {
        if (inflightSimplifyRef.current === cacheKey) {
          inflightSimplifyRef.current = null;
        }
      }
    },
    [page, simplificationCache, cacheSimplification, simplifyReq]
  );

  const lookupTerm = useCallback(
    async ({ chunkId, phrase, sentence, allowRemote = true }) => {
      if (!page || !phrase) return;
      const cleanPhrase = phrase.trim();
      const normPhrase = normalizeKey(cleanPhrase);
      const cleanSentence = (sentence || '').trim();

      // 1. Check initial PageDoc glossary first (no extra API call needed)
      const initialMatch = Array.isArray(page.glossary)
        ? page.glossary.find((g) => normalizeKey(g.phrase) === normPhrase)
        : null;

      if (initialMatch) {
        setGlossaryState({
          open: true,
          phrase: cleanPhrase,
          chunkId,
          sentence: cleanSentence,
          entry: initialMatch,
          status: 'success',
          error: null,
        });
        return;
      }

      // 2. Check page-scoped cache keyed by page/chunk/phrase/context/language
      const cacheKey = `${page.id}:${chunkId || 'any'}:${normPhrase}:${cleanSentence}:en`;
      if (definitionCache[cacheKey]) {
        setGlossaryState({
          open: true,
          phrase: cleanPhrase,
          chunkId,
          sentence: cleanSentence,
          entry: definitionCache[cacheKey],
          status: 'success',
          error: null,
        });
        return;
      }

      if (!allowRemote || !chunkId) {
        setGlossaryState({
          open: true,
          phrase: cleanPhrase,
          chunkId,
          sentence: cleanSentence,
          entry: null,
          status: 'error',
          error: {
            code: 'FEATURE_UNAVAILABLE',
            message: 'On-demand definitions are not available for this selection or server configuration.',
            retryable: false,
          },
        });
        return;
      }

      if (inflightDefineRef.current === cacheKey && defineReq.status === 'pending') {
        return;
      }

      inflightDefineRef.current = cacheKey;
      setGlossaryState({
        open: true,
        phrase: cleanPhrase,
        chunkId,
        sentence: cleanSentence,
        entry: null,
        status: 'pending',
        error: null,
      });

      try {
        const chunk = page.chunks.find((c) => c.id === chunkId);
        const surrounding = cleanSentence || chunk?.text || cleanPhrase;
        const source = buildSourceContext(page, [chunkId], {
          requireClear: true,
          includeAdjacent: true,
        });
        const outcome = await defineReq.run({
          source,
          chunk_id: chunkId,
          phrase: cleanPhrase,
          surrounding_sentence: surrounding,
          language: 'en',
        });

        if (outcome?.ok) {
          cacheDefinition(cacheKey, outcome.data);
          setGlossaryState((prev) => ({
            ...prev,
            entry: outcome.data,
            status: 'success',
            error: null,
          }));
        } else if (!outcome?.cancelled) {
          setGlossaryState((prev) => ({
            ...prev,
            status: 'error',
            error: outcome?.error || { message: 'Could not define this phrase.', retryable: true },
          }));
        }
      } catch (err) {
        setGlossaryState((prev) => ({
          ...prev,
          status: 'error',
          error: { message: err.message || 'Could not define this phrase.', retryable: false },
        }));
      } finally {
        if (inflightDefineRef.current === cacheKey) {
          inflightDefineRef.current = null;
        }
      }
    },
    [page, definitionCache, cacheDefinition, defineReq]
  );

  const requestExplanation = useCallback(
    async ({ chunkId, concept, allowRemote = true }) => {
      if (!page || !chunkId || !concept) return;
      const cleanConcept = concept.trim();
      const cacheKey = `${page.id}:${chunkId}:${normalizeKey(cleanConcept)}:en`;

      if (explanationCache[cacheKey]) {
        setExplanationState({
          open: true,
          concept: cleanConcept,
          chunkId,
          explanation: explanationCache[cacheKey],
          status: 'success',
          error: null,
        });
        return;
      }

      if (!allowRemote) {
        setExplanationState({
          open: true,
          concept: cleanConcept,
          chunkId,
          explanation: null,
          status: 'error',
          error: {
            code: 'FEATURE_UNAVAILABLE',
            message: 'Concept explanations are currently unavailable.',
            retryable: false,
          },
        });
        return;
      }

      if (inflightExplainRef.current === cacheKey && explainReq.status === 'pending') {
        return;
      }

      inflightExplainRef.current = cacheKey;
      setExplanationState({
        open: true,
        concept: cleanConcept,
        chunkId,
        explanation: null,
        status: 'pending',
        error: null,
      });

      try {
        const source = buildSourceContext(page, [chunkId], {
          requireClear: true,
          includeAdjacent: true,
        });
        const outcome = await explainReq.run({
          source,
          chunk_id: chunkId,
          concept: cleanConcept,
          language: 'en',
        });

        if (outcome?.ok) {
          cacheExplanation(cacheKey, outcome.data);
          setExplanationState((prev) => ({
            ...prev,
            explanation: outcome.data,
            status: 'success',
            error: null,
          }));
        } else if (!outcome?.cancelled) {
          setExplanationState((prev) => ({
            ...prev,
            status: 'error',
            error: outcome?.error || { message: 'Could not explain this concept.', retryable: true },
          }));
        }
      } catch (err) {
        setExplanationState((prev) => ({
          ...prev,
          status: 'error',
          error: { message: err.message || 'Could not explain this concept.', retryable: false },
        }));
      } finally {
        if (inflightExplainRef.current === cacheKey) {
          inflightExplainRef.current = null;
        }
      }
    },
    [page, explanationCache, cacheExplanation, explainReq]
  );

  const closeGlossary = useCallback(() => {
    defineReq.cancel();
    setGlossaryState((prev) => ({ ...prev, open: false }));
  }, [defineReq]);

  const closeExplanation = useCallback(() => {
    explainReq.cancel();
    setExplanationState((prev) => ({ ...prev, open: false }));
  }, [explainReq]);

  return {
    mode,
    setMode,
    simplificationCache,
    simplifyStatus: simplifyReq.status,
    simplifyError: simplifyReq.error,
    simplifyChunk,
    cancelSimplify: simplifyReq.cancel,
    glossaryState,
    lookupTerm,
    closeGlossary,
    explanationState,
    requestExplanation,
    closeExplanation,
  };
}
