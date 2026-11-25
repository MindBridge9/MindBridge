import { useCallback, useEffect, useRef, useState } from 'react';

export function useApiRequest(requestFn) {
  const [status, setStatus] = useState('idle');
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  const invocationRef = useRef(0);
  const controllerRef = useRef(null);
  const requestFnRef = useRef(requestFn);
  requestFnRef.current = requestFn;

  const cancel = useCallback(() => {
    invocationRef.current += 1;
    if (controllerRef.current) {
      controllerRef.current.abort();
      controllerRef.current = null;
    }
    setStatus('idle');
    setError(null);
  }, []);

  const reset = useCallback(() => {
    invocationRef.current += 1;
    if (controllerRef.current) {
      controllerRef.current.abort();
      controllerRef.current = null;
    }
    setStatus('idle');
    setData(null);
    setError(null);
  }, []);

  const run = useCallback(async (...args) => {
    if (controllerRef.current) {
      controllerRef.current.abort();
    }
    const controller = new AbortController();
    controllerRef.current = controller;
    const invocationId = ++invocationRef.current;

    setStatus('pending');
    setError(null);

    try {
      const result = await requestFnRef.current(...args, { signal: controller.signal });
      if (invocationId !== invocationRef.current) {
        return { cancelled: true };
      }
      controllerRef.current = null;
      setData(result);
      setStatus('success');
      return { ok: true, data: result };
    } catch (err) {
      if (invocationId !== invocationRef.current || err?.aborted) {
        return { cancelled: true, error: err };
      }
      controllerRef.current = null;
      setError(err);
      setStatus('error');
      return { ok: false, error: err };
    }
  }, []);

  useEffect(() => {
    return () => {
      invocationRef.current += 1;
      if (controllerRef.current) {
        controllerRef.current.abort();
      }
    };
  }, []);

  return {
    status,
    data,
    error,
    run,
    cancel,
    reset,
  };
}
