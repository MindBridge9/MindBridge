export const PREFERENCES_STORAGE_KEY = 'mindbridge:reading-preferences:v1';

export const DEFAULT_PREFERENCES = Object.freeze({
  schema_version: 1,
  font_family: 'lexend',
  font_size_px: 20,
  line_height: 1.8,
  letter_spacing_em: 0,
  word_spacing_em: 0,
  reading_width_ch: 65,
  theme: 'cream',
  speech_rate: 1,
  voice_uri: null,
  highlight_sentence: true,
  auto_scroll: false,
  reduce_motion: false,
});

const VALID_FONT_FAMILIES = new Set(['lexend', 'manrope', 'system', 'opendyslexic']);
const VALID_THEMES = new Set(['cream', 'paper', 'dark']);

function clampNumber(value, min, max, fallback, { integer = false, precision = 4 } = {}) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  const bounded = Math.min(max, Math.max(min, value));
  if (integer) return Math.round(bounded);
  const factor = 10 ** precision;
  return Math.round(bounded * factor) / factor;
}

export function validatePreferences(candidate, defaults = DEFAULT_PREFERENCES) {
  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) {
    return { valid: false, value: { ...defaults } };
  }
  if (candidate.schema_version !== 1) {
    return { valid: false, value: { ...defaults } };
  }

  const font_family = VALID_FONT_FAMILIES.has(candidate.font_family)
    ? candidate.font_family
    : defaults.font_family;

  const theme = VALID_THEMES.has(candidate.theme) ? candidate.theme : defaults.theme;

  let voice_uri = defaults.voice_uri;
  if (candidate.voice_uri === null) {
    voice_uri = null;
  } else if (
    typeof candidate.voice_uri === 'string' &&
    candidate.voice_uri.trim().length > 0 &&
    candidate.voice_uri.length <= 300
  ) {
    voice_uri = candidate.voice_uri;
  }

  const validated = {
    schema_version: 1,
    font_family,
    font_size_px: clampNumber(candidate.font_size_px, 16, 32, defaults.font_size_px, {
      integer: true,
    }),
    line_height: clampNumber(candidate.line_height, 1.4, 2.4, defaults.line_height, {
      precision: 2,
    }),
    letter_spacing_em: clampNumber(
      candidate.letter_spacing_em,
      0,
      0.12,
      defaults.letter_spacing_em,
      { precision: 3 }
    ),
    word_spacing_em: clampNumber(candidate.word_spacing_em, 0, 0.3, defaults.word_spacing_em, {
      precision: 3,
    }),
    reading_width_ch: clampNumber(candidate.reading_width_ch, 45, 80, defaults.reading_width_ch, {
      integer: true,
    }),
    theme,
    speech_rate: clampNumber(candidate.speech_rate, 0.6, 1.4, defaults.speech_rate, {
      precision: 2,
    }),
    voice_uri,
    highlight_sentence:
      typeof candidate.highlight_sentence === 'boolean'
        ? candidate.highlight_sentence
        : defaults.highlight_sentence,
    reduce_motion: typeof candidate.reduce_motion === 'boolean' ? candidate.reduce_motion : defaults.reduce_motion,
    auto_scroll:
      typeof candidate.auto_scroll === 'boolean' ? candidate.auto_scroll : defaults.auto_scroll,
  };

  return { valid: true, value: validated };
}

export function loadPreferences(defaults = DEFAULT_PREFERENCES) {
  const safeDefaults = { ...defaults };
  try {
    if (typeof window === 'undefined' || !window.localStorage) {
      return { ok: false, value: safeDefaults, error: 'Storage unavailable' };
    }
    const raw = window.localStorage.getItem(PREFERENCES_STORAGE_KEY);
    if (!raw) {
      return { ok: true, value: safeDefaults };
    }
    const parsed = JSON.parse(raw);
    const { valid, value } = validatePreferences(parsed, safeDefaults);
    if (!valid) {
      return { ok: false, value: safeDefaults, error: 'Stored preferences were reset to defaults' };
    }
    return { ok: true, value };
  } catch (err) {
    return {
      ok: false,
      value: safeDefaults,
      error: err instanceof Error ? err.message : 'Unable to read preferences',
    };
  }
}

export function savePreferences(value) {
  try {
    if (typeof window === 'undefined' || !window.localStorage) {
      return { ok: false, error: 'Storage unavailable' };
    }
    const { value: normalized } = validatePreferences(value, DEFAULT_PREFERENCES);
    window.localStorage.setItem(PREFERENCES_STORAGE_KEY, JSON.stringify(normalized));
    return { ok: true, value: normalized };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Unable to save preferences',
    };
  }
}

export function clearPreferences() {
  try {
    if (typeof window === 'undefined' || !window.localStorage) {
      return { ok: false, error: 'Storage unavailable' };
    }
    window.localStorage.removeItem(PREFERENCES_STORAGE_KEY);
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Unable to clear preferences',
    };
  }
}
