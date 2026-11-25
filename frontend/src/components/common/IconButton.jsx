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
      ? 'bg-[#204C43] text-white border border-[#204C43] hover:bg-[#193C35]'
      : variant === 'quiet'
        ? 'bg-transparent text-inherit border border-transparent hover:bg-[#DCE9DF]/60'
        : 'mb-theme-btn-secondary bg-white text-[#20372D] border border-[#8B9B91] hover:bg-[#DCE9DF]/60';

  return (
    <button
      type={type}
      disabled={disabled}
      aria-label={label}
      title={label}
      className={`inline-flex items-center justify-center min-h-[44px] min-w-[44px] p-2 rounded-[6px] transition-colors duration-150 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${variantClasses} ${className}`}
      {...props}
    >
      {Icon ? <Icon className="w-5 h-5 shrink-0" aria-hidden="true" /> : null}
    </button>
  );
}
