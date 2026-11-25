import { AlertCircle, AlertTriangle, CheckCircle2, Info } from 'lucide-react';

const TONE_MAP = {
  info: {
    container: 'bg-[#DCE9DF]/65 border-[#8B9B91] text-[#20372D]',
    iconColor: 'text-[#204C43]',
    Icon: Info,
    role: 'status',
  },
  success: {
    container: 'bg-[#E6F1EA] border-[#356B51] text-[#20372D]',
    iconColor: 'text-[#356B51]',
    Icon: CheckCircle2,
    role: 'status',
  },
  warning: {
    container: 'bg-[#FDF3E1] border-[#9A601C] text-[#20372D]',
    iconColor: 'text-[#9A601C]',
    Icon: AlertTriangle,
    role: 'status',
  },
  error: {
    container: 'bg-[#FAECEC] border-[#A63D40] text-[#20372D]',
    iconColor: 'text-[#A63D40]',
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
      className={`rounded-[6px] border p-4 flex flex-col gap-2 ${cfg.container} ${className}`}
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
