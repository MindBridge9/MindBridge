export const EXPECTED_API_VERSION = '1.0';

export const AI_CAPABILITY_KEYS = Object.freeze([
  'read',
  'simplify',
  'define',
  'explain',
  'prepare_understanding',
  'check_understanding',
]);

export function parseReleaseFlags(env = typeof import.meta !== 'undefined' ? import.meta.env : {}) {
  const perCapabilityRaw = env?.VITE_ENABLED_CAPABILITIES;
  const legacyAllEnabled = env?.VITE_ENABLE_INTEGRATED_FEATURES === 'true';

  const flags = {
    read: false,
    simplify: false,
    define: false,
    explain: false,
    prepare_understanding: false,
    check_understanding: false,
    guided_level: false,
    saved_pages: false,
  };

  if (typeof perCapabilityRaw === 'string' && perCapabilityRaw.trim().length > 0) {
    const requested = new Set(
      perCapabilityRaw
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean)
    );
    for (const key of AI_CAPABILITY_KEYS) {
      flags[key] = requested.has(key);
    }
    return Object.freeze(flags);
  }

  if (legacyAllEnabled) {
    for (const key of AI_CAPABILITY_KEYS) {
      flags[key] = true;
    }
  }

  return Object.freeze(flags);
}

// Release flags start false per INTEGRATION_TASKS (I03) and FRONTEND_SPEC.
// Integration environments may opt in per capability via VITE_ENABLED_CAPABILITIES
// (e.g. "read,simplify,define,explain") or VITE_ENABLE_INTEGRATED_FEATURES=true,
// and live AI still requires the backend /api/health capability flag to be true.
export const DEFAULT_RELEASE_FLAGS = parseReleaseFlags();

export function getBrowserCapabilities() {
  const speechSupported =
    typeof window !== 'undefined' &&
    typeof window.speechSynthesis !== 'undefined' &&
    typeof window.SpeechSynthesisUtterance !== 'undefined';

  const indexedDbSupported =
    typeof window !== 'undefined' && typeof window.indexedDB !== 'undefined';

  const fileInputSupported =
    typeof document !== 'undefined' && typeof FileReader !== 'undefined';

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

export function hasClearParagraphChunk(page) {
  return Boolean(
    page &&
      Array.isArray(page.chunks) &&
      page.chunks.some((chunk) => chunk.quality === 'clear' && chunk.kind === 'paragraph')
  );
}

export function checkFeatureAvailability(
  feature,
  {
    releaseFlags = DEFAULT_RELEASE_FLAGS,
    health = null,
    healthStatus = 'idle',
    page = null,
    requireClearSource = false,
  } = {}
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

  if (!health.capabilities?.[feature]) {
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
  if (requireClearSource && !hasClearParagraphChunk(page)) {
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
