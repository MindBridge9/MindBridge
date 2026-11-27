import { Loader2 } from 'lucide-react';
import { SegmentedControl } from '../common';

export function ReadingModeControl({
  value = 'original',
  availableLevels = ['original', 'easy'],
  pending = false,
  disabled = false,
  onChange,
}) {
  const options = [
    { value: 'original', label: 'Original' },
    {
      value: 'easy',
      label: 'Simplified',
      disabled: pending || !availableLevels.includes('easy'),
    },
  ];

  if (availableLevels.includes('guided')) {
    options.push({ value: 'guided', label: 'Guided' });
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <SegmentedControl
        label="Reading level"
        value={value}
        options={options}
        disabled={disabled}

        onChange={onChange}
      />
      {pending ? (
        <span
          role="status"
          className="inline-flex items-center gap-1.5 text-[13px] font-medium text-[var(--mb-accent)]"
        >
          <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
          Simplifying selected section…
        </span>
      ) : null}
    </div>
  );
}
