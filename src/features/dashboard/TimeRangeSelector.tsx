import type { TimeRange } from '../../types';

interface TimeRangeSelectorProps {
  value: TimeRange;
  onChange: (range: TimeRange) => void;
  size?: 'md' | 'sm';
}

const ranges: { label: string; value: TimeRange }[] = [
  { label: 'Today', value: 'Today' },
  { label: 'Work Week', value: 'WorkWeek' },
  { label: '7d', value: 'Week' },
  { label: '30d', value: 'Month' },
  { label: 'All', value: 'All' },
];

const SIZE_STYLES = {
  md: {
    container: 'p-[3px] gap-0.5',
    button: 'px-3 py-1 text-xs',
  },
  sm: {
    container: 'p-[2px] gap-0.5',
    button: 'px-2 py-0.5 text-[10px]',
  },
} as const;

export function TimeRangeSelector({ value, onChange, size = 'md' }: TimeRangeSelectorProps) {
  const styles = SIZE_STYLES[size];
  return (
    <div
      role="group"
      aria-label="Time range"
      className={`flex rounded-full ${styles.container} border border-[var(--border-subtle)] bg-[var(--bg-card)] backdrop-blur-xl`}
    >
      {ranges.map((r) => (
        <button
          key={r.value}
          onClick={() => onChange(r.value)}
          aria-pressed={value === r.value}
          className={`${styles.button} font-medium rounded-full transition-all duration-200 ${
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
