import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import {
  DEFAULT_PREFERENCES,
  clearPreferences,
  loadPreferences,
  savePreferences,
  validatePreferences,
} from '../lib/storage';

const PreferencesContext = createContext(null);

const FONT_FAMILY_VAR = {
  lexend: 'var(--mb-font-reading-lexend)',
  manrope: 'var(--mb-font-reading-manrope)',
  system: 'var(--mb-font-reading-system)',
  // OpenDyslexic is only enabled when licensed assets exist; falls back cleanly to Lexend
  opendyslexic: 'var(--mb-font-reading-lexend)',
};

export function PreferencesProvider({ children }) {
  const initial = useMemo(() => loadPreferences(DEFAULT_PREFERENCES), []);
  const [preferences, setPreferences] = useState(initial.value);
  const [storageWarning, setStorageWarning] = useState(initial.ok ? null : initial.error || null);

  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty(
      '--mb-reading-font',
      FONT_FAMILY_VAR[preferences.font_family] || FONT_FAMILY_VAR.lexend
    );
    root.style.setProperty('--mb-reading-size', `${preferences.font_size_px}px`);
    root.style.setProperty('--mb-reading-line-height', String(preferences.line_height));
    root.style.setProperty('--mb-reading-letter-spacing', `${preferences.letter_spacing_em}em`);
    root.style.setProperty('--mb-reading-word-spacing', `${preferences.word_spacing_em}em`);
    root.style.setProperty('--mb-reading-width', `${preferences.reading_width_ch}ch`);
  }, [preferences]);

  const updatePreferences = useCallback((patch) => {
    setPreferences((prev) => {
      const merged = validatePreferences({ ...prev, ...patch }, DEFAULT_PREFERENCES).value;
      const result = savePreferences(merged);
      setStorageWarning(
        result.ok ? null : 'Reading settings are active for this session (browser storage unavailable).'
      );
      return merged;
    });
  }, []);

  const resetPreferences = useCallback(() => {
    const defaults = { ...DEFAULT_PREFERENCES };
    setPreferences(defaults);
    const result = clearPreferences();
    if (!result.ok) {
      setStorageWarning('Preferences reset for this session (browser storage unavailable).');
    } else {
      setStorageWarning(null);
    }
  }, []);

  const value = useMemo(
    () => ({
      preferences,
      storageWarning,
      updatePreferences,
      resetPreferences,
    }),
    [preferences, storageWarning, updatePreferences, resetPreferences]
  );

  return <PreferencesContext.Provider value={value}>{children}</PreferencesContext.Provider>;
}

export function usePreferences() {
  const ctx = useContext(PreferencesContext);
  if (!ctx) {
    throw new Error('usePreferences must be used within a PreferencesProvider.');
  }
  return ctx;
}
