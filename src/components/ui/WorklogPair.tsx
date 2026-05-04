import { formatDuration } from '../../lib/duration';

type Size = 'sm' | 'md' | 'lg';

interface WorklogPairProps {
  userSeconds: number;
  claudeSeconds: number;
  size?: Size;
  className?: string;
}

const SIZE_STYLES: Record<Size, { wrap: string; icon: string; value: string }> = {
  sm: {
    wrap: 'gap-2 text-xs',
    icon: 'text-[11px]',
    value: 'font-medium',
  },
  md: {
    wrap: 'gap-3 text-sm',
    icon: 'text-xs',
    value: 'font-semibold',
  },
  lg: {
    wrap: 'gap-4 text-2xl',
    icon: 'text-base',
    value: 'font-bold',
  },
};

export function WorklogPair({
  userSeconds,
  claudeSeconds,
  size = 'sm',
  className = '',
}: WorklogPairProps) {
  const styles = SIZE_STYLES[size];
  return (
    <div className={`inline-flex items-center ${styles.wrap} ${className}`}>
      <span className="inline-flex items-center gap-1 text-cyan-400">
        <span className={styles.icon} aria-hidden>
          👤
        </span>
        <span className={styles.value}>{formatDuration(userSeconds)}</span>
      </span>
      <span className="inline-flex items-center gap-1 text-purple-400">
        <span className={styles.icon} aria-hidden>
          🤖
        </span>
        <span className={styles.value}>{formatDuration(claudeSeconds)}</span>
      </span>
    </div>
  );
}
