import { useMemo } from 'react';
import { motion } from 'motion/react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from 'recharts';
import type { TimeseriesPoint } from '../../types';
import { useChartColors } from '../../hooks/useChartColors';

interface ExpandedWidgetChartProps {
  widgetType: 'tokens' | 'cost';
  data: TimeseriesPoint[];
  onClose: () => void;
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toString();
}

function formatCost(n: number): string {
  if (n < 0.01 && n > 0) return '<$0.01';
  return `$${n.toFixed(2)}`;
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

const WIDGET_CONFIG = {
  tokens: {
    title: 'Tokens',
    areas: [
      { dataKey: 'input', color: '#22d3ee', label: 'Input' },
      { dataKey: 'output', color: '#06b6d4', label: 'Output' },
    ],
    yFormatter: formatTokens,
    tooltipFormatter: (d: Record<string, number>) =>
      `In: ${formatTokens(d.input)}  ·  Out: ${formatTokens(d.output)}`,
  },
  cost: {
    title: 'Total Cost',
    areas: [
      { dataKey: 'cost', color: '#a78bfa', label: 'Cost' },
    ],
    yFormatter: formatCost,
    tooltipFormatter: (d: Record<string, number>) => formatCost(d.cost),
  },
} as const;

export function ExpandedWidgetChart({ widgetType, data, onClose }: ExpandedWidgetChartProps) {
  const colors = useChartColors();
  const config = WIDGET_CONFIG[widgetType];

  const chartData = useMemo(() => data, [data]);

  const tooltipStyle = {
    backgroundColor: colors.tooltipBg,
    backdropFilter: 'blur(40px) saturate(180%)',
    border: `1px solid ${colors.tooltipBorder}`,
    borderRadius: '12px',
    fontSize: '12px',
    color: colors.tooltipText,
    boxShadow: colors.tooltipShadow,
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-medium text-[var(--text-secondary)]">
          {config.title}
        </span>
        <button
          onClick={(e) => { e.stopPropagation(); onClose(); }}
          className="w-7 h-7 flex items-center justify-center rounded-full
                     hover:bg-white/10 transition-colors text-[var(--text-secondary)]
                     hover:text-[var(--text-primary)]"
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
            <path d="M1 1l12 12M13 1L1 13" />
          </svg>
        </button>
      </div>

      <motion.div
        className="flex-1 min-h-0"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.25, duration: 0.3 }}
      >
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartData} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
            <defs>
              {config.areas.map(area => (
                <linearGradient key={area.dataKey} id={`grad-${area.dataKey}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={area.color} stopOpacity={0.3} />
                  <stop offset="100%" stopColor={area.color} stopOpacity={0.02} />
                </linearGradient>
              ))}
            </defs>
            <CartesianGrid stroke={colors.grid} strokeDasharray="3 3" vertical={false} />
            <XAxis
              dataKey="date"
              tickFormatter={formatDate}
              stroke={colors.axis}
              fontSize={10}
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              tickFormatter={config.yFormatter}
              stroke={colors.axis}
              fontSize={10}
              tickLine={false}
              axisLine={false}
              width={50}
            />
            <Tooltip
              contentStyle={tooltipStyle}
              labelFormatter={(label) => formatDate(String(label))}
              formatter={(_value, _name, props) => {
                const d = props.payload;
                return [config.tooltipFormatter(d), ''];
              }}
              cursor={{ stroke: colors.axis, strokeDasharray: '3 3' }}
            />
            {config.areas.map(area => (
              <Area
                key={area.dataKey}
                type="monotone"
                dataKey={area.dataKey}
                stroke={area.color}
                strokeWidth={2}
                fill={`url(#grad-${area.dataKey})`}
                dot={false}
                activeDot={{ r: 4, strokeWidth: 2, stroke: area.color, fill: 'var(--bg-primary)' }}
              />
            ))}
          </AreaChart>
        </ResponsiveContainer>
      </motion.div>
    </div>
  );
}
