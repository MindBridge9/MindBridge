import { Volume2 } from 'lucide-react';
import { Button, Dialog, LoadingStatus, Notice, SourceQuote } from '../common';

export function GlossaryPanel({
  open,
  entry = null,
  phrase = '',
  sentence = '',
  status = 'idle',
  error = null,
  canPronounce = false,
  onPronounce = null,
  onRetry = null,
  onClose,
}) {
  const headingPhrase = entry?.phrase || phrase || 'Word definition';

  return (
    <Dialog
      open={open}
      title={headingPhrase}
      description="Vocabulary meaning in context."
      onClose={onClose}
      size="md"
      footer={
        <>
          {canPronounce && headingPhrase ? (
            <Button
              variant="secondary"
              size="sm"
              icon={Volume2}
              onClick={() => onPronounce?.(headingPhrase)}
            >
              Pronounce
            </Button>
          ) : null}
          <Button variant="primary" size="sm" onClick={onClose}>
            Close
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {status === 'pending' ? (
          <LoadingStatus message={`Looking up “${headingPhrase}” in this passage…`} />
        ) : null}

        {status === 'error' && error ? (
          <Notice
            tone="error"
            title={`Could not look up “${headingPhrase}”`}
            actions={
              error.retryable && onRetry ? (
                <Button variant="primary" size="sm" onClick={onRetry}>
                  Try again
                </Button>
              ) : null
            }
          >
            <p className="m-0">{error.message}</p>
            {error.retryAfterSeconds ? (
              <p className="m-0 mt-1 text-[13px] font-semibold">
                Wait {error.retryAfterSeconds} seconds before trying again.
              </p>
            ) : null}
          </Notice>
        ) : null}

        {sentence ? <SourceQuote quote={sentence} label="Original surrounding sentence" /> : null}
        {entry ? (
          <>
            <div className="rounded-[6px] border border-[var(--mb-border-subtle)] mb-adaptive-paper bg-[var(--mb-surface)] p-4 flex flex-col gap-3">
              <div>
                <p className="text-[12px] font-semibold uppercase tracking-[0.04em] text-[var(--mb-text-muted)] m-0 mb-1">
                  General meaning (AI-generated)
                </p>
                <p className="mb-reading-prose-inline m-0">{entry.definition}</p>
              </div>
              <div className="border-t border-[var(--mb-border-subtle)] pt-3">
                <p className="text-[12px] font-semibold uppercase tracking-[0.04em] text-[var(--mb-accent)] m-0 mb-1">
                  In this textbook passage
                </p>
                <p className="mb-reading-prose-inline m-0">{entry.contextual_meaning}</p>
              </div>
              {entry.example ? (
                <div className="border-t border-[var(--mb-border-subtle)] pt-3">
                  <p className="text-[12px] font-semibold uppercase tracking-[0.04em] text-[var(--mb-text-muted)] m-0 mb-1">
                    Example
                  </p>
                  <p className="text-[15px] text-[var(--mb-text-muted)] m-0">{entry.example}</p>
                </div>
              ) : null}
            </div>

            {Array.isArray(entry.source_refs) && entry.source_refs.length > 0 ? (
              <div className="flex flex-col gap-2">
                {entry.source_refs.map((ref, idx) => (
                  <SourceQuote
                    key={`${ref.chunk_id}-${idx}`}
                    chunkId={ref.chunk_id}
                    quote={ref.quote}
                    label="Textbook evidence"
                  />
                ))}
              </div>
            ) : null}
          </>
        ) : null}
      </div>
    </Dialog>
  );
}
