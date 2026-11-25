import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { segmentDisplayedChunks, splitTextIntoSentences } from '../components/speech/segmentDisplayedChunks';
import { useSpeechQueue } from '../hooks/useSpeechQueue';

describe('Sentence segmentation and useSpeechQueue', () => {
  const originalSynth = window.speechSynthesis;
  const originalUtterance = window.SpeechSynthesisUtterance;
  let utterances = [];

  beforeEach(() => {
    utterances = [];
    window.SpeechSynthesisUtterance = function MockUtterance(text) {
      this.text = text;
      this.rate = 1;
      this.voice = null;
      this.onstart = null;
      this.onend = null;
      this.onerror = null;
      utterances.push(this);
    };
    window.speechSynthesis = {
      paused: false,
      getVoices: () => [{ voiceURI: 'en-1', name: 'English Voice', lang: 'en-US' }],
      speak: vi.fn((u) => {
        u.onstart?.();
      }),
      cancel: vi.fn(),
      pause: vi.fn(() => {
        window.speechSynthesis.paused = true;
      }),
      resume: vi.fn(() => {
        window.speechSynthesis.paused = false;
      }),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    };
  });

  afterEach(() => {
    window.speechSynthesis = originalSynth;
    window.SpeechSynthesisUtterance = originalUtterance;
  });

  it('preserves displayed text characters across segmentation', () => {
    const text = 'Plants absorb sunlight. They make glucose from CO2 and water!';
    const parts = splitTextIntoSentences(text);
    expect(parts.length).toBeGreaterThanOrEqual(2);
    expect(parts.join('')).toBe(text);

    const res = segmentDisplayedChunks({
      pageId: 'p1',
      chunks: [{ id: 'c0001', kind: 'paragraph', text, quality: 'clear' }],
      displayByChunkId: {},
    });
    expect(res.sentences[0].id).toBe('p1:c0001:original:0');
    expect(res.byChunkId.c0001.sentences.map((s) => s.text).join('')).toBe(text);
  });

  it('plays sentence by sentence, guards stale callbacks, and supports pause/resume/prev/next', () => {
    const sentences = [
      { id: 'p1:c1:original:0', chunkId: 'c1', level: 'original', text: 'First sentence.' },
      { id: 'p1:c1:original:1', chunkId: 'c1', level: 'original', text: 'Second sentence.' },
    ];

    const { result } = renderHook(() => useSpeechQueue({ sentences }));

    act(() => {
      result.current.play(0);
    });
    expect(result.current.status).toBe('playing');
    expect(result.current.activeSentenceId).toBe('p1:c1:original:0');
    const firstUtterance = utterances[0];

    act(() => {
      result.current.pause();
    });
    expect(result.current.status).toBe('paused');

    act(() => {
      result.current.resume();
    });
    expect(result.current.status).toBe('playing');

    // Advance naturally via onend
    act(() => {
      firstUtterance.onend();
    });
    expect(result.current.activeSentenceId).toBe('p1:c1:original:1');

    // Stop and verify stale callback from old utterance is ignored
    act(() => {
      result.current.stop();
    });
    expect(result.current.status).toBe('idle');
    act(() => {
      utterances[1].onend();
    });
    expect(result.current.status).toBe('idle');
  });
});
