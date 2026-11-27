import { AlertCircle, AlertTriangle, CheckCircle2, Info } from 'lucide-react';

const TONE_MAP = {
  info: {
    container: 'bg-[var(--mb-support)]/65 border-[var(--mb-border)] text-[var(--mb-text)]',
    iconColor: 'text-[var(--mb-accent)]',
    Icon: Info,
    role: 'status',
  },
  success: {
    container: 'bg-[var(--mb-success-bg)] border-[var(--mb-success)] text-[var(--mb-text)]',
    iconColor: 'text-[var(--mb-success)]',
    Icon: CheckCircle2,
    role: 'status',
  },
  warning: {
    container: 'bg-[var(--mb-warning-bg)] border-[var(--mb-warning)] text-[var(--mb-text)]',
    iconColor: 'text-[var(--mb-warning)]',
    Icon: AlertTriangle,
    role: 'status',
  },
  error: {
    container: 'bg-[var(--mb-error-bg)] border-[var(--mb-error)] text-[var(--mb-text)]',
    iconColor: 'text-[var(--mb-error)]',
    Icon: AlertCircle,
    role: 'alert',
  },
};

export function Notice({
  tone = 'info',
  title = null,
  children,
  actions = null,
  className = '',
  role: explicitRole,
}) {
  const cfg = TONE_MAP[tone] || TONE_MAP.info;
  const Icon = cfg.Icon;

  return (
    <div
      role={explicitRole ?? cfg.role}
      data-notice-tone={tone}
      className={`mb-notice rounded-[6px] border p-4 flex flex-col gap-2 ${cfg.container} ${className}`}
    >
      <div className="flex items-start gap-3">
        <Icon className={`w-5 h-5 shrink-0 mt-0.5 ${cfg.iconColor}`} aria-hidden="true" />
        <div className="flex-1 min-w-0">
          {title ? <p className="font-semibold text-[15px] m-0 mb-1">{title}</p> : null}
          <div className="text-[14px] leading-relaxed">{children}</div>
        </div>
      </div>
      {actions ? <div className="flex flex-wrap gap-2 pl-8">{actions}</div> : null}
    </div>
  );
}
