import { Pause, Play, SkipBack, SkipForward, SlidersHorizontal, Square, Volume2 } from 'lucide-react';
import { Button, IconButton } from '../common';

export function SpeechControls({
  status = 'idle',
  canPrevious = false,
  canNext = false,
  activeIndex = -1,
  totalSentences = 0,
  errorMessage = null,
  playbackNote = null,
  previewing = false,
  onPlay,
  onPause,
  onResume,
  onStop,
  onPrevious,
  onNext,
  onOpenSettings = null,
}) {
  if (status === 'unsupported') {
    return (
      <aside
        aria-label="Read aloud controls"
        className="mb-chrome-dock sticky bottom-0 z-20 border-t px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-[var(--mb-shadow-sticky)]"
      >
        <div className="mb-shell-container flex flex-wrap items-center justify-between gap-2 text-[13px]">
          <span className="inline-flex items-center gap-2 font-medium">
            <Volume2 className="w-4 h-4 shrink-0" aria-hidden="true" />
            Browser read-aloud is not supported on this device. Visual reading remains available.
          </span>
          {onOpenSettings ? (
            <Button variant="secondary" size="sm" icon={SlidersHorizontal} onClick={onOpenSettings}>
              Settings
            </Button>
          ) : null}
        </div>
      </aside>
    );
  }

  const isPlaying = status === 'playing';
  const isPaused = status === 'paused';
  const isActive = isPlaying || isPaused;

  return (
    <aside
      aria-label="Read aloud controls"
      className="mb-chrome-dock sticky bottom-0 z-20 border-t px-2 py-2.5 pb-[max(0.625rem,env(safe-area-inset-bottom))] shadow-[var(--mb-shadow-sticky)]"
    >
      <div className="mb-shell-container flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <IconButton
            icon={SkipBack}
            label="Previous sentence"
            disabled={!canPrevious}
            onClick={onPrevious}
          />
          {isPlaying ? (
            <Button variant="primary" size="sm" icon={Pause} onClick={onPause}>
              Pause
            </Button>
          ) : isPaused ? (
            <Button variant="primary" size="sm" icon={Play} onClick={onResume}>
              Resume
            </Button>
          ) : (
            <Button
              variant="primary"
              size="sm"
              icon={Play}
              disabled={totalSentences === 0}
              onClick={() => onPlay?.(0)}
            >
              Read aloud
            </Button>
          )}
          <IconButton
            icon={Square}
            label="Stop reading aloud"
            disabled={!isActive}
            onClick={onStop}
          />
          <IconButton
            icon={SkipForward}
            label="Next sentence"
            disabled={!canNext}
            onClick={onNext}
          />
        </div>

        <div className="flex items-center gap-3">
          {errorMessage ? (
            <span role="status" className="text-[13px] font-medium text-[var(--mb-error)]">
              {errorMessage}
            </span>
          ) : (
            <span role="status" title={playbackNote || undefined} className="mb-tabular mb-theme-muted text-[13px] font-medium">
              {previewing ? 'Voice preview' : isActive && activeIndex >= 0
                ? `Sentence ${activeIndex + 1} of ${totalSentences}`
                : totalSentences > 0
                  ? `${totalSentences} sentences ready`
                  : 'No text to read'}
            </span>
          )}
          {onOpenSettings ? (
            <Button
              variant="secondary"
              size="sm"
              icon={SlidersHorizontal}
              onClick={onOpenSettings}

            >
              Settings
            </Button>
          ) : null}
        </div>
        {playbackNote ? <span className="text-xs text-[var(--mb-text-muted)]">{playbackNote}</span> : null}
      </div>
    </aside>
  );
}
