import { useMemo, useState, useCallback, memo, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { motion, LayoutGroup } from 'motion/react';
import { GlassCard } from '../../components/ui/GlassCard';
import { DayWorklogDialog } from './DayWorklogDialog';
import type { DailyUsageRecord } from '../../types';

interface DailyHeatmapProps {
  data: DailyUsageRecord[];
  loading: boolean;
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

const DAY_LABELS = ['Mon', '', 'Wed', '', 'Fri', '', 'Sun'];
const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Format a local Date as YYYY-MM-DD without UTC conversion */
function toLocalDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

const INTENSITY_DARK = [
  null, // level 0: empty cell, handled separately
  'rgba(34, 211, 238, 0.35)',
  'rgba(34, 211, 238, 0.55)',
  'rgba(34, 211, 238, 0.80)',
  'rgba(34, 211, 238, 1)',
];

const INTENSITY_LIGHT = [
  null,
  'rgba(14, 116, 144, 0.40)',
  'rgba(14, 116, 144, 0.60)',
  'rgba(14, 116, 144, 0.80)',
  'rgba(14, 116, 144, 1)',
];

interface CellData {
  date: string;
  record: DailyUsageRecord | null;
  intensity: number;
  isFuture: boolean;
  isToday: boolean;
}

function getIntensity(value: number, maxValue: number): number {
  if (value === 0 || maxValue === 0) return 0;
  const ratio = Math.sqrt(value / maxValue);
  return Math.min(4, Math.ceil(ratio * 4)) as 1 | 2 | 3 | 4;
}

const LAYOUT_TRANSITION = { layout: { duration: 0.4, ease: [0.4, 0, 0.2, 1] as const } };

interface HeatmapCellProps {
  cell: CellData;
  intensityColors: (string | null)[];
  isOpen: boolean;
  onHover: (e: React.MouseEvent, cell: CellData) => void;
  onLeave: () => void;
  onClick: (cell: CellData) => void;
}

const HeatmapCell = memo(function HeatmapCell({ cell, intensityColors, isOpen, onHover, onLeave, onClick }: HeatmapCellProps) {
  const bg = cell.isFuture ? undefined : intensityColors[cell.intensity] ?? undefined;
  const hasData = !cell.isFuture && cell.record !== null;

  if (isOpen) {
    return (
      <motion.div
        layoutId={`heatmap-cell-${cell.date}`}
        transition={LAYOUT_TRANSITION}
        style={{
          width: 12,
          height: 12,
          borderTopLeftRadius: 2,
          borderTopRightRadius: 2,
          borderBottomLeftRadius: 2,
          borderBottomRightRadius: 2,
        }}
        className="invisible"
      />
    );
  }

  return (
    <div
      className={`rounded-sm transition-colors ${!bg ? 'bg-[var(--heatmap-empty)]' : ''} ${cell.isToday ? 'heatmap-today' : ''}`}
      style={{ width: 12, height: 12, backgroundColor: bg, cursor: hasData ? 'pointer' : 'default' }}
      onMouseEnter={(e) => onHover(e, cell)}
      onMouseLeave={onLeave}
      onClick={() => onClick(cell)}
    />
  );
});

const subscribeTheme = (cb: () => void) => {
  const observer = new MutationObserver(cb);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
  return () => observer.disconnect();
};
const getIsLight = () => document.documentElement.classList.contains('light');

export function DailyHeatmap({ data, loading }: DailyHeatmapProps) {
  const isLight = useSyncExternalStore(subscribeTheme, getIsLight);
  const intensityColors = isLight ? INTENSITY_LIGHT : INTENSITY_DARK;
  const [tooltip, setTooltip] = useState<{ x: number; y: number; cell: CellData } | null>(null);
  const [openDay, setOpenDay] = useState<string | null>(null);

  const handleCellClick = useCallback((cell: CellData) => {
    if (!cell.isFuture && cell.record !== null) {
      setOpenDay(cell.date);
    }
  }, []);

  const handleCellHover = useCallback((e: React.MouseEvent, cell: CellData) => {
    const rect = e.currentTarget.getBoundingClientRect();
    setTooltip({
      x: rect.left + rect.width / 2,
      y: rect.top - 4,
      cell,
    });
  }, []);

  const handleCellLeave = useCallback(() => setTooltip(null), []);

  const { cells, monthLabels } = useMemo(() => {
    const lookup = new Map<string, DailyUsageRecord>();
    for (const d of data) {
      lookup.set(d.day, d);
    }

    const today = new Date();
    const currentYear = today.getFullYear();

    // Full year: Jan 1 - Dec 31
    const yearStart = new Date(currentYear, 0, 1);
    const yearEnd = new Date(currentYear, 11, 31);

    // Align start to preceding Monday
    const startDate = new Date(yearStart);
    const dayOfWeek = startDate.getDay();
    const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    startDate.setDate(startDate.getDate() + mondayOffset);

    // Align end to following Sunday
    const endDate = new Date(yearEnd);
    const endDow = endDate.getDay();
    if (endDow !== 0) {
      endDate.setDate(endDate.getDate() + (7 - endDow));
    }

    // Determine which metric to use for intensity
    const hasTokenData = data.some((d) => d.total_tokens > 0);
    const metricFn = hasTokenData
      ? (d: DailyUsageRecord) => d.total_tokens
      : (d: DailyUsageRecord) => d.event_count || d.session_count;

    // Find max value for log-based intensity scaling
    const maxValue = data.reduce((max, d) => Math.max(max, metricFn(d)), 0);

    // Build cells for the entire year
    const allCells: CellData[] = [];
    const cur = new Date(startDate);
    const todayStr = toLocalDateStr(today);

    while (cur <= endDate) {
      const dateStr = toLocalDateStr(cur);
      const isFuture = dateStr > todayStr;
      const isToday = dateStr === todayStr;
      const record = lookup.get(dateStr) ?? null;
      const value = record ? metricFn(record) : 0;
      const intensity = isFuture ? 0 : getIntensity(value, maxValue);
      allCells.push({ date: dateStr, record, intensity, isFuture, isToday });
      cur.setDate(cur.getDate() + 1);
    }

    // Precompute all 12 month label positions
    const months: { label: string; col: number }[] = [];
    for (let m = 0; m < 12; m++) {
      const firstOfMonth = new Date(currentYear, m, 1);
      // Find the first Monday on or after the 1st of the month
      let d = new Date(firstOfMonth);
      while (d.getDay() !== 1) {
        d.setDate(d.getDate() + 1);
      }
      // Calculate which column (week) this Monday falls in
      const daysSinceStart = Math.round((d.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
      const col = Math.floor(daysSinceStart / 7);
      months.push({ label: MONTH_NAMES[m], col });
    }

    return { cells: allCells, monthLabels: months };
  }, [data]);

  if (loading) {
    return (
      <GlassCard>
        <div className="flex items-center justify-center py-8">
          <div className="w-6 h-6 border-2 border-accent-cyan/30 border-t-accent-cyan rounded-full animate-spin" />
        </div>
      </GlassCard>
    );
  }

  if (cells.length === 0) {
    return (
      <GlassCard>
        <h3 className="text-[13px] font-medium text-[var(--text-secondary)] mb-4">
          Activity
        </h3>
        <p className="text-sm text-[var(--text-secondary)] text-center py-6">
          No activity data yet
        </p>
      </GlassCard>
    );
  }

  const numWeeks = Math.ceil(cells.length / 7);

  return (
    <LayoutGroup>
    <GlassCard>
      <h3 className="text-[13px] font-medium text-[var(--text-secondary)] mb-4">
        Activity
      </h3>
      <div className="overflow-x-auto">
        {/* Month labels */}
        <div className="flex ml-8 mb-1" style={{ gap: '2px' }}>
          {Array.from({ length: numWeeks }, (_, weekIdx) => {
            const monthLabel = monthLabels.find((m) => m.col === weekIdx);
            return (
              <div key={weekIdx} className="text-[10px] text-[var(--text-secondary)]" style={{ width: 12, minWidth: 12 }}>
                {monthLabel?.label ?? ''}
              </div>
            );
          })}
        </div>

        <div className="flex">
          {/* Day labels */}
          <div className="flex flex-col mr-1" style={{ gap: '2px' }}>
            {DAY_LABELS.map((label, i) => (
              <div key={i} className="text-[10px] text-[var(--text-secondary)] leading-none" style={{ height: 12, display: 'flex', alignItems: 'center' }}>
                {label}
              </div>
            ))}
          </div>

          {/* Grid */}
          <div
            className="grid"
            style={{
              gridTemplateRows: 'repeat(7, 12px)',
              gridAutoFlow: 'column',
              gridAutoColumns: '12px',
              gap: '2px',
            }}
          >
            {cells.map((cell) => (
              <HeatmapCell
                key={cell.date}
                cell={cell}
                intensityColors={intensityColors}
                isOpen={openDay === cell.date}
                onHover={handleCellHover}
                onLeave={handleCellLeave}
                onClick={handleCellClick}
              />
            ))}
          </div>
        </div>
      </div>

    </GlassCard>

      <DayWorklogDialog day={openDay} onClose={() => setOpenDay(null)} />

      {/* Tooltip — portaled to body to escape backdrop-filter containing block */}
      {tooltip && createPortal(
        <div
          className="fixed z-50 pointer-events-none px-3 py-2 rounded-xl bg-[rgba(30,30,34,0.95)] border border-white/[0.12] shadow-[0_4px_24px_rgba(0,0,0,0.3)]"
          style={{
            backdropFilter: 'blur(40px) saturate(180%)',
            WebkitBackdropFilter: 'blur(40px) saturate(180%)',
            left: tooltip.x,
            top: tooltip.y,
            transform: 'translate(-50%, -100%)',
          }}
        >
          <div className="text-xs font-medium text-white/90 whitespace-nowrap">
            {new Date(tooltip.cell.date + 'T00:00:00').toLocaleDateString('en-US', {
              weekday: 'short',
              month: 'short',
              day: 'numeric',
              year: 'numeric',
            })}
          </div>
          {tooltip.cell.isFuture ? (
            <div className="text-[11px] text-white/50 mt-1">Upcoming</div>
          ) : tooltip.cell.record ? (
            <div className="text-[11px] text-white/50 mt-1 space-y-0.5">
              {tooltip.cell.record.total_tokens > 0 && (
                <div>{formatTokens(tooltip.cell.record.total_tokens)} tokens</div>
              )}
              {tooltip.cell.record.total_cost_usd > 0 && (
                <div>{formatCost(tooltip.cell.record.total_cost_usd)}</div>
              )}
              <div>{tooltip.cell.record.session_count} session{tooltip.cell.record.session_count !== 1 ? 's' : ''}</div>
              {tooltip.cell.record.event_count > 0 && tooltip.cell.record.total_tokens === 0 && (
                <div>{tooltip.cell.record.event_count} event{tooltip.cell.record.event_count !== 1 ? 's' : ''}</div>
              )}
            </div>
          ) : (
            <div className="text-[11px] text-white/50 mt-1">No activity</div>
          )}
        </div>,
        document.body,
      )}
    </LayoutGroup>
  );
}
