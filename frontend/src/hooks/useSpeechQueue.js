import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { boundarySentence, chooseSpeechVoice, speechBatch, VOICE_PREVIEW_TEXT } from '../components/speech/speechText';

export function useSpeechQueue({ sentences = [], voiceUri = null, rate = .9, locale = 'en-IN', allowRemote = false, continuity = 'auto', playbackKey = '', highlightSentence = true, autoScroll = false } = {}) {
  const supported = useMemo(() => typeof window !== 'undefined' && Boolean(window.speechSynthesis && window.SpeechSynthesisUtterance), []);
  const [status, setStatus] = useState(supported ? 'idle' : 'unsupported');
  const [activeIndex, setActiveIndex] = useState(-1);
  const [highlightIndex, setHighlightIndex] = useState(-1);
  const [voices, setVoices] = useState([]);
  const [errorMessage, setErrorMessage] = useState(null);
  const [playbackNote, setPlaybackNote] = useState(null);
  const [previewing, setPreviewing] = useState(false);
  const generation = useRef(0), utteranceRef = useRef(null), indexRef = useRef(-1), stateRef = useRef(status);
  const transportIntent = useRef('idle');
  const boundaryVoice = useRef(null), resumeCursor = useRef(null), restartNeeded = useRef(false);
  const current = useRef({});
  current.current = { sentences, voiceUri, rate, locale, allowRemote, continuity, voices };
  const setState = useCallback(value => { stateRef.current = value; setStatus(value); }, []);
  const setIndex = useCallback((index, highlight = index) => { indexRef.current = index; setActiveIndex(index); setHighlightIndex(highlight); }, []);
  const refreshVoices = useCallback(() => {
    if (!supported) return [];
    let available = [];
    try { available = Array.from(new Map(window.speechSynthesis.getVoices().map(voice => [voice.voiceURI, voice])).values()); } catch { /* Retry when the browser loads voices. */ }
    current.current.voices = available; setVoices(available); return available;
  }, [supported]);
  useEffect(() => {
    if (!supported) return;
    const synth = window.speechSynthesis;
    const handler = () => refreshVoices();
    refreshVoices();
    const timers = [250, 1000, 2000].map(delay => setTimeout(handler, delay));
    const previous = synth.onvoiceschanged;
    const legacy = event => { previous?.call(synth, event); handler(); };
    if (synth.addEventListener) synth.addEventListener('voiceschanged', handler); else synth.onvoiceschanged = legacy;
    window.addEventListener('focus', handler);
    return () => {
      timers.forEach(clearTimeout); window.removeEventListener('focus', handler);
      if (synth.removeEventListener) synth.removeEventListener('voiceschanged', handler);
      else if (synth.onvoiceschanged === legacy) synth.onvoiceschanged = previous;
    };
  }, [supported, refreshVoices]);
  const cancel = useCallback(() => {
    generation.current += 1; utteranceRef.current = null; resumeCursor.current = null;
    if (supported) { try { window.speechSynthesis.cancel(); } catch { /* Some browsers throw during shutdown. */ } }
  }, [supported]);
  const resolveVoice = useCallback(() => {
    const options = current.current;
    return chooseSpeechVoice(refreshVoices(), options.voiceUri, options.locale, options.allowRemote);
  }, [refreshVoices]);
  const configure = useCallback((utterance, voice) => {
    utterance.voice = voice; utterance.lang = voice.lang;
    utterance.rate = Math.min(1.4, Math.max(.6, Number(current.current.rate) || .9));
    utterance.pitch = 1; utterance.volume = 1;
  }, []);
  const reportError = useCallback(code => {
    cancel(); setIndex(-1); setPreviewing(false);
    setErrorMessage(code === 'not-allowed' ? 'Your browser blocked speech. Press Read aloud again, or check site audio permissions.' : 'Speech stopped unexpectedly. Choose another available voice or press Read aloud to restart.');
    setState('error');
  }, [cancel, setIndex, setState]);
  const speakAt = useCallback((startIndex, offset = 0) => {
    if (!supported) { setState('unsupported'); return; }
    cancel(); transportIntent.current = 'playing'; setPreviewing(false); setPlaybackNote(null); setErrorMessage(null); restartNeeded.current = false;
    const {voice,error} = resolveVoice();
    if (!voice) { setErrorMessage(error); setState('error'); setIndex(-1); return; }
    const token = generation.current;
    const voiceKey = `${voice.voiceURI}:${current.current.rate}`;
    const enqueue = (index, speechOffset = 0) => {
      if (token !== generation.current) return;
      if (voice.localService !== true && !current.current.allowRemote) { reportError('remote-disabled'); return; }
      const list = current.current.sentences;
      while (index >= 0 && index < list.length && !list[index].text.trim()) index += 1;
      if (index < 0 || index >= list.length) { utteranceRef.current = null; setIndex(-1); setState('idle'); return; }
      const connected = current.current.continuity !== 'sentence' && boundaryVoice.current === voiceKey;
      const batch = speechBatch(list, index, connected, 600, speechOffset);
      const utterance = new window.SpeechSynthesisUtterance(batch.text);
      configure(utterance, voice); utteranceRef.current = utterance;
      let completed = false, boundarySeen = false;
      const valid = () => token === generation.current && utteranceRef.current === utterance && !completed;
      const multiple = batch.ranges.some(range => range.index !== index);
      const start = () => { if (!valid()) return; setIndex(index, multiple ? -1 : index); if (transportIntent.current !== 'paused') setState('playing'); };
      utterance.onstart = start;
      utterance.onboundary = event => {
        if (!valid() || stateRef.current === 'paused') return;
        const sentence = boundarySentence(batch.ranges, event.charIndex);
        if (sentence === null) return;
        boundarySeen = true; boundaryVoice.current = voiceKey; setIndex(sentence);
      };
      utterance.onpause = () => { if (valid() && transportIntent.current === 'paused') setState('paused'); };
      utterance.onresume = () => { if (valid() && transportIntent.current === 'playing') setState('playing'); };
      utterance.onend = () => {
        if (!valid()) return; completed = true; utteranceRef.current = null;
        if (!boundarySeen) {
          boundaryVoice.current = null;
          setPlaybackNote('Timing events unavailable · sentence playback.');
        } else setPlaybackNote('Highlighting follows reported voice boundaries.');
        if (stateRef.current === 'paused') { resumeCursor.current = {index:batch.nextIndex,offset:batch.nextOffset}; return; }
        // Continue without cancel(): cancel between sentences adds gaps and can drop queued audio.
        enqueue(batch.nextIndex, batch.nextOffset);
      };
      utterance.onerror = event => { if (valid()) reportError(event.error); };
      setIndex(index, multiple ? -1 : index); setState('playing');
      try { window.speechSynthesis.speak(utterance); } catch { reportError('start-failed'); }
    };
    enqueue(startIndex, offset);
  }, [supported, cancel, resolveVoice, configure, reportError, setIndex, setState]);
  const singleText = useRef(null);
  const pronounce = useCallback((text, preview = false) => {
    if (!supported || !String(text || '').trim()) return;
    cancel(); transportIntent.current = 'playing'; setIndex(-1); setErrorMessage(null); setPlaybackNote(null);
    const {voice,error} = resolveVoice();
    if (!voice) { setPreviewing(false); setErrorMessage(error); setState('error'); return; }
    const token = generation.current;
    const utterance = new window.SpeechSynthesisUtterance(String(text));
    configure(utterance, voice); utteranceRef.current = utterance; singleText.current = {text,preview};
    setPreviewing(preview); restartNeeded.current = false;
    const valid = () => generation.current === token && utteranceRef.current === utterance;
    utterance.onend = () => { if (!valid()) return; utteranceRef.current = null; setPreviewing(false); setState('idle'); };
    utterance.onerror = event => { if (valid()) reportError(event.error); };
    setState('playing');
    try { window.speechSynthesis.speak(utterance); } catch { reportError('start-failed'); }
  }, [supported, cancel, setIndex, resolveVoice, configure, reportError, setState]);
  const play = useCallback((index = 0) => speakAt(index), [speakAt]);
  const pause = useCallback(() => {
    if (!supported || stateRef.current !== 'playing') return;
    transportIntent.current = 'paused';
    try {
      if (!window.speechSynthesis.pause) throw new Error('pause');
      window.speechSynthesis.pause();
    } catch {
      cancel(); restartNeeded.current = true;
      setPlaybackNote('This browser cannot pause reliably. Resume restarts the current sentence.');
    }
    setState('paused');
  }, [supported, cancel, setState]);
  const resume = useCallback(() => {
    if (!supported || stateRef.current !== 'paused') return;
    transportIntent.current = 'playing';
    if (resumeCursor.current) { const cursor = resumeCursor.current; speakAt(cursor.index,cursor.offset); return; }
    if (!restartNeeded.current && utteranceRef.current && window.speechSynthesis.resume) {
      try { window.speechSynthesis.resume(); setState('playing'); return; } catch { /* Restart explicitly below. */ }
    }
    if (indexRef.current >= 0) speakAt(indexRef.current);
    else if (singleText.current) pronounce(singleText.current.text,singleText.current.preview);
  }, [supported, speakAt, pronounce, setState]);
  const stop = useCallback(() => { transportIntent.current = 'idle'; cancel(); setIndex(-1); setPreviewing(false); setErrorMessage(null); setPlaybackNote(null); setState(supported?'idle':'unsupported'); }, [cancel,setIndex,setState,supported]);
  const previous = useCallback(() => speakAt(Math.max(0,indexRef.current-1)),[speakAt]);
  const next = useCallback(() => speakAt(Math.min(current.current.sentences.length-1,indexRef.current+1)),[speakAt]);
  const signature = useMemo(() => JSON.stringify(sentences.map(item=>[item.id,item.text,item.chunkId,item.paragraphIndex])),[sentences]);
  useEffect(() => { stop(); boundaryVoice.current = null; }, [signature,playbackKey,stop]);
  useEffect(() => {
    boundaryVoice.current = null;
    if (stateRef.current === 'playing') {
      if (indexRef.current >= 0) { speakAt(indexRef.current); setPlaybackNote('Voice or speed changed · restarting the current sentence.'); } else stop();
    } else if (stateRef.current === 'paused') {
      cancel(); restartNeeded.current = true;
      setPlaybackNote('Voice or speed changed. Resume restarts the current sentence.');
    }
  }, [rate,voiceUri,locale,allowRemote,continuity,cancel,speakAt,stop]);
  useLayoutEffect(() => () => cancel(),[cancel]);
  const activeSentenceId = highlightSentence && highlightIndex >= 0 ? sentences[highlightIndex]?.id || null : null;
  useEffect(() => {
    if (!autoScroll || !activeSentenceId) return;
    const node = Array.from(document.querySelectorAll('[data-sentence-id]')).find(el=>el.dataset.sentenceId === activeSentenceId);
    node?.scrollIntoView?.({block:'nearest',behavior:document.documentElement.dataset.reducedMotion==='true' || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});
  },[autoScroll,activeSentenceId]);
  return {status,activeSentenceId,activeIndex,voices,errorMessage,playbackNote,previewing,
    canPrevious:supported && activeIndex>0,canNext:supported && activeIndex>=0 && activeIndex<sentences.length-1,
    play,pause,resume,stop,previous,next,pronounce,refreshVoices,previewVoice:()=>pronounce(VOICE_PREVIEW_TEXT,true)};
}
