import { memo } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts';
import { GlassCard } from '../../components/ui/GlassCard';
import { useProjectStats } from '../../hooks/useProjectStats';
import { useChartColors } from '../../hooks/useChartColors';

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toString();
}

function formatCost(n: number): string {
  if (n < 0.01 && n > 0) return '<$0.01';
  return `$${n.toFixed(2)}`;
}

const BAR_COLORS = [
  '#22d3ee', '#a78bfa', '#4ade80', '#fb923c', '#f472b6',
  '#38bdf8', '#c084fc', '#34d399', '#fbbf24', '#f87171',
];

export const InputOutputChart = memo(function ProjectUsageChart() {
  const { projects, loading } = useProjectStats(8);
  const colors = useChartColors();

  if (loading) {
    return (
      <GlassCard>
        <h3 className="text-[13px] font-medium text-[var(--text-secondary)] mb-4">
          Usage by Project
        </h3>
        <div className="flex items-center justify-center h-48">
          <div className="w-5 h-5 border-2 border-accent-cyan/30 border-t-accent-cyan rounded-full animate-spin" />
        </div>
      </GlassCard>
    );
  }

  if (projects.length === 0) {
    return (
      <GlassCard>
        <h3 className="text-[13px] font-medium text-[var(--text-secondary)] mb-4">
          Usage by Project
        </h3>
        <div className="flex items-center justify-center h-48 text-[var(--text-secondary)] text-sm">
          No project data yet
        </div>
      </GlassCard>
    );
  }

  const chartData = projects.map((p) => ({
    name: p.project_name,
    tokens: p.total_tokens,
    cost: p.total_cost_usd,
  }));

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
    <GlassCard>
      <h3 className="text-[13px] font-medium text-[var(--text-secondary)] mb-4">
        Usage by Project
        <span className="ml-2 text-[10px] font-normal text-[var(--text-secondary)] opacity-60">all time</span>
      </h3>
      <ResponsiveContainer width="100%" height={280}>
        <BarChart
          data={chartData}
          layout="vertical"
          margin={{ top: 0, right: 12, bottom: 0, left: 0 }}
        >
          <XAxis
            type="number"
            tickFormatter={formatTokens}
            stroke={colors.axis}
            fontSize={10}
            tickLine={false}
            axisLine={false}
          />
          <YAxis
            type="category"
            dataKey="name"
            stroke={colors.axis}
            fontSize={11}
            tickLine={false}
            axisLine={false}
            width={90}
            tick={{ fill: colors.tooltipText }}
          />
          <Tooltip
            contentStyle={tooltipStyle}
            cursor={{ fill: colors.grid, radius: 6 }}
            formatter={(_value, _name, props) => {
              const d = props.payload;
              return [
                `${formatTokens(d.tokens)} tokens  ·  ${formatCost(d.cost)}`,
                '',
              ];
            }}
            labelFormatter={(label) => String(label)}
          />
          <Bar
            dataKey="tokens"
            radius={[0, 4, 4, 0]}
            barSize={20}
          >
            {chartData.map((_, i) => (
              <Cell key={i} fill={BAR_COLORS[i % BAR_COLORS.length]} fillOpacity={0.75} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </GlassCard>
  );
});

export default InputOutputChart;
