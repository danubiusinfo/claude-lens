interface StatusDotProps {
  status: 'connected' | 'waiting' | 'error';
}

const colorMap = {
  connected: {
    dot: 'bg-emerald-400',
    ring: 'bg-emerald-400/40',
  },
  waiting: {
    dot: 'bg-orange-500',
    ring: 'bg-orange-500/40',
  },
  error: {
    dot: 'bg-red-400',
    ring: 'bg-red-400/40',
  },
};

export function StatusDot({ status }: StatusDotProps) {
  const colors = colorMap[status];
  const shouldPulse = status === 'connected' || status === 'waiting';

  return (
    <span className="relative inline-flex items-center justify-center w-2.5 h-2.5">
      {shouldPulse && (
        <span
          className={`absolute inline-flex h-full w-full rounded-full ${colors.ring} animate-ping`}
          style={{ animationDuration: '2s' }}
        />
      )}
      <span
        className={`relative inline-flex rounded-full w-2.5 h-2.5 ${colors.dot}`}
      />
    </span>
  );
}
