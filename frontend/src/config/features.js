export const EXPECTED_API_VERSION = '1.0';

// Release flags start false per INTEGRATION_TASKS (I03) and FRONTEND_SPEC.
// Integration environments may opt in via VITE_ENABLE_INTEGRATED_FEATURES=true,
// and live AI still requires the backend /api/health capability flag to be true.
const ENV_ENABLED =
  typeof import.meta !== 'undefined' &&
  import.meta.env?.VITE_ENABLE_INTEGRATED_FEATURES === 'true';

export const DEFAULT_RELEASE_FLAGS = Object.freeze({
  read: ENV_ENABLED,
  simplify: ENV_ENABLED,
  define: ENV_ENABLED,
  explain: ENV_ENABLED,
  prepare_understanding: ENV_ENABLED,
  check_understanding: ENV_ENABLED,
  guided_level: false,
  saved_pages: false,
});

export function getBrowserCapabilities() {
  const speechSupported =
    typeof window !== 'undefined' &&
    typeof window.speechSynthesis !== 'undefined' &&
    typeof window.SpeechSynthesisUtterance !== 'undefined';

  const indexedDbSupported =
    typeof window !== 'undefined' && typeof window.indexedDB !== 'undefined';

  const fileInputSupported =
    typeof document !== 'undefined' &&
    typeof FileReader !== 'undefined';

  return {
    speech: speechSupported,
    indexedDb: indexedDbSupported,
    fileInput: fileInputSupported,
  };
}

export function isHealthCompatible(health) {
  return Boolean(health && health.status === 'ok' && health.api_version === EXPECTED_API_VERSION);
}

export function hasClearSourceChunk(page) {
  return Boolean(
    page &&
      Array.isArray(page.chunks) &&
      page.chunks.some((chunk) => chunk.quality === 'clear' && chunk.kind !== 'heading')
  );
}

export function checkFeatureAvailability(
  feature,
  { releaseFlags = DEFAULT_RELEASE_FLAGS, health = null, healthStatus = 'idle', page = null, requireClearSource = false } = {}
) {
  if (!releaseFlags?.[feature]) {
    return { available: false, reason: 'release_disabled' };
  }

  if (healthStatus === 'pending' || healthStatus === 'idle' || !health) {
    return {
      available: false,
      reason: healthStatus === 'error' ? 'health_unreachable' : 'health_unknown',
    };
  }

  if (!isHealthCompatible(health)) {
    return { available: false, reason: 'version_mismatch' };
  }

  if (feature === 'learning') {
    const canPrepare = Boolean(health.capabilities?.prepare_understanding && releaseFlags.prepare_understanding);
    const canCheck = Boolean(health.capabilities?.check_understanding && releaseFlags.check_understanding);
    if (!canPrepare || !canCheck) {
      return { available: false, reason: 'backend_unsupported' };
    }
  } else if (!health.capabilities?.[feature]) {
    return { available: false, reason: 'backend_unsupported' };
  }

  if (requireClearSource && !hasClearSourceChunk(page)) {
    return { available: false, reason: 'insufficient_source' };
  }

  return { available: true, reason: 'available' };
}

export function checkLearningAvailability({
  releaseFlags = DEFAULT_RELEASE_FLAGS,
  health = null,
  healthStatus = 'idle',
  page = null,
  requireClearSource = false,
} = {}) {
  if (!releaseFlags?.prepare_understanding || !releaseFlags?.check_understanding) {
    return { available: false, reason: 'release_disabled' };
  }
  if (healthStatus === 'pending' || healthStatus === 'idle' || !health) {
    return {
      available: false,
      reason: healthStatus === 'error' ? 'health_unreachable' : 'health_unknown',
    };
  }
  if (!isHealthCompatible(health)) {
    return { available: false, reason: 'version_mismatch' };
  }
  if (!health.capabilities?.prepare_understanding || !health.capabilities?.check_understanding) {
    return { available: false, reason: 'backend_unsupported' };
  }
  if (requireClearSource && !hasClearSourceChunk(page)) {
    return { available: false, reason: 'insufficient_source' };
  }
  return { available: true, reason: 'available' };
}

export function describeAvailabilityReason(reason, featureLabel = 'This feature') {
  switch (reason) {
    case 'release_disabled':
      return `${featureLabel} is not activated in this release build yet.`;
    case 'health_unknown':
      return 'Checking MindBridge server status…';
    case 'health_unreachable':
      return 'Could not reach the MindBridge server. Existing local reading content stays available.';
    case 'version_mismatch':
      return 'The connected server API version does not match this client.';
    case 'backend_unsupported':
      return `${featureLabel} is currently disabled by the server capability configuration.`;
    case 'insufficient_source':
      return 'Select a clear textbook paragraph to use this feature.';
    default:
      return `${featureLabel} is currently unavailable.`;
  }
}
