import { useId } from 'react';

export function Field({
  label,
  htmlFor,
  hint = null,
  error = null,
  required = false,
  children,
  className = '',
}) {
  const generatedId = useId();
  const fieldId = htmlFor || generatedId;
  const hintId = hint ? `${fieldId}-hint` : undefined;
  const errorId = error ? `${fieldId}-error` : undefined;

  return (
    <div className={`flex flex-col gap-1.5 ${className}`}>
      {label ? (
        <label
          htmlFor={fieldId}
          className="text-[14px] font-semibold text-inherit flex items-center gap-1"
        >
          <span>{label}</span>
          {required ? (
            <span className="text-[var(--mb-error)]" aria-hidden="true">
              *
            </span>
          ) : null}
        </label>
      ) : null}
      {typeof children === 'function'
        ? children({
            id: fieldId,
            'aria-describedby':
              [hintId, errorId].filter(Boolean).join(' ') || undefined,
            'aria-invalid': error ? 'true' : undefined,
          })
        : children}
      {hint ? (
        <p id={hintId} className="mb-theme-muted text-[13px] text-[var(--mb-text-muted)] m-0">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} role="alert" className="text-[13px] font-medium text-[var(--mb-error)] m-0">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function Textarea({ className = '', ...props }) {
  return (
    <textarea
      className={`w-full min-h-[120px] rounded-[6px] border border-[var(--mb-border)] bg-[var(--mb-surface)] px-3.5 py-3 text-[var(--mb-text)] placeholder:text-[var(--mb-text-muted)] focus:border-[var(--mb-action)] ${className}`}
      {...props}
    />
  );
}

export function Select({ className = '', children, ...props }) {
  return (
    <select
      className={`min-h-[44px] w-full rounded-[6px] border border-[var(--mb-border)] bg-[var(--mb-surface)] px-3 py-2 text-[15px] text-[var(--mb-text)] ${className}`}
      {...props}
    >
      {children}
    </select>
  );
}

export function RangeInput({
  id,
  label,
  value,
  valueLabel,
  min,
  max,
  step,
  onChange,
  className = '',
}) {
  const generatedId = useId();
  const inputId = id || generatedId;

  return (
    <div className={`flex flex-col gap-1 ${className}`}>
      <div className="flex items-center justify-between gap-2">
        <label htmlFor={inputId} className="text-[14px] font-semibold">
          {label}
        </label>
        <span className="mb-tabular text-[14px] font-semibold text-[var(--mb-accent)]">
          {valueLabel ?? value}
        </span>
      </div>
      <input
        id={inputId}
        type="range"
        className="mb-range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </div>
  );
}
