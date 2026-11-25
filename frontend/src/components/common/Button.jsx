import { Loader2 } from 'lucide-react';

const VARIANT_CLASSES = {
  primary:
    'bg-[#204C43] text-white border border-[#204C43] hover:bg-[#193C35] active:bg-[#14302A] disabled:opacity-50',
  secondary:
    'mb-theme-btn-secondary bg-white text-[#20372D] border border-[#8B9B91] hover:bg-[#DCE9DF]/65 active:bg-[#DCE9DF] disabled:opacity-50',
  quiet:
    'mb-theme-btn-quiet bg-transparent text-[#20372D] border border-transparent hover:bg-[#DCE9DF]/65 active:bg-[#DCE9DF] disabled:opacity-50',
  destructive:
    'bg-[#A63D40] text-white border border-[#A63D40] hover:bg-[#8E3235] active:bg-[#7A2A2D] disabled:opacity-50',
};

const SIZE_CLASSES = {
  md: 'min-h-[44px] px-4 py-2 text-[15px]',
  sm: 'min-h-[44px] px-3.5 py-2 text-[14px]',
  lg: 'min-h-[48px] px-5 py-2.5 text-[16px]',
};

export function Button({
  variant = 'primary',
  size = 'md',
  type = 'button',
  loading = false,
  disabled = false,
  icon: Icon = null,
  children,
  className = '',
  ...props
}) {
  const isDisabled = disabled || loading;

  return (
    <button
      type={type}
      disabled={isDisabled}
      aria-busy={loading || undefined}
      className={`inline-flex items-center justify-center gap-2 rounded-[6px] font-semibold transition-colors duration-150 active:translate-y-[0.5px] disabled:active:translate-y-0 cursor-pointer disabled:cursor-not-allowed ${VARIANT_CLASSES[variant] || VARIANT_CLASSES.primary} ${SIZE_CLASSES[size] || SIZE_CLASSES.md} ${className}`}
      {...props}
    >
      {loading ? (
        <Loader2 className="w-4 h-4 animate-spin shrink-0" aria-hidden="true" />
      ) : Icon ? (
        <Icon className="w-4 h-4 shrink-0" aria-hidden="true" />
      ) : null}
      <span>{children}</span>
    </button>
  );
}
