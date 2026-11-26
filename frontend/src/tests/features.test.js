import { describe, expect, it, vi, beforeEach } from 'vitest';
import {
  DEFAULT_PREFERENCES,
  PREFERENCES_STORAGE_KEY,
  clearPreferences,
  loadPreferences,
  savePreferences,
} from '../lib/storage';
import {
  DEFAULT_RELEASE_FLAGS,
  checkFeatureAvailability,
  checkLearningAvailability,
  parseReleaseFlags,
} from '../config/features';
import defaultFixture from '../../../docs/fixtures/preferences.defaults.json';
import healthInitial from '../../../docs/fixtures/health.initial.json';
import readSuccess from '../../../docs/fixtures/read.success.json';

describe('Preferences storage & defaults', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('matches preferences.defaults.json fixture exactly', () => {
    expect(DEFAULT_PREFERENCES).toEqual(defaultFixture);
  });

  it('resets safely on malformed JSON or wrong schema_version', () => {
    window.localStorage.setItem(PREFERENCES_STORAGE_KEY, '{bad-json');
    expect(loadPreferences().ok).toBe(false);
    expect(loadPreferences().value).toEqual(DEFAULT_PREFERENCES);

    window.localStorage.setItem(
      PREFERENCES_STORAGE_KEY,
      JSON.stringify({ ...DEFAULT_PREFERENCES, schema_version: 99 })
    );
    expect(loadPreferences().ok).toBe(false);
    expect(loadPreferences().value).toEqual(DEFAULT_PREFERENCES);
  });

  it('clamps out-of-range values and handles denied storage gracefully', () => {
    const saved = savePreferences({
      ...DEFAULT_PREFERENCES,
      font_size_px: 99,
      line_height: 0.5,
      theme: 'dark',
    });
    expect(saved.ok).toBe(true);
    expect(saved.value.font_size_px).toBe(32);
    expect(saved.value.line_height).toBe(1.4);
    expect(saved.value.theme).toBe('dark');

    const getSpy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('Denied', 'SecurityError');
    });
    const res = loadPreferences();
    expect(res.ok).toBe(false);
    expect(res.value).toEqual(DEFAULT_PREFERENCES);
    getSpy.mockRestore();

    expect(clearPreferences().ok).toBe(true);
  });
});

describe('Feature availability gating', () => {
  it('starts all release flags false by default and supports per-capability opt-in', () => {
    expect(Object.values(DEFAULT_RELEASE_FLAGS).every((v) => v === false)).toBe(true);

    const partial = parseReleaseFlags({ VITE_ENABLED_CAPABILITIES: 'read, simplify, define' });
    expect(partial.read).toBe(true);
    expect(partial.simplify).toBe(true);
    expect(partial.define).toBe(true);
    expect(partial.explain).toBe(false);
    expect(partial.prepare_understanding).toBe(false);
    expect(partial.check_understanding).toBe(false);
  });

  it('distinguishes unknown health from backend unsupported and requires both learning endpoints', () => {
    const allFlagsOn = {
      read: true,
      simplify: true,
      define: true,
      explain: true,
      prepare_understanding: true,
      check_understanding: true,
    };

    expect(
      checkFeatureAvailability('read', {
        releaseFlags: allFlagsOn,
        health: null,
        healthStatus: 'error',
      })
    ).toEqual({ available: false, reason: 'health_unreachable' });

    expect(
      checkFeatureAvailability('read', {
        releaseFlags: allFlagsOn,
        health: healthInitial,
        healthStatus: 'success',
      })
    ).toEqual({ available: false, reason: 'backend_unsupported' });

    expect(
      checkFeatureAvailability('read', {
        releaseFlags: allFlagsOn,
        health: { ...healthInitial, api_version: '2.0', capabilities: { ...healthInitial.capabilities, read: true } },
        healthStatus: 'success',
      })
    ).toEqual({ available: false, reason: 'version_mismatch' });

    const partialLearningHealth = {
      ...healthInitial,
      capabilities: {
        ...healthInitial.capabilities,
        read: true,
        simplify: true,
        define: true,
        explain: true,
        prepare_understanding: true,
        check_understanding: false,
      },
    };
    expect(
      checkFeatureAvailability('read', {
        releaseFlags: allFlagsOn,
        health: partialLearningHealth,
        healthStatus: 'success',
      })
    ).toEqual({ available: true, reason: 'available' });
    expect(
      checkLearningAvailability({
        releaseFlags: allFlagsOn,
        health: partialLearningHealth,
        healthStatus: 'success',
        page: readSuccess.page,
        requireClearSource: true,
      })
    ).toEqual({ available: false, reason: 'backend_unsupported' });

    const fullLearningHealth = {
      ...healthInitial,
      capabilities: { ...healthInitial.capabilities, prepare_understanding: true, check_understanding: true },
    };
    expect(
      checkLearningAvailability({
        releaseFlags: allFlagsOn,
        health: fullLearningHealth,
        healthStatus: 'success',
        page: readSuccess.page,
        requireClearSource: true,
      })
    ).toEqual({ available: true, reason: 'available' });
  });
});
