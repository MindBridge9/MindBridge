import { Play, RefreshCw, Square } from 'lucide-react';
import { Button, Field, Select } from '../common';
import { voiceLabel } from './speechText';

export function VoiceSettings({ preferences, voices = [], onChange, onPreview, onRefresh, onStopPreview, previewing, errorMessage }) {
  const english = voices.filter(voice=>/^en(?:[-_]|$)/i.test(voice.lang) || voice.voiceURI === preferences.voice_uri);
  const selected = voices.find(voice=>voice.voiceURI === preferences.voice_uri);
  return <div className="flex flex-col gap-4">
    <Field label="Preferred English accent" hint="Automatic selection prefers a device-local English voice in this accent, when available.">{props=><Select {...props} value={preferences.speech_locale || 'en-IN'} onChange={event=>onChange({speech_locale:event.target.value})}><option value="en-IN">Indian English</option><option value="en-GB">British English</option><option value="en-US">American English</option></Select>}</Field>
    <Field label="Read-aloud voice" hint={voices.length ? 'Voice quality depends on your device. Compare previews; names do not establish natural or neural quality.' : 'Voices may take a moment to load. Refresh, or install an English voice in your device’s speech settings.'}>{props=><Select {...props} value={preferences.voice_uri || ''} onChange={event=>onChange({voice_uri:event.target.value || null})}>
      <option value="">Automatic · local English only</option>
      {preferences.voice_uri && !selected ? <option value={preferences.voice_uri}>Saved voice unavailable — choose another</option> : null}
      {english.map(voice=><option key={voice.voiceURI} value={voice.voiceURI}>{voiceLabel(voice)}</option>)}
    </Select>}</Field>
    <label className="flex items-start gap-3 min-h-[44px] text-sm"><input className="w-5 h-5 mt-1 shrink-0 accent-[var(--mb-action)]" type="checkbox" checked={Boolean(preferences.allow_remote_speech)} onChange={event=>onChange({allow_remote_speech:event.target.checked})} /><span>Allow remote speech for a voice I select. Reading text may be sent to that voice’s speech service. Automatic selection stays local.</span></label>
    <div className="flex flex-wrap gap-2">
      <Button variant="secondary" size="sm" icon={previewing?Square:Play} disabled={!onPreview || (!previewing && !voices.length)} onClick={previewing?onStopPreview:onPreview}>{previewing?'Stop voice preview':'Preview voice'}</Button>
      <Button variant="quiet" size="sm" icon={RefreshCw} onClick={onRefresh}>Refresh voices</Button>
    </div>
    <p className="m-0 text-xs text-[var(--mb-text-muted)]">Preview uses a fixed sample about water and temperature, replacing any current playback. Device-local is the browser’s classification; MindBridge cannot audit an installed voice’s network behavior.</p>
    {errorMessage ? <p role="status" className="m-0 text-sm text-[var(--mb-error)]">{errorMessage}</p> : null}
    <Field label="Speech continuity" hint="Connected sentences are used only after the voice provides timing events. Sentence playback is the fallback.">{props=><Select {...props} value={preferences.speech_continuity || 'auto'} onChange={event=>onChange({speech_continuity:event.target.value})}><option value="auto">Automatic · connect sentences when supported</option><option value="sentence">One sentence at a time</option></Select>}</Field>
  </div>;
}
