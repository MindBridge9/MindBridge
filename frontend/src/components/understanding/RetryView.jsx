import { useState } from 'react';
import { BookOpen, Eye, HelpCircle, MessageSquare } from 'lucide-react';
import { Button, Notice, SourceQuote } from '../common';
import { UnderstandingForm } from './UnderstandingForm';

const HELP_LABELS = {
  hint: 'Hint',
  source: 'Textbook passage',
  explanation: 'Prior explanation',
  previous_feedback: 'Previous feedback',
};

export function RetryView({
  question,
  draft,
  assistance,
  previousAttempt,
  sourceChunks = [],
  pending = false,
  canSubmit = true,
  error = null,
  validationError = null,
  canPronounce = false,
  onPronounceQuestion = null,
  onDraftChange,
  onRequestHelp,
  onSubmit,
  onCancelSubmit,
  onExit,
}) {
  const [openHelp, setOpenHelp] = useState({
    hint: false,
    source: false,
    explanation: false,
    previous_feedback: false,
  });

  if (!question) return null;

  const prevFeedback = previousAttempt?.feedback;

  const toggleHelp = (kind) => {
    const nextOpen = !openHelp[kind];
    setOpenHelp((prev) => ({ ...prev, [kind]: nextOpen }));
    if (nextOpen) {
      onRequestHelp?.(kind);
    }
  };

  return (
    <div className="flex flex-col gap-5">
      <Notice tone="info" title="Follow-up question (Retry stage)">
        <p className="m-0">
          Try answering this new question on your own first. Prior hints, feedback, and the source
          passage start collapsed below—opening them is always allowed and is recorded transparently
          as in-app assistance. Reading settings and read-aloud do not count as help.
        </p>
      </Notice>

      {assistance?.used ? (
        <div className="rounded-[6px] border border-[var(--mb-border)] bg-[var(--mb-support)]/65 px-3.5 py-2 text-[13px] text-[var(--mb-text)]">
          <strong>In-app help opened during this retry:</strong>{' '}
          {assistance.kinds.map((k) => HELP_LABELS[k] || k).join(', ')}
        </div>
      ) : null}

      <UnderstandingForm
        question={question}
        draft={draft}
        pending={pending}
        canSubmit={canSubmit}
        error={error}
        validationError={validationError}
        canPronounce={canPronounce}
        onPronounceQuestion={onPronounceQuestion}
        onDraftChange={onDraftChange}
        onSubmit={onSubmit}
        onCancelSubmit={onCancelSubmit}
        submitLabel="Submit retry answer"
      />

      {/* Optional collapsed conceptual help */}
      <section
        aria-label="Optional learning help"
        className="rounded-[12px] border border-[var(--mb-border-subtle)] mb-adaptive-paper bg-[var(--mb-surface)] p-4 text-[var(--mb-text)] flex flex-col gap-3"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-[15px] font-bold m-0">Optional help (recorded if opened)</h3>
          <Button variant="quiet" size="sm" onClick={onExit}>
            Exit to reader
          </Button>
        </div>

        <div className="flex flex-wrap gap-2">
          {prevFeedback?.hint ? (
            <Button
              variant="secondary"
              size="sm"
              icon={HelpCircle}
              aria-expanded={openHelp.hint}
              onClick={() => toggleHelp('hint')}
            >
              {openHelp.hint ? 'Hide hint' : 'Show hint'}
            </Button>
          ) : null}
          {prevFeedback?.targeted_explanation ? (
            <Button
              variant="secondary"
              size="sm"
              icon={Eye}
              aria-expanded={openHelp.explanation}
              onClick={() => toggleHelp('explanation')}
            >
              {openHelp.explanation ? 'Hide explanation' : 'Show prior explanation'}
            </Button>
          ) : null}
          <Button
            variant="secondary"
            size="sm"
            icon={BookOpen}
            aria-expanded={openHelp.source}
            onClick={() => toggleHelp('source')}
          >
            {openHelp.source ? 'Hide textbook passage' : 'Review textbook passage'}
          </Button>
          {previousAttempt ? (
            <Button
              variant="secondary"
              size="sm"
              icon={MessageSquare}
              aria-expanded={openHelp.previous_feedback}
              onClick={() => toggleHelp('previous_feedback')}
            >
              {openHelp.previous_feedback ? 'Hide previous feedback' : 'Show previous feedback'}
            </Button>
          ) : null}
        </div>

        {openHelp.hint && prevFeedback?.hint ? (
          <div className="rounded-[6px] border border-[var(--mb-border)] bg-[var(--mb-support)]/50 p-3 text-[14px]">
            <strong>Hint:</strong> {prevFeedback.hint}
          </div>
        ) : null}

        {openHelp.explanation && prevFeedback?.targeted_explanation ? (
          <div className="rounded-[6px] border border-[var(--mb-border)] mb-adaptive-paper bg-[var(--mb-bg)] p-3 text-[14px]">
            <p className="font-semibold m-0 mb-1">Prior explanation</p>
            <p className="mb-reading-prose-inline m-0">{prevFeedback.targeted_explanation.text}</p>
          </div>
        ) : null}

        {openHelp.source && sourceChunks.length > 0 ? (
          <div className="flex flex-col gap-2">
            {sourceChunks.map((chunk) => (
              <SourceQuote
                key={chunk.id}
                chunkId={chunk.id}
                quote={chunk.text}
                label="Original textbook passage"
              />
            ))}
          </div>
        ) : null}

        {openHelp.previous_feedback && previousAttempt ? (
          <div className="rounded-[6px] border border-[var(--mb-border-subtle)] mb-adaptive-paper bg-[var(--mb-bg)] p-3 text-[14px]">
            <p className="font-semibold m-0 mb-1">
              Previous question: {previousAttempt.question?.text}
            </p>
            <p className="m-0 text-[var(--mb-text-muted)]">Your answer: “{previousAttempt.answer}”</p>
            <p className="m-0 mt-1">{prevFeedback?.message}</p>
          </div>
        ) : null}
      </section>
    </div>
  );
}
