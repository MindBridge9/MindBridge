import { useEffect, useRef } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  BookOpen,
  CheckCircle2,
  HelpCircle,
  MinusCircle,
} from 'lucide-react';
import { Button, Notice } from '../common';
import { SourceEvidence } from './SourceEvidence';

const STATUS_META = {
  demonstrated: {
    label: 'Demonstrated',
    toneClass: 'border-[#356B51] bg-[#E6F1EA]/70 text-[#20372D]',
    badgeClass: 'bg-[#356B51] text-white',
    Icon: CheckCircle2,
  },
  possible_misconception: {
    label: 'Possible misconception',
    toneClass: 'border-[#9A601C] bg-[#FDF3E1]/75 text-[#20372D]',
    badgeClass: 'bg-[#9A601C] text-white',
    Icon: AlertTriangle,
  },
  missing: {
    label: 'Not yet included',
    toneClass: 'border-[#A63D40] bg-[#FAECEC]/65 text-[#20372D]',
    badgeClass: 'bg-[#A63D40] text-white',
    Icon: AlertCircle,
  },
  unclear: {
    label: 'Needs clarification',
    toneClass: 'border-[#8B9B91] bg-[#EFECE0] text-[#20372D]',
    badgeClass: 'bg-[#3F584D] text-white',
    Icon: HelpCircle,
  },
  not_tested: {
    label: 'Not tested by this question',
    toneClass: 'border-[#C9D2C8] bg-white text-[#20372D]',
    badgeClass: 'bg-[#DCE9DF] text-[#20372D]',
    Icon: MinusCircle,
  },
};

export function FeedbackView({
  attempt,
  objective,
  isRetryStage = false,
  atAttemptCap = false,
  onRetry,
  onClarify,
  onReviewSource,
  onViewResults = null,
  onExit,
}) {
  const headingRef = useRef(null);

  useEffect(() => {
    headingRef.current?.focus();
  }, [attempt?.id]);

  if (!attempt || !objective) return null;

  const { feedback } = attempt;
  const criteriaById = new Map((objective.criteria || []).map((c) => [c.id, c]));
  const isUncertain = feedback.status === 'uncertain';

  const testedAssessments = (feedback.assessments || []).filter(
    (a) => a.status !== 'not_tested'
  );
  const notTestedAssessments = (feedback.assessments || []).filter(
    (a) => a.status === 'not_tested'
  );

  return (
    <section aria-labelledby="feedback-heading" className="flex flex-col gap-5">
      <div className="mb-reading-paper p-5 flex flex-col gap-3">
        <h2
          id="feedback-heading"
          ref={headingRef}
          tabIndex={-1}
          className="text-[22px] font-bold m-0 focus:outline-none"
        >
          {isUncertain ? 'Clarify your explanation' : 'Feedback on your explanation'}
        </h2>
        <p className="mb-reading-prose m-0">{feedback.message}</p>
        <div className="rounded-[6px] border border-[#C9D2C8] bg-[#F7F5ED] p-3 text-[#20372D]">
          <p className="text-[12px] font-semibold uppercase tracking-[0.04em] text-[#3F584D] m-0 mb-1">
            Your submitted answer
          </p>
          <p className="mb-reading-prose-inline m-0">{attempt.answer}</p>
        </div>
      </div>

      {isUncertain && feedback.uncertainty ? (
        <Notice
          tone="warning"
          title="Could not evaluate this answer reliably yet"
          actions={
            <>
              {!atAttemptCap ? (
                <Button variant="primary" size="sm" onClick={onClarify}>
                  Edit and resubmit answer
                </Button>
              ) : null}
              <Button variant="secondary" size="sm" icon={BookOpen} onClick={onReviewSource}>
                Review textbook passage
              </Button>
              <Button variant="quiet" size="sm" onClick={onExit}>
                Return to reader
              </Button>
            </>
          }
        >
          <p className="m-0">{feedback.uncertainty.message}</p>
          {isRetryStage && onViewResults ? (
            <p className="m-0 mt-1 text-[13px] text-[#3F584D]">
              Your earlier evaluated attempt remains preserved.
            </p>
          ) : null}
        </Notice>
      ) : null}

      {/* Tested rubric criteria */}
      <div className="flex flex-col gap-3">
        <h3 className="text-[16px] font-bold m-0">Concept breakdown</h3>
        {testedAssessments.map((assessment) => {
          const meta = STATUS_META[assessment.status] || STATUS_META.unclear;
          const Icon = meta.Icon;
          const criterion = criteriaById.get(assessment.criterion_id);
          return (
            <div
              key={assessment.criterion_id}
              className={`rounded-[8px] border p-4 flex flex-col gap-2.5 ${meta.toneClass}`}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-bold text-[15px]">
                  {criterion?.description || assessment.criterion_id}
                </span>
                <span
                  className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-[4px] text-[12px] font-semibold ${meta.badgeClass}`}
                >
                  <Icon className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>{meta.label}</span>
                </span>
              </div>
              <p className="mb-reading-prose-inline text-[15px] m-0">
                {assessment.explanation}
              </p>
              {assessment.student_quote ? (
                <p className="text-[13px] text-[#3F584D] m-0">
                  From your answer: “{assessment.student_quote}”
                </p>
              ) : null}
              <SourceEvidence
                refs={assessment.source_refs}
                label="Rubric textbook evidence"
              />
            </div>
          );
        })}
      </div>

      {/* Untested criteria shown separately — never marked as missing */}
      {notTestedAssessments.length > 0 ? (
        <div className="flex flex-col gap-2">
          <h3 className="text-[15px] font-bold m-0">
            Concepts not tested by this question
          </h3>
          <p className="mb-theme-muted text-[13px] text-[#3F584D] m-0">
            These ideas were outside the current question and are not counted as missing.
          </p>
          {notTestedAssessments.map((assessment) => {
            const criterion = criteriaById.get(assessment.criterion_id);
            return (
              <div
                key={assessment.criterion_id}
                className="rounded-[8px] border border-[#C9D2C8] bg-white p-3.5 text-[#20372D] flex flex-col gap-1"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-semibold text-[14px]">
                    {criterion?.description || assessment.criterion_id}
                  </span>
                  <span className="px-2 py-0.5 rounded-[4px] bg-[#DCE9DF] text-[#20372D] text-[12px] font-semibold">
                    Not tested
                  </span>
                </div>
                <p className="text-[13px] text-[#3F584D] m-0">{assessment.explanation}</p>
              </div>
            );
          })}
        </div>
      ) : null}

      {/* Targeted repair explanation & hint (only on evaluated responses) */}
      {!isUncertain && feedback.targeted_explanation ? (
        <div className="mb-reading-paper p-5 flex flex-col gap-3 border-[#204C43]">
          <h3 className="text-[16px] font-bold m-0">
            Source-grounded explanation
          </h3>
          <p className="mb-reading-prose m-0">{feedback.targeted_explanation.text}</p>
          <SourceEvidence
            refs={feedback.targeted_explanation.source_refs}
            label="Supporting passage"
          />
          {feedback.hint ? (
            <div className="rounded-[6px] border border-[#8B9B91] bg-[#DCE9DF]/50 p-3 text-[#20372D] text-[14px]">
              <strong>Hint:</strong> {feedback.hint}
            </div>
          ) : null}
        </div>
      ) : null}

      {/* Next step actions */}
      {!isUncertain ? (
        <div className="flex flex-wrap items-center gap-3 pt-1">
          {feedback.follow_up_question && !atAttemptCap ? (
            <Button variant="primary" size="lg" icon={ArrowRight} onClick={onRetry}>
              Try follow-up question
            </Button>
          ) : null}
          {isRetryStage && onViewResults ? (
            <Button variant="primary" size="lg" onClick={onViewResults}>
              View attempt comparison
            </Button>
          ) : null}
          <Button variant="secondary" icon={BookOpen} onClick={onReviewSource}>
            Review textbook passage
          </Button>
          <Button variant="quiet" onClick={onExit}>
            Return to reader
          </Button>
        </div>
      ) : null}
    </section>
  );
}
