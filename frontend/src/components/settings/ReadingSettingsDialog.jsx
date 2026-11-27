import { RotateCcw } from 'lucide-react';
import { Button, Dialog, Field, Notice, RangeInput, SegmentedControl, Select } from '../common';

const FONT_OPTIONS = [
  { value: 'lexend', label: 'Lexend' },
  { value: 'manrope', label: 'Manrope' },
  { value: 'system', label: 'System' },
];

const THEME_OPTIONS = [
  { value: 'cream', label: 'Light' },
  { value: 'paper', label: 'Paper' },
  { value: 'dark', label: 'Dark' },
];

export function ReadingSettingsDialog({
  open,
  preferences,
  voices = [],
  storageWarning = null,
  onChange,
  onReset,
  onClose,
}) {
  if (!preferences) return null;

  return (
    <Dialog
      open={open}
      title="Reading settings"
      description="Changes apply immediately to textbook reading, source evidence, questions, and answer boxes."
      onClose={onClose}
      size="md"
      className="mb-reading-settings"
      footer={
        <>
          <Button variant="secondary" size="sm" icon={RotateCcw} onClick={onReset}>
            Reset defaults
          </Button>
          <Button variant="primary" size="sm" onClick={onClose}>
            Done
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        {storageWarning ? <Notice tone="warning">{storageWarning}</Notice> : null}

        {/* Live preview styled strictly by CSS variables */}
        <div
          data-reading-theme={preferences.theme}
          className="mb-reading-surface mb-reading-paper p-4"
        >
          <p className="mb-theme-muted text-[12px] font-semibold uppercase tracking-[0.04em] m-0 mb-1.5">
            Live reading preview
          </p>
          <p className="mb-reading-prose m-0">
            Green plants use <span className="mb-sentence-active">light energy from sunlight</span>{' '}
            to make glucose from carbon dioxide and water.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="flex flex-col gap-1.5">
            <span className="text-[14px] font-semibold text-[var(--mb-text)]">Reading font</span>
            <SegmentedControl
              label="Reading font"
              fullWidth
              value={preferences.font_family === 'opendyslexic' ? 'lexend' : preferences.font_family}
              options={FONT_OPTIONS}
              onChange={(font_family) => onChange({ font_family })}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <span className="text-[14px] font-semibold text-[var(--mb-text)]">Reading theme</span>
            <SegmentedControl
              label="Reading theme"
              fullWidth
              value={preferences.theme}
              options={THEME_OPTIONS}
              onChange={(theme) => onChange({ theme })}
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-5 gap-y-3 pt-1">
          <RangeInput
            label="Text size"
            min={16}
            max={32}
            step={1}
            value={preferences.font_size_px}
            valueLabel={`${preferences.font_size_px} px`}
            onChange={(font_size_px) => onChange({ font_size_px })}
          />
          <RangeInput
            label="Line spacing"
            min={1.4}
            max={2.4}
            step={0.1}
            value={preferences.line_height}
            valueLabel={`${preferences.line_height.toFixed(1)}×`}
            onChange={(line_height) => onChange({ line_height })}
          />
          <RangeInput
            label="Letter spacing"
            min={0}
            max={0.12}
            step={0.01}
            value={preferences.letter_spacing_em}
            valueLabel={`${preferences.letter_spacing_em.toFixed(2)} em`}
            onChange={(letter_spacing_em) => onChange({ letter_spacing_em })}
          />
          <RangeInput
            label="Word spacing"
            min={0}
            max={0.3}
            step={0.02}
            value={preferences.word_spacing_em}
            valueLabel={`${preferences.word_spacing_em.toFixed(2)} em`}
            onChange={(word_spacing_em) => onChange({ word_spacing_em })}
          />
          <RangeInput
            label="Reading width"
            min={45}
            max={80}
            step={5}
            value={preferences.reading_width_ch}
            valueLabel={`${preferences.reading_width_ch} ch`}
            onChange={(reading_width_ch) => onChange({ reading_width_ch })}
          />
          <RangeInput
            label="Speech rate"
            min={0.6}
            max={1.4}
            step={0.1}
            value={preferences.speech_rate}
            valueLabel={`${preferences.speech_rate.toFixed(1)}×`}
            onChange={(speech_rate) => onChange({ speech_rate })}
          />
        </div>

        <Field
          label="Read-aloud voice"
          hint={
            voices.length === 0
              ? 'No browser speech voices detected yet. Your device default will be used if available.'
              : 'Uses voices installed in your browser.'
          }
        >
          {(fieldProps) => (
            <Select
              {...fieldProps}
              value={preferences.voice_uri || ''}
              onChange={(event) =>
                onChange({ voice_uri: event.target.value ? event.target.value : null })
              }
            >
              <option value="">Browser default voice</option>
              {voices.map((voice) => (
                <option key={voice.voiceURI} value={voice.voiceURI}>
                  {voice.name} ({voice.lang})
                </option>
              ))}
            </Select>
          )}
        </Field>

        <label className="flex items-center gap-3 min-h-[44px] cursor-pointer text-[14px] font-medium">
          <input type="checkbox" className="w-5 h-5 accent-[var(--mb-action)]" checked={Boolean(preferences.reduce_motion)} onChange={event => onChange({reduce_motion:event.target.checked})} />
          <span>Reduce interface motion</span>
        </label>
        <div className="flex flex-col gap-2 pt-2 border-t border-[var(--mb-border-subtle)]">
          <label className="flex items-center gap-3 min-h-[44px] cursor-pointer text-[14px] font-medium">
            <input
              type="checkbox"
              className="w-5 h-5 accent-[var(--mb-action)]"
              checked={preferences.highlight_sentence}
              onChange={(event) => onChange({ highlight_sentence: event.target.checked })}
            />
            <span>Highlight the active sentence while reading aloud</span>
          </label>
          <label className="flex items-center gap-3 min-h-[44px] cursor-pointer text-[14px] font-medium">
            <input
              type="checkbox"
              className="w-5 h-5 accent-[var(--mb-action)]"
              checked={preferences.auto_scroll}
              onChange={(event) => onChange({ auto_scroll: event.target.checked })}
            />
            <span>Auto-scroll gently to keep the active sentence in view</span>
          </label>
        </div>
      </div>
    </Dialog>
  );
}
