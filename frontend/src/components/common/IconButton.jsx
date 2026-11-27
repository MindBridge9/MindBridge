export function IconButton({
  icon: Icon,
  label,
  variant = 'secondary',
  type = 'button',
  disabled = false,
  className = '',
  ...props
}) {
  const variantClasses =
    variant === 'primary'
      ? 'bg-[var(--mb-action)] text-white border border-[var(--mb-action)] hover:bg-[var(--mb-action-hover)]'
      : variant === 'quiet'
        ? 'bg-transparent text-inherit border border-transparent hover:bg-[var(--mb-support)]/60'
        : 'mb-theme-btn-secondary bg-[var(--mb-surface)] text-[var(--mb-text)] border border-[var(--mb-border)] hover:bg-[var(--mb-support)]/60';

  return (
    <button
      type={type}
      disabled={disabled}
      aria-label={label}
      title={label}
      className={`mb-button inline-flex items-center justify-center min-h-[44px] min-w-[44px] p-2 rounded-[6px] transition-colors duration-150 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${variantClasses} ${className}`}
      {...props}
    >
      {Icon ? <Icon className="w-5 h-5 shrink-0" aria-hidden="true" /> : null}
    </button>
  );
}
