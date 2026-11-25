import { BookOpen, CheckCircle2, HelpCircle, MinusCircle, RotateCcw } from 'lucide-react';
import { Button, Notice } from '../common';

const HELP_LABELS = {
  hint: 'Hint',
  source: 'Textbook passage',
  explanation: 'Prior explanation',
  previous_feedback: 'Previous feedback',
};

export function LearningResults({
  session,
  onReturnToOriginal,
  onStartNewSession = null,
}) {
  if (!session || !session.retry_result || !session.plan) return null;

  const { plan, attempts, retry_result } = session;
  const criteriaById = new Map((plan.objective?.criteria || []).map((c) => [c.id, c]));

  const initialAttempt =
    attempts.find((a) => a.id === retry_result.previous_attempt_id) || attempts[0];
  const retryAttempt =
    attempts.find((a) => a.id === retry_result.current_attempt_id) ||
    attempts[attempts.length - 1];

  const groups = [
    {
      title: 'Newly demonstrated on retry',
      ids: retry_result.newly_demonstrated_ids || [],
      badge: 'Newly demonstrated',
      Icon: CheckCircle2,
      containerClass: 'border-[#356B51] bg-[#E6F1EA]/75',
    },
    {
      title: 'Demonstrated in both attempts',
      ids: retry_result.retained_demonstrated_ids || [],
      badge: 'Retained',
      Icon: CheckCircle2,
      containerClass: 'border-[#356B51] bg-white',
    },
    {
      title: 'Still needs practice',
      ids: retry_result.still_needs_practice_ids || [],
      badge: 'Needs practice',
      Icon: HelpCircle,
      containerClass: 'border-[#9A601C] bg-[#FDF3E1]/65',
    },
    {
      title: 'Not retested by the retry question',
      ids: retry_result.not_retested_ids || [],
      badge: 'Not retested',
      Icon: MinusCircle,
      containerClass: 'border-[#C9D2C8] bg-[#EFECE0]/65',
    },
  ];

  return (
    <section aria-labelledby="results-heading" className="flex flex-col gap-6">
      <div className="mb-reading-paper p-5 sm:p-6 flex flex-col gap-3">
        <h2 id="results-heading" className="text-[24px] font-bold m-0">
          Understanding comparison
        </h2>
        <p className="text-[15px] opacity-90 m-0">
          Concept: <strong>{plan.target_concept}</strong>
        </p>

        {retry_result.independent_in_app ? (
          <Notice tone="success" title="Completed without in-app help during retry">
            <p className="m-0">
              You answered the follow-up question in MindBridge without opening hints, the textbook
              passage, or prior feedback during the retry stage.
            </p>
          </Notice>
        ) : (
          <Notice tone="info" title="Completed with in-app conceptual help">
            <p className="m-0">
              Help opened during the retry stage:{' '}
              {(retryAttempt?.assistance?.kinds || [])
                .map((k) => HELP_LABELS[k] || k)
                .join(', ') || 'Recorded assistance'}
              . You can try another fresh question anytime if you want extra practice.
            </p>
          </Notice>
        )}
      </div>

      {/* Actual Initial vs Retry Answer Comparison */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {initialAttempt ? (
          <div className="mb-reading-paper p-4 flex flex-col gap-2">
            <span className="mb-theme-muted text-[12px] font-semibold uppercase tracking-[0.04em] text-[#3F584D]">
              Initial attempt
            </span>
            <p className="text-[14px] font-semibold m-0">{initialAttempt.question?.text}</p>
            <p className="mb-reading-prose-inline m-0 pt-2 border-t border-[#C9D2C8]">
              {initialAttempt.answer}
            </p>
          </div>
        ) : null}

        {retryAttempt ? (
          <div className="mb-reading-paper p-4 flex flex-col gap-2 border-[#204C43]">
            <span className="text-[12px] font-semibold uppercase tracking-[0.04em] text-[#204C43]">
              Follow-up retry attempt
            </span>
            <p className="text-[14px] font-semibold m-0">{retryAttempt.question?.text}</p>
            <p className="mb-reading-prose-inline m-0 pt-2 border-t border-[#C9D2C8]">
              {retryAttempt.answer}
            </p>
          </div>
        ) : null}
      </div>

      {/* Concept-level outcomes (no numeric scores or fabricated mastery percentages) */}
      <div className="flex flex-col gap-4">
        <h3 className="text-[18px] font-bold m-0">Concept-by-concept outcome</h3>
        {groups.map((group) => {
          if (group.ids.length === 0) return null;
          const Icon = group.Icon;
          return (
            <div key={group.title} className="flex flex-col gap-2">
              <h4 className="text-[14px] font-bold m-0">{group.title}</h4>
              {group.ids.map((criterionId) => {
                const criterion = criteriaById.get(criterionId);
                return (
                  <div
                    key={criterionId}
                    className={`rounded-[8px] border p-3.5 text-[#20372D] flex flex-wrap items-center justify-between gap-2 ${group.containerClass}`}
                  >
                    <span className="font-medium text-[15px]">
                      {criterion?.description || criterionId}
                    </span>
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-[4px] bg-[#EFECE0] text-[#20372D] text-[12px] font-semibold">
                      <Icon className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>{group.badge}</span>
                    </span>
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-3 pt-2">
        <Button variant="primary" size="lg" icon={BookOpen} onClick={onReturnToOriginal}>
          Return to Original reading
        </Button>
        {onStartNewSession ? (
          <Button variant="secondary" icon={RotateCcw} onClick={onStartNewSession}>
            Practice again
          </Button>
        ) : null}
      </div>
    </section>
  );
}
