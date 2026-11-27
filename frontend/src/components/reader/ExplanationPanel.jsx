import { Button, Dialog, LoadingStatus, Notice, SourceQuote } from '../common';

export function ExplanationPanel({
  open,
  explanation = null,
  concept = '',
  status = 'idle',
  error = null,
  onRetry = null,
  onClose,
}) {
  const title = explanation?.concept || concept || 'Concept explanation';

  return (
    <Dialog
      open={open}
      title={title}
      description="AI explanation grounded in the selected textbook passage."
      onClose={onClose}
      size="md"
      footer={
        <Button variant="primary" size="sm" onClick={onClose}>
          Close
        </Button>
      }
    >
      <div className="flex flex-col gap-4">
        {status === 'pending' ? (
          <LoadingStatus message={`Explaining “${title}” from the selected passage…`} />
        ) : null}

        {status === 'error' && error ? (
          <Notice
            tone="error"
            title={`Could not explain “${title}”`}
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

        {explanation ? (
          <>
            <div className="rounded-[6px] border border-[var(--mb-border-subtle)] mb-adaptive-paper bg-[var(--mb-surface)] p-4 flex flex-col gap-3">
              <p className="text-[12px] font-semibold uppercase tracking-[0.04em] text-[var(--mb-accent)] m-0">
                AI-generated explanation
              </p>
              <p className="mb-reading-prose m-0">{explanation.text}</p>
              {Array.isArray(explanation.important_terms) &&
              explanation.important_terms.length > 0 ? (
                <div className="flex flex-wrap gap-1.5 pt-2 border-t border-[var(--mb-border-subtle)]">
                  {explanation.important_terms.map((term) => (
                    <span
                      key={term}
                      className="px-2.5 py-0.5 rounded-[4px] bg-[var(--mb-support)] text-[var(--mb-text)] text-[13px] font-semibold"
                    >
                      {term}
                    </span>
                  ))}
                </div>
              ) : null}
            </div>

            {Array.isArray(explanation.source_refs) && explanation.source_refs.length > 0 ? (
              <div className="flex flex-col gap-2">
                {explanation.source_refs.map((ref, idx) => (
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
