import { motion } from 'motion/react';
import { useMotionPolicy } from '../motion/MotionSystem';
import { Loader2 } from 'lucide-react';

const VARIANT_CLASSES = {
  primary:
    'bg-[var(--mb-action)] text-white border border-[var(--mb-action)] hover:bg-[var(--mb-action-hover)] active:bg-[var(--mb-action-hover)] disabled:opacity-50',
  secondary:
    'mb-theme-btn-secondary bg-[var(--mb-surface)] text-[var(--mb-text)] border border-[var(--mb-border)] hover:bg-[var(--mb-support)]/65 active:bg-[var(--mb-support)] disabled:opacity-50',
  quiet:
    'mb-theme-btn-quiet bg-transparent text-[var(--mb-text)] border border-transparent hover:bg-[var(--mb-support)]/65 active:bg-[var(--mb-support)] disabled:opacity-50',
  destructive:
    'bg-[var(--mb-error)] text-white border border-[var(--mb-error)] hover:bg-[var(--mb-error)] active:bg-[var(--mb-error)] disabled:opacity-50',
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
  const {instant}=useMotionPolicy();

  return (
    <motion.button
      whileHover={instant || isDisabled ? undefined : {scale:1.015}}
      whileTap={instant || isDisabled ? undefined : {scale:.97}}
      transition={{type:"spring",duration:.18,bounce:0}}
      data-variant={variant}
      type={type}
      disabled={isDisabled}
      aria-busy={loading || undefined}
      className={`mb-button inline-flex items-center justify-center gap-2 rounded-[8px] font-semibold cursor-pointer disabled:cursor-not-allowed ${VARIANT_CLASSES[variant] || VARIANT_CLASSES.primary} ${SIZE_CLASSES[size] || SIZE_CLASSES.md} ${className}`}
      {...props}
    >
      {loading ? (
        <Loader2 className="w-4 h-4 animate-spin shrink-0" aria-hidden="true" />
      ) : Icon ? (
        <Icon className="w-4 h-4 shrink-0" aria-hidden="true" />
      ) : null}
      <span>{children}</span>
    </motion.button>
  );
}
