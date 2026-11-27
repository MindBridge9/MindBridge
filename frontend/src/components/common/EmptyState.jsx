export function EmptyState({
  icon: Icon = null,
  title,
  description,
  actions = null,
  className = '',
}) {
  return (
    <div
      className={`rounded-[12px] border border-[var(--mb-border-subtle)] bg-[var(--mb-surface)] p-6 text-center flex flex-col items-center gap-3 ${className}`}
    >
      {Icon ? (
        <div className="w-11 h-11 rounded-[6px] bg-[var(--mb-support)] text-[var(--mb-accent)] flex items-center justify-center">
          <Icon className="w-5 h-5" aria-hidden="true" />
        </div>
      ) : null}
      <h2 className="text-[18px] font-bold m-0 text-[var(--mb-text)]">{title}</h2>
      {description ? (
        <p className="text-[15px] text-[var(--mb-text-muted)] max-w-[46ch] m-0">{description}</p>
      ) : null}
      {actions ? <div className="flex flex-wrap justify-center gap-3 mt-1">{actions}</div> : null}
    </div>
  );
}
