import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

const PageContext = createContext(null);

export function PageProvider({ children }) {
  const [page, setPage] = useState(null);
  const [readability, setReadability] = useState(null);
  const [retakeReasons, setRetakeReasons] = useState([]);
  const [imageBlob, setImageBlob] = useState(null);
  const [imageUrl, setImageUrl] = useState(null);
  const [sourceOrigin, setSourceOrigin] = useState('live'); // 'live' | 'sample' | 'saved'

  // Page-scoped caches cleared whenever active page is replaced or discarded
  const [simplificationCache, setSimplificationCache] = useState(() => ({}));
  const [definitionCache, setDefinitionCache] = useState(() => ({}));
  const [explanationCache, setExplanationCache] = useState(() => ({}));
  const [learningSession, setLearningSession] = useState(null);

  const currentUrlRef = useRef(null);

  const revokeCurrentUrl = useCallback(() => {
    if (currentUrlRef.current) {
      URL.revokeObjectURL(currentUrlRef.current);
      currentUrlRef.current = null;
    }
  }, []);

  const setActivePage = useCallback(
    (nextPage, blob = null, meta = {}) => {
      revokeCurrentUrl();
      let nextUrl = null;
      if (blob instanceof Blob) {
        nextUrl = URL.createObjectURL(blob);
        currentUrlRef.current = nextUrl;
      }

      setPage(nextPage || null);
      setImageBlob(blob || null);
      setImageUrl(nextUrl);
      setReadability(meta.readability ?? (nextPage ? 'readable' : null));
      setRetakeReasons(Array.isArray(meta.retakeReasons) ? meta.retakeReasons : []);
      setSourceOrigin(meta.origin || 'live');

      // Hydrate optional saved caches or reset fresh for a new scan
      setSimplificationCache(meta.simplificationCache || {});
      setDefinitionCache(meta.definitionCache || {});
      setExplanationCache(meta.explanationCache || {});
      setLearningSession(meta.learningSession || null);
    },
    [revokeCurrentUrl]
  );

  const clearActivePage = useCallback(() => {
    revokeCurrentUrl();
    setPage(null);
    setImageBlob(null);
    setImageUrl(null);
    setReadability(null);
    setRetakeReasons([]);
    setSourceOrigin('live');
    setSimplificationCache({});
    setDefinitionCache({});
    setExplanationCache({});
    setLearningSession(null);
  }, [revokeCurrentUrl]);

  useEffect(() => {
    return () => {
      revokeCurrentUrl();
    };
  }, [revokeCurrentUrl]);

  const cacheSimplification = useCallback((cacheKey, value) => {
    setSimplificationCache((prev) => ({ ...prev, [cacheKey]: value }));
  }, []);

  const cacheDefinition = useCallback((cacheKey, value) => {
    setDefinitionCache((prev) => ({ ...prev, [cacheKey]: value }));
  }, []);

  const cacheExplanation = useCallback((cacheKey, value) => {
    setExplanationCache((prev) => ({ ...prev, [cacheKey]: value }));
  }, []);

  const value = useMemo(
    () => ({
      page,
      readability,
      retakeReasons,
      imageBlob,
      imageUrl,
      sourceOrigin,
      simplificationCache,
      definitionCache,
      explanationCache,
      learningSession,
      setActivePage,
      clearActivePage,
      cacheSimplification,
      cacheDefinition,
      cacheExplanation,
      setLearningSession,
    }),
    [
      page,
      readability,
      retakeReasons,
      imageBlob,
      imageUrl,
      sourceOrigin,
      simplificationCache,
      definitionCache,
      explanationCache,
      learningSession,
      setActivePage,
      clearActivePage,
      cacheSimplification,
      cacheDefinition,
      cacheExplanation,
    ]
  );

  return <PageContext.Provider value={value}>{children}</PageContext.Provider>;
}

export function usePage() {
  const ctx = useContext(PageContext);
  if (!ctx) {
    throw new Error('usePage must be used within a PageProvider.');
  }
  return ctx;
}
