import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { segmentDisplayedChunks, splitTextIntoSentences } from '../components/speech/segmentDisplayedChunks';
import { chooseSpeechVoice, speechBatch, boundarySentence, spokenSentence, VOICE_PREVIEW_TEXT } from '../components/speech/speechText';
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
      getVoices: () => [{ voiceURI: 'en-1', name: 'English Voice', lang: 'en-US', localService: true }],
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

  it('selects local English by accent, preserves a chosen voice and gates remote or unknown locations', () => {
    const list=[{voiceURI:'remote',lang:'en-IN',default:true,localService:false},{voiceURI:'us',lang:'en-US',localService:true},{voiceURI:'in',lang:'en-IN',localService:true}];
    expect(chooseSpeechVoice(list,null,'en-IN').voice.voiceURI).toBe('in');
    expect(chooseSpeechVoice(list,'us','en-IN').voice.voiceURI).toBe('us');
    expect(chooseSpeechVoice(list,'gone').error).toContain('not available');
    expect(chooseSpeechVoice(list,'remote').error).toContain('remote speech');
    expect(chooseSpeechVoice(list,'remote','en-IN',true).voice.voiceURI).toBe('remote');
    expect(chooseSpeechVoice([{voiceURI:'unknown',lang:'en-US'}],'unknown').error).toBeTruthy();
  });

  it('loads voices asynchronously and preserves the selected voice across refreshes', () => {
    let available=[];window.speechSynthesis.getVoices=()=>available;
    const {result}=renderHook(()=>useSpeechQueue({sentences:[{id:'a',text:'A sentence.'}],voiceUri:'gb'}));
    act(()=>result.current.play());expect(result.current.status).toBe('error');expect(window.speechSynthesis.speak).not.toHaveBeenCalled();
    available=[{voiceURI:'gb',name:'British sample',lang:'en-GB',localService:true}];
    const listener=window.speechSynthesis.addEventListener.mock.calls.find(([event])=>event==='voiceschanged')[1];
    act(()=>listener());expect(result.current.voices).toHaveLength(1);
    act(()=>result.current.play());expect(utterances.at(-1).voice.voiceURI).toBe('gb');expect(utterances.at(-1).rate).toBe(.9);expect(utterances.at(-1).pitch).toBe(1);
  });

  it('connects bounded sentences only after actual boundaries and maps spoken offsets to displayed sentences', () => {
    const sentences=['Probe. ','Use 20 mL of water. ','Then heat it to 25 °C. ','Observe the result. '].map((text,i)=>({id:`s${i}`,text,chunkId:'c',paragraphIndex:0}));
    const {result}=renderHook(()=>useSpeechQueue({sentences}));
    act(()=>result.current.play());const first=utterances[0];const cancelCount=window.speechSynthesis.cancel.mock.calls.length;
    act(()=>first.onboundary({charIndex:0}));act(()=>first.onend());
    const batch=utterances[1];expect(batch.text).toContain('20 millilitres');expect(batch.text).toContain('25 degrees Celsius');expect(batch.text).toContain('Observe the result.');
    expect(result.current.activeSentenceId).toBeNull();
    act(()=>batch.onboundary({charIndex:batch.text.indexOf('Then')}));expect(result.current.activeSentenceId).toBe('s2');
    act(()=>first.onend());expect(utterances).toHaveLength(2);
    expect(window.speechSynthesis.cancel.mock.calls.length).toBe(cancelCount);
    act(()=>batch.onend());expect(result.current.status).toBe('idle');
    expect(sentences[1].text).toBe('Use 20 mL of water. ');
  });

  it('retains sentence fallback when boundaries are absent and ignores stale boundaries after content changes', () => {
    const {result,rerender,unmount}=renderHook(({text})=>useSpeechQueue({sentences:[{id:'a',text,chunkId:'c'},{id:'b',text:'Second. ',chunkId:'c'},{id:'c',text:'Third.',chunkId:'c'}]}),{initialProps:{text:'Original.'}});
    act(()=>result.current.play());const first=utterances[0];act(()=>first.onend());expect(utterances[1].text).toBe('Second. ');
    const old=utterances[1];rerender({text:'Simplified with same id.'});expect(result.current.status).toBe('idle');
    act(()=>{old.onboundary({charIndex:0});old.onend();});expect(result.current.activeSentenceId).toBeNull();expect(utterances).toHaveLength(2);
    act(()=>result.current.play());const current=utterances.at(-1);unmount();const count=utterances.length;act(()=>current.onend());expect(utterances).toHaveLength(count);
  });

  it('never falls back to a remote browser default and previews only the fixed sample after consent', () => {
    window.speechSynthesis.getVoices=()=>[{voiceURI:'remote',name:'Remote voice',lang:'en-US',localService:false,default:true}];
    const {result,rerender}=renderHook(({allow})=>useSpeechQueue({voiceUri:'remote',allowRemote:allow}),{initialProps:{allow:false}});
    act(()=>result.current.previewVoice());expect(window.speechSynthesis.speak).not.toHaveBeenCalled();
    rerender({allow:true});act(()=>result.current.previewVoice());expect(utterances.at(-1).text).toBe(VOICE_PREVIEW_TEXT);expect(result.current.previewing).toBe(true);
    act(()=>result.current.stop());expect(result.current.status).toBe('idle');
  });

  it('does not restart paused speech unless configuration changes or native resume fails', () => {
    const sentences=[{id:'a',text:'First.'},{id:'b',text:'Second.'}];
    const {result,rerender}=renderHook(({rate})=>useSpeechQueue({sentences,rate}),{initialProps:{rate:.9}});
    act(()=>result.current.play());act(()=>result.current.pause());act(()=>utterances[0].onstart());expect(result.current.status).toBe('paused');act(()=>result.current.resume());expect(utterances).toHaveLength(1);
    act(()=>result.current.pause());act(()=>utterances[0].onresume());expect(result.current.status).toBe('paused');rerender({rate:1.1});const old=utterances[0];expect(result.current.status).toBe('paused');
    act(()=>result.current.resume());expect(utterances).toHaveLength(2);expect(utterances[1].rate).toBe(1.1);
    act(()=>old.onend());expect(utterances).toHaveLength(2);
    act(()=>utterances[1].onerror({error:'network'}));expect(result.current.status).toBe('error');expect(result.current.errorMessage).toContain('Choose another');
  });

  it('preserves abbreviations, decimals, paragraph offsets and long text without truncation', () => {
    const text='Dr. Rao uses 3.5 mg, e.g. in a sample. Next, add 20 mL.\n\nRead CO₂ carefully.';
    const segmented=segmentDisplayedChunks({pageId:'p',chunks:[{id:'c',text}]});
    expect(segmented.sentences[0].text).toContain('Dr. Rao uses 3.5 mg, e.g. in a sample.');
    expect(segmented.sentences.map(item=>item.text).join('')).toBe(text);
    for(const sentence of segmented.sentences) expect(text.slice(sentence.startOffset,sentence.endOffset)).toBe(sentence.text);
    const list=[{id:'a',chunkId:'c',paragraphIndex:0,text:'🧪 Use 20 mL. '},{id:'b',chunkId:'c',paragraphIndex:0,text:'Next step.'},{id:'c',chunkId:'c',paragraphIndex:1,text:'New paragraph.'}];
    const batch=speechBatch(list,0,true);expect(batch.nextIndex).toBe(2);expect(boundarySentence(batch.ranges,batch.text.indexOf('Next'))).toBe(1);
    expect(boundarySentence(batch.ranges,-1)).toBeNull();expect(boundarySentence(batch.ranges,999)).toBeNull();
    const long=[{id:'long',text:'Measure 20 mL of water and observe it, '.repeat(90)}];let index=0,offset=0,spoken='';
    while(index<long.length){const part=speechBatch(long,index,true,600,offset);expect(part.text.length).toBeLessThanOrEqual(601);spoken+=part.text;index=part.nextIndex;offset=part.nextOffset;}
    expect(spoken).toBe(spokenSentence(long[0].text));
  });
});
