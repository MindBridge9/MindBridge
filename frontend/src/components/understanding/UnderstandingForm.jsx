import { ShieldAlert, Volume2 } from 'lucide-react';
import { Button, Field, LoadingStatus, Notice, Textarea } from '../common';
import { MAX_ANSWER_CHARS } from '../../hooks/useLearningSession';

export function UnderstandingForm({
  question,
  draft = '',
  pending = false,
  error = null,
  validationError = null,
  canPronounce = false,
  onPronounceQuestion = null,
  onDraftChange,
  onSubmit,
  onCancelSubmit = null,
  submitLabel = 'Check understanding',
}) {
  if (!question) return null;

  const handleSubmit = (event) => {
    event.preventDefault();
    onSubmit?.();
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5">
      <div className="mb-reading-paper p-5 flex flex-col gap-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <p className="mb-theme-muted text-[12px] font-semibold uppercase tracking-[0.04em] text-[#3F584D] m-0">
            Comprehension question
          </p>
          {canPronounce && onPronounceQuestion ? (
            <Button
              variant="secondary"
              size="sm"
              icon={Volume2}
              onClick={() => onPronounceQuestion(question.text)}
            >
              Read question aloud
            </Button>
          ) : null}
        </div>
        <p className="mb-reading-prose font-semibold m-0">{question.text}</p>
        <p className="mb-theme-muted text-[13px] text-[#3F584D] m-0">
          Explain the idea in your own words. Spelling and grammar do not affect feedback.
        </p>
      </div>

      <Field
        label="Your explanation"
        required
        error={validationError}
        hint={`${draft.length} / ${MAX_ANSWER_CHARS} characters`}
      >
        {(fieldProps) => (
          <Textarea
            {...fieldProps}
            value={draft}
            disabled={pending}
            maxLength={MAX_ANSWER_CHARS}
            rows={5}
            placeholder="Write what you understand from the textbook passage…"
            onChange={(event) => onDraftChange?.(event.target.value)}
            className="mb-reading-input"
          />
        )}
      </Field>

      {pending ? (
        <LoadingStatus
          message="Checking your explanation against the textbook rubric…"
          detail="Evaluating meaning and gathering source references."
          onCancel={onCancelSubmit}
          cancelLabel="Cancel waiting"
        />
      ) : null}

      {error ? (
        <Notice
          tone="error"
          title="Could not evaluate your answer"
          actions={
            error.retryable ? (
              <Button type="submit" variant="primary" size="sm">
                Try again
              </Button>
            ) : null
          }
        >
          <p className="m-0">{error.message}</p>
          <p className="m-0 mt-1 text-[13px] text-[#3F584D]">
            Your draft answer is safely preserved above.
          </p>
          {error.retryAfterSeconds ? (
            <p className="m-0 mt-1 text-[13px] font-semibold">
              Wait {error.retryAfterSeconds} seconds before retrying.
            </p>
          ) : null}
        </Notice>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="mb-theme-muted flex items-start gap-2 text-[12px] text-[#3F584D] m-0 max-w-[54ch]">
          <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5 text-[#204C43]" aria-hidden="true" />
          <span>
            Answers are sent to the server’s configured external AI provider (Groq or Google Gemini)
            for formative feedback.
          </span>
        </p>
        <Button type="submit" variant="primary" size="lg" loading={pending}>
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}
