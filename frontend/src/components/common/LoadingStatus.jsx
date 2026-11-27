import { Loader2 } from 'lucide-react';
import { Button } from './Button';

export function LoadingStatus({
  message,
  detail = null,
  onCancel = null,
  cancelLabel = 'Cancel',
  className = '',
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={`rounded-[6px] border border-[var(--mb-border)] bg-[var(--mb-support)]/50 p-4 flex flex-wrap items-center justify-between gap-3 text-[var(--mb-text)] ${className}`}
    >
      <div className="flex items-start gap-3">
        <Loader2 className="w-5 h-5 animate-spin text-[var(--mb-accent)] shrink-0 mt-0.5" aria-hidden="true" />
        <div>
          <p className="font-semibold text-[15px] m-0">{message}</p>
          {detail ? <p className="text-[13px] text-[var(--mb-text-muted)] m-0 mt-0.5">{detail}</p> : null}
        </div>
      </div>
      {onCancel ? (
        <Button variant="secondary" size="sm" onClick={onCancel}>
          {cancelLabel}
        </Button>
      ) : null}
    </div>
  );
}
