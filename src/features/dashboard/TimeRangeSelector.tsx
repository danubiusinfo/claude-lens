import type { TimeRange } from '../../types';

interface TimeRangeSelectorProps {
  value: TimeRange;
  onChange: (range: TimeRange) => void;
}

const ranges: { label: string; value: TimeRange }[] = [
  { label: 'Today', value: 'Today' },
  { label: 'Work Week', value: 'WorkWeek' },
  { label: '7d', value: 'Week' },
  { label: '30d', value: 'Month' },
  { label: 'All', value: 'All' },
];

export function TimeRangeSelector({ value, onChange }: TimeRangeSelectorProps) {
  return (
    <div
      role="group"
      aria-label="Time range"
      className="flex gap-0.5 rounded-full p-[3px] border border-[var(--border-subtle)] bg-[var(--bg-card)] backdrop-blur-xl"
    >
      {ranges.map((r) => (
        <button
          key={r.value}
          onClick={() => onChange(r.value)}
          aria-pressed={value === r.value}
          className={`px-3 py-1 text-xs font-medium rounded-full transition-all duration-200 ${
            value === r.value
              ? 'bg-[var(--bg-card-hover)] text-[var(--text-primary)] shadow-sm'
              : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
          }`}
        >
          {r.label}
        </button>
      ))}
    </div>
  );
}
