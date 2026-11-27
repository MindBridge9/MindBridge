import { useId } from 'react';
import { motion } from 'motion/react';
import { useMotionPolicy } from '../motion/MotionSystem';
export function SegmentedControl({
  label,
  value,
  options,
  onChange,
  disabled = false,
  fullWidth = false,
  className = '',
}) {
  const indicatorId=useId();
  const {instant}=useMotionPolicy();
  const handleKeyDown = (event, index) => {
    if (disabled) return;
    const enabled = options.filter((opt) => !opt.disabled);
    if (!enabled.length) return;
    const direction = ['ArrowRight', 'ArrowDown'].includes(event.key) ? 1
      : ['ArrowLeft', 'ArrowUp'].includes(event.key) ? -1 : 0;
    if (!direction && event.key !== 'Home' && event.key !== 'End') return;
    event.preventDefault();
    let nextIndex = event.key === 'Home' ? 0 : event.key === 'End' ? options.length - 1 : index;
    const step = event.key === 'End' ? -1 : direction || 1;
    for (let count = 0; count < options.length; count += 1) {
      if (direction || count > 0) nextIndex = (nextIndex + step + options.length) % options.length;
      if (!options[nextIndex].disabled) break;
    }
    onChange(options[nextIndex].value);
    event.currentTarget.parentElement.querySelectorAll('[role="radio"]')[nextIndex]?.focus();
  };

  const containerLayout = fullWidth ? 'w-full' : 'w-fit';
  const selectedIndex = Math.max(0, options.findIndex((option) => option.value === value));

  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={`mb-segmented ${containerLayout} ${className}`}
      style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}
    >
      <span className="mb-segment-track" aria-hidden="true"><span style={{ width: `${100 / options.length}%`, transform: `translateX(${selectedIndex * 100}%)` }} /></span>
      {options.map((option, index) => {
        const selected = option.value === value;
        const isDisabled = disabled || option.disabled;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={selected}
            tabIndex={selected ? 0 : -1}
            disabled={isDisabled}
            onClick={() => onChange(option.value)}
            onKeyDown={(e) => handleKeyDown(e, index)}
            className="mb-segment-option"
          >
            {selected ? <motion.span className="mb-motion-tab" layoutId={indicatorId} transition={{type:"spring",duration:instant?0:.24,bounce:0}} aria-hidden="true" /> : null}
            <span className="mb-tab-label">{option.label}</span>
          </button>
        );
      })}
    </div>
  );
}
