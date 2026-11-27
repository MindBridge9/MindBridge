import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

function isSpeechSupported() {
  return (
    typeof window !== 'undefined' &&
    typeof window.speechSynthesis !== 'undefined' &&
    typeof window.SpeechSynthesisUtterance !== 'undefined'
  );
}

export function useSpeechQueue({
  sentences = [],
  voiceUri = null,
  rate = 1,
  highlightSentence = true,
  autoScroll = false,
} = {}) {
  const supported = useMemo(() => isSpeechSupported(), []);
  const [status, setStatus] = useState(() => (supported ? 'idle' : 'unsupported'));
  const [activeIndex, setActiveIndex] = useState(-1);
  const [voices, setVoices] = useState([]);
  const [errorMessage, setErrorMessage] = useState(null);

  const tokenRef = useRef(0);
  const indexRef = useRef(-1);
  const statusRef = useRef(status);
  const sentencesRef = useRef(sentences);
  const voiceUriRef = useRef(voiceUri);
  const rateRef = useRef(rate);
  const voicesRef = useRef(voices);

  statusRef.current = status;
  sentencesRef.current = sentences;
  voiceUriRef.current = voiceUri;
  rateRef.current = rate;
  voicesRef.current = voices;

  const updateIndex = useCallback((nextIdx) => {
    indexRef.current = nextIdx;
    setActiveIndex(nextIdx);
  }, []);

  const refreshVoices = useCallback(() => {
    if (!supported) return;
    try {
      const available = window.speechSynthesis.getVoices?.() || [];
      setVoices(available);
    } catch {
      setVoices([]);
    }
  }, [supported]);

  useEffect(() => {
    if (!supported) return undefined;
    refreshVoices();
    const synth = window.speechSynthesis;
    if (typeof synth.addEventListener === 'function') {
      synth.addEventListener('voiceschanged', refreshVoices);
      return () => synth.removeEventListener('voiceschanged', refreshVoices);
    }
    const previousHandler = synth.onvoiceschanged;
    synth.onvoiceschanged = refreshVoices;
    return () => {
      synth.onvoiceschanged = previousHandler;
    };
  }, [supported, refreshVoices]);

  const cancelSynthesis = useCallback(() => {
    tokenRef.current += 1;
    if (supported) {
      try {
        window.speechSynthesis.cancel();
      } catch {
        // Ignore browser cancel quirk
      }
    }
  }, [supported]);

  const speakAt = useCallback(
    (startIndex) => {
      if (!supported) {
        setStatus('unsupported');
        return;
      }
      const list = sentencesRef.current;
      if (!list || list.length === 0 || startIndex < 0 || startIndex >= list.length) {
        cancelSynthesis();
        updateIndex(-1);
        setStatus('idle');
        return;
      }

      cancelSynthesis();
      const playbackToken = tokenRef.current;
      const item = list[startIndex];
      const utterance = new window.SpeechSynthesisUtterance(item.text);

      utterance.rate = Math.min(1.4, Math.max(0.6, Number(rateRef.current) || 1));
      if (voiceUriRef.current) {
        const matched = voicesRef.current.find((v) => v.voiceURI === voiceUriRef.current);
        if (matched) {
          utterance.voice = matched;
        }
      }

      utterance.onstart = () => {
        if (tokenRef.current !== playbackToken) return;
        updateIndex(startIndex);
        setErrorMessage(null);
        setStatus('playing');
      };

      utterance.onend = () => {
        if (tokenRef.current !== playbackToken) return;
        const nextIdx = startIndex + 1;
        if (nextIdx < sentencesRef.current.length) {
          speakAt(nextIdx);
        } else {
          updateIndex(-1);
          setStatus('idle');
        }
      };

      utterance.onerror = (event) => {
        if (tokenRef.current !== playbackToken) return;
        const errCode = event?.error;
        if (errCode === 'canceled' || errCode === 'interrupted') {
          updateIndex(-1);
          setStatus('idle');
          return;
        }
        setErrorMessage('Audio playback was interrupted by the browser. Press Play to restart.');
        updateIndex(-1);
        setStatus('error');
      };

      updateIndex(startIndex);
      setErrorMessage(null);
      setStatus('playing');
      try {
        window.speechSynthesis.speak(utterance);
      } catch {
        setErrorMessage('Could not start browser speech playback.');
        updateIndex(-1);
        setStatus('error');
      }
    },
    [supported, cancelSynthesis, updateIndex]
  );

  const play = useCallback(
    (startIndex = 0) => {
      if (!supported) {
        setStatus('unsupported');
        return;
      }
      const target =
        typeof startIndex === 'number' && startIndex >= 0
          ? startIndex
          : indexRef.current >= 0
            ? indexRef.current
            : 0;
      speakAt(target);
    },
    [supported, speakAt]
  );

  const pause = useCallback(() => {
    if (!supported || statusRef.current !== 'playing') return;
    try {
      if (typeof window.speechSynthesis.pause === 'function') {
        window.speechSynthesis.pause();
        setStatus('paused');
      } else {
        cancelSynthesis();
        setStatus('paused');
      }
    } catch {
      cancelSynthesis();
      setStatus('paused');
    }
  }, [supported, cancelSynthesis]);

  const resume = useCallback(() => {
    if (!supported || statusRef.current !== 'paused') return;
    try {
      if (typeof window.speechSynthesis.resume === 'function' && window.speechSynthesis.paused) {
        window.speechSynthesis.resume();
        setStatus('playing');
      } else {
        const current = indexRef.current >= 0 ? indexRef.current : 0;
        speakAt(current);
      }
    } catch {
      const current = indexRef.current >= 0 ? indexRef.current : 0;
      speakAt(current);
    }
  }, [supported, speakAt]);

  const stop = useCallback(() => {
    cancelSynthesis();
    updateIndex(-1);
    setErrorMessage(null);
    if (supported) {
      setStatus('idle');
    }
  }, [cancelSynthesis, updateIndex, supported]);

  const previous = useCallback(() => {
    if (!supported || sentencesRef.current.length === 0) return;
    const prevIdx = Math.max(0, (indexRef.current >= 0 ? indexRef.current : 0) - 1);
    speakAt(prevIdx);
  }, [supported, speakAt]);

  const next = useCallback(() => {
    if (!supported || sentencesRef.current.length === 0) return;
    const nextIdx = Math.min(
      sentencesRef.current.length - 1,
      (indexRef.current >= 0 ? indexRef.current : -1) + 1
    );
    speakAt(nextIdx);
  }, [supported, speakAt]);

  const pronounce = useCallback(
    (text) => {
      if (!supported || !text || !String(text).trim()) return;
      cancelSynthesis();
      const playbackToken = tokenRef.current;
      updateIndex(-1);
      setErrorMessage(null);

      const utterance = new window.SpeechSynthesisUtterance(String(text));
      utterance.rate = Math.min(1.4, Math.max(0.6, Number(rateRef.current) || 1));
      if (voiceUriRef.current) {
        const matched = voicesRef.current.find((v) => v.voiceURI === voiceUriRef.current);
        if (matched) {
          utterance.voice = matched;
        }
      }
      utterance.onend = () => {
        if (tokenRef.current !== playbackToken) return;
        setStatus('idle');
      };
      utterance.onerror = () => {
        if (tokenRef.current !== playbackToken) return;
        setStatus('idle');
      };

      setStatus('playing');
      try {
        window.speechSynthesis.speak(utterance);
      } catch {
        setStatus('error');
      }
    },
    [supported, cancelSynthesis, updateIndex]
  );

  // Stop speech cleanly whenever sentence list changes (mode switch or new page)
  const sentenceSignature = useMemo(
    () => sentences.map((s) => s.id).join('|'),
    [sentences]
  );

  useEffect(() => {
    cancelSynthesis();
    updateIndex(-1);
    setErrorMessage(null);
    if (supported) {
      setStatus('idle');
    }
  }, [sentenceSignature, cancelSynthesis, updateIndex, supported]);

  // Rebuild from current sentence if rate or voice changes while playing
  useEffect(() => {
    if (statusRef.current === 'playing' && indexRef.current >= 0) {
      speakAt(indexRef.current);
    }
  }, [rate, voiceUri, speakAt]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cancelSynthesis();
    };
  }, [cancelSynthesis]);

  const activeSentenceId =
    highlightSentence && activeIndex >= 0 && activeIndex < sentences.length
      ? sentences[activeIndex].id
      : null;

  // Optional auto-scroll (off by default, never moves keyboard focus)
  useEffect(() => {
    if (!autoScroll || !activeSentenceId) return;
    const escaped =
      typeof CSS !== 'undefined' && typeof CSS.escape === 'function'
        ? CSS.escape(activeSentenceId)
        : activeSentenceId.replace(/"/g, '\\"');
    const el = document.querySelector(`[data-sentence-id="${escaped}"]`);
    if (el && typeof el.scrollIntoView === 'function') {
      el.scrollIntoView({ block: 'nearest', behavior: document.documentElement.dataset.reducedMotion === 'true' || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
    }
  }, [autoScroll, activeSentenceId]);

  return {
    status,
    activeSentenceId,
    activeIndex,
    voices,
    errorMessage,
    canPrevious: supported && sentences.length > 0 && activeIndex > 0,
    canNext: supported && sentences.length > 0 && activeIndex >= 0 && activeIndex < sentences.length - 1,
    play,
    pause,
    resume,
    stop,
    previous,
    next,
    pronounce,
  };
}
