import { User, Bot } from 'lucide-react';
import { formatDuration } from '../../lib/duration';

type Size = 'sm' | 'md' | 'lg';

interface WorklogPairProps {
  userSeconds: number;
  claudeSeconds: number;
  size?: Size;
  className?: string;
}

const SIZE_STYLES: Record<Size, { wrap: string; iconSize: number; value: string }> = {
  sm: {
    wrap: 'gap-2 text-xs',
    iconSize: 12,
    value: 'font-medium',
  },
  md: {
    wrap: 'gap-3 text-sm',
    iconSize: 14,
    value: 'font-semibold',
  },
  lg: {
    wrap: 'gap-4 text-2xl',
    iconSize: 18,
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
      <span className="inline-flex items-center gap-1 text-accent-cyan whitespace-nowrap">
        <User size={styles.iconSize} aria-hidden strokeWidth={2} />
        <span className={styles.value}>{formatDuration(userSeconds)}</span>
      </span>
      <span className="inline-flex items-center gap-1 text-accent-purple whitespace-nowrap">
        <Bot size={styles.iconSize} aria-hidden strokeWidth={2} />
        <span className={styles.value}>{formatDuration(claudeSeconds)}</span>
      </span>
    </div>
  );
}
