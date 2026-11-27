import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { getHealth } from '../lib/api';
import {
  DEFAULT_RELEASE_FLAGS,
  checkFeatureAvailability,
  checkLearningAvailability,
  getBrowserCapabilities,
  isHealthCompatible,
} from '../config/features';

const ApiContext = createContext(null);

export function ApiProvider({
  children,
  initialReleaseFlags = DEFAULT_RELEASE_FLAGS,
  healthFetcher = getHealth,
  skipInitialHealthCheck = false,
}) {
  const [health, setHealth] = useState(null);
  const [healthStatus, setHealthStatus] = useState('idle');
  const [healthError, setHealthError] = useState(null);
  const [releaseFlags] = useState(initialReleaseFlags);
  const controllerRef = useRef(null);

  const browserCapabilities = useMemo(() => getBrowserCapabilities(), []);

  const refreshHealth = useCallback(async () => {
    if (controllerRef.current) {
      controllerRef.current.abort();
    }
    const controller = new AbortController();
    controllerRef.current = controller;
    setHealthStatus('pending');
    setHealthError(null);

    try {
      const data = await healthFetcher({ signal: controller.signal });
      if (controller.signal.aborted) return null;
      setHealth(data);
      setHealthStatus('success');
      return data;
    } catch (err) {
      if (controller.signal.aborted || err?.aborted) return null;
      setHealth(null);
      setHealthError(err);
      setHealthStatus('error');
      return null;
    }
  }, [healthFetcher]);

  useEffect(() => {
    if (!skipInitialHealthCheck) {
      refreshHealth();
    }
    return () => {
      if (controllerRef.current) {
        controllerRef.current.abort();
      }
    };
  }, [refreshHealth, skipInitialHealthCheck]);

  const getFeatureState = useCallback(
    (feature, { page = null, requireClearSource = false } = {}) => {
      if (feature === 'learning') {
        return checkLearningAvailability({
          releaseFlags,
          health,
          healthStatus,
          page,
          requireClearSource,
        });
      }
      return checkFeatureAvailability(feature, {
        releaseFlags,
        health,
        healthStatus,
        page,
        requireClearSource,
      });
    },
    [releaseFlags, health, healthStatus]
  );

  const value = useMemo(
    () => ({
      health,
      healthStatus,
      healthError,
      healthCompatible: isHealthCompatible(health),
      releaseFlags,
      browserCapabilities,
      refreshHealth,
      getFeatureState,
    }),
    [
      health,
      healthStatus,
      healthError,
      releaseFlags,
      browserCapabilities,
      refreshHealth,
      getFeatureState,
    ]
  );

  return <ApiContext.Provider value={value}>{children}</ApiContext.Provider>;
}

export function useApi() {
  const ctx = useContext(ApiContext);
  if (!ctx) {
    throw new Error('useApi must be used within an ApiProvider.');
  }
  return ctx;
}
