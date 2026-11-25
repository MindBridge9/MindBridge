export function SegmentedControl({
  label,
  value,
  options,
  onChange,
  disabled = false,
  fullWidth = false,
  className = '',
}) {
  const handleKeyDown = (event, index) => {
    if (disabled) return;
    const enabled = options.filter((opt) => !opt.disabled);
    if (!enabled.length) return;
    let nextIndex = null;
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
      nextIndex = (index + 1) % options.length;
    } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
      nextIndex = (index - 1 + options.length) % options.length;
    }
    if (nextIndex !== null) {
      event.preventDefault();
      const candidate = options[nextIndex];
      if (candidate && !candidate.disabled) {
        onChange(candidate.value);
      }
    }
  };

  const containerLayout = fullWidth
    ? 'grid grid-flow-col auto-cols-fr w-full'
    : 'inline-flex flex-wrap items-center w-fit';

  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={`${containerLayout} gap-1 rounded-[6px] border border-[#8B9B91] bg-[#EFECE0] p-1 ${className}`}
    >
      {options.map((option, index) => {
        const selected = option.value === value;
        const isDisabled = disabled || option.disabled;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={selected}
            disabled={isDisabled}
            onClick={() => onChange(option.value)}
            onKeyDown={(e) => handleKeyDown(e, index)}
            className={`min-h-[40px] px-3.5 py-1.5 rounded-[4px] text-[14px] font-semibold transition-colors duration-150 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
              selected
                ? 'bg-[#204C43] text-white'
                : 'bg-transparent text-[#20372D] hover:bg-white/75'
            }`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
