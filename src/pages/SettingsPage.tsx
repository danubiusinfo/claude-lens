import { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { GlassCard } from '../components/ui/GlassCard';
import {
  clearLocalData,
  runJsonlImport,
  getModelPricing,
  updateModelPricing,
  resetModelPricing,
  recomputeWorklogs,
} from '../lib/tauri';
import { useToast } from '../components/ui/Toast';
import { useSourceStatus } from '../hooks/useSourceStatus';
import { useTheme } from '../hooks/useTheme';
import type { ThemeMode } from '../lib/theme';
import type { ModelPricing } from '../types';

const THEME_OPTIONS: { label: string; value: ThemeMode; icon: string }[] = [
  { label: 'Light', value: 'light', icon: '☀' },
  { label: 'Dark', value: 'dark', icon: '☾' },
  { label: 'System', value: 'system', icon: '⚙' },
];

export function SettingsPage() {
  const { mode: themeMode, setTheme } = useTheme();
  const [clearing, setClearing] = useState(false);
  const [clearError, setClearError] = useState<string | null>(null);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [clearConfirmClosing, setClearConfirmClosing] = useState(false);
  const [reimporting, setReimporting] = useState(false);
  const { toast } = useToast();
  const { status: sourceStatus, refresh: refreshStatus } = useSourceStatus();

  // Pricing state
  const [pricing, setPricing] = useState<ModelPricing[]>([]);
  const [editedPricing, setEditedPricing] = useState<ModelPricing[]>([]);
  const [savingPricing, setSavingPricing] = useState(false);

  const loadPricing = useCallback(async () => {
    try {
      const data = await getModelPricing();
      setPricing(data);
      setEditedPricing(data.map((p) => ({ ...p })));
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    loadPricing();
  }, [loadPricing]);

  const [recomputing, setRecomputing] = useState(false);
  const onRecomputeWorklogs = async () => {
    setRecomputing(true);
    try {
      await recomputeWorklogs();
      toast('Worklogs recomputed');
    } catch (e) {
      toast('Recompute failed: ' + String(e), 'error');
    } finally {
      setRecomputing(false);
    }
  };

  const hasPricingChanges = pricing.some((p, i) => {
    const e = editedPricing[i];
    if (!e) return false;
    return (
      p.input_per_million !== e.input_per_million ||
      p.output_per_million !== e.output_per_million ||
      p.cache_read_per_million !== e.cache_read_per_million ||
      p.cache_write_per_million !== e.cache_write_per_million ||
      p.context_limit !== e.context_limit
    );
  });

  const handleSavePricing = async () => {
    setSavingPricing(true);
    try {
      for (let i = 0; i < editedPricing.length; i++) {
        const orig = pricing[i];
        const edited = editedPricing[i];
        if (
          orig.input_per_million !== edited.input_per_million ||
          orig.output_per_million !== edited.output_per_million ||
          orig.cache_read_per_million !== edited.cache_read_per_million ||
          orig.cache_write_per_million !== edited.cache_write_per_million ||
          orig.context_limit !== edited.context_limit
        ) {
          await updateModelPricing(
            edited.model_key,
            edited.input_per_million,
            edited.output_per_million,
            edited.cache_read_per_million,
            edited.cache_write_per_million,
            edited.context_limit,
          );
        }
      }
      await loadPricing();
      toast('Pricing updated. Run a Full Re-import to recalculate costs.');
    } catch (err) {
      toast('Failed to save pricing: ' + String(err), 'error');
    } finally {
      setSavingPricing(false);
    }
  };

  const handleResetPricing = async () => {
    try {
      const data = await resetModelPricing();
      setPricing(data);
      setEditedPricing(data.map((p) => ({ ...p })));
      toast('Pricing reset to defaults');
    } catch (err) {
      toast('Failed to reset pricing: ' + String(err), 'error');
    }
  };

  const updateField = (index: number, field: keyof ModelPricing, value: string) => {
    setEditedPricing((prev) =>
      prev.map((p, i) =>
        i === index
          ? { ...p, [field]: field === 'context_limit' ? parseInt(value, 10) || 0 : parseFloat(value) || 0 }
          : p,
      ),
    );
  };

  const dismissClearConfirm = () => {
    setClearConfirmClosing(true);
  };

  const handleClearData = async () => {
    setShowClearConfirm(false);
    setClearConfirmClosing(false);
    setClearing(true);
    setClearError(null);
    try {
      await clearLocalData();
      toast('All data cleared');
      refreshStatus();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setClearError(msg);
      toast('Failed to clear data', 'error');
    } finally {
      setClearing(false);
    }
  };

  const handleReimport = async () => {
    setReimporting(true);
    try {
      const result = await runJsonlImport(true);
      toast(
        `Re-imported: ${result.sessions_created} new, ${result.sessions_updated} updated sessions`,
      );
      refreshStatus();
    } catch (err) {
      toast('Re-import failed: ' + String(err), 'error');
    } finally {
      setReimporting(false);
    }
  };

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold text-text-primary tracking-tight">Settings</h1>

      <GlassCard>
        <h2 className="text-sm font-medium text-text-primary mb-3">Appearance</h2>
        <div className="flex gap-1 p-[3px] rounded-full border border-[var(--border-subtle)] bg-[var(--bg-card)] w-fit">
          {THEME_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setTheme(opt.value)}
              className={`px-3 py-1.5 text-xs font-medium rounded-full transition-all duration-200 flex items-center gap-1.5 ${
                themeMode === opt.value
                  ? 'bg-[var(--accent-cyan)]/15 text-[var(--accent-cyan)] shadow-sm'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              }`}
            >
              <span>{opt.icon}</span>
              {opt.label}
            </button>
          ))}
        </div>
      </GlassCard>

      <GlassCard>
        <h2 className="text-sm font-medium text-text-primary mb-3">
          Database Location
        </h2>
        <p className="text-xs text-text-secondary mb-2">
          All telemetry and imported session data is stored locally in a SQLite database:
        </p>
        <code className="block text-xs font-mono text-accent-cyan bg-[var(--input-bg)] rounded-md px-3 py-2">
          ~/Library/Application Support/com.claudelens.app/claudelens.db
        </code>
      </GlassCard>

      <GlassCard>
        <h2 className="text-sm font-medium text-text-primary mb-3">
          JSONL Source
        </h2>
        <div className="space-y-2 text-xs text-text-secondary">
          <div className="flex justify-between">
            <span>Source files</span>
            <span className="text-[var(--text-primary)]">
              {sourceStatus?.source_file_count ?? '...'}
            </span>
          </div>
          <div className="flex justify-between">
            <span>Imported sessions</span>
            <span className="text-[var(--text-primary)]">
              {sourceStatus?.jsonl.total_sessions ?? '...'}
            </span>
          </div>
          <div className="flex justify-between">
            <span>Last import</span>
            <span className="text-[var(--text-primary)]">
              {sourceStatus?.jsonl.last_import_at
                ? new Date(sourceStatus.jsonl.last_import_at).toLocaleString()
                : 'Never'}
            </span>
          </div>
        </div>
        <button
          onClick={handleReimport}
          disabled={reimporting}
          className="mt-3 px-4 py-2 text-sm font-medium rounded-full transition-colors
            bg-[var(--input-bg)] text-[var(--text-primary)] border border-[var(--input-border)]
            hover:bg-[var(--bg-card-hover)]
            disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {reimporting ? 'Re-importing...' : 'Full Re-import'}
        </button>
      </GlassCard>

      <GlassCard>
        <h2 className="text-sm font-medium text-text-primary mb-3">
          Worklog
        </h2>
        <p className="text-xs text-text-secondary mb-3">
          Recompute worklog totals across all sessions. Use this if numbers look wrong after an upgrade.
        </p>
        <button
          type="button"
          onClick={onRecomputeWorklogs}
          disabled={recomputing}
          className="px-4 py-1.5 text-xs font-medium rounded-full transition-colors
            bg-accent-cyan/10 text-accent-cyan border border-accent-cyan/20
            hover:bg-accent-cyan/20
            disabled:opacity-30 disabled:cursor-not-allowed"
        >
          {recomputing ? 'Recomputing…' : 'Recompute Worklogs'}
        </button>
      </GlassCard>

      <GlassCard>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-medium text-text-primary">
            Token Pricing
          </h2>
          <span className="text-[10px] text-text-secondary">per 1M tokens (USD)</span>
        </div>

        {editedPricing.length > 0 && (
          <div className="space-y-3">
            {/* Header */}
            <div className="grid grid-cols-6 gap-2 text-[10px] text-text-secondary font-medium">
              <span>Model</span>
              <span>Input</span>
              <span>Output</span>
              <span>Cache Read</span>
              <span>Cache Write</span>
              <span>Context Limit</span>
            </div>

            {/* Rows */}
            {editedPricing.map((p, i) => (
              <div key={p.model_key} className="grid grid-cols-6 gap-2 items-center">
                <span className="text-xs text-[var(--text-primary)]">{p.display_name}</span>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={p.input_per_million}
                  onChange={(e) => updateField(i, 'input_per_million', e.target.value)}
                  className="px-3 py-1 rounded-full bg-[var(--input-bg)] border border-[var(--input-border)] text-xs text-[var(--text-primary)] focus:outline-none focus:border-[var(--input-border-focus)] w-full"
                />
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={p.output_per_million}
                  onChange={(e) => updateField(i, 'output_per_million', e.target.value)}
                  className="px-3 py-1 rounded-full bg-[var(--input-bg)] border border-[var(--input-border)] text-xs text-[var(--text-primary)] focus:outline-none focus:border-[var(--input-border-focus)] w-full"
                />
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={p.cache_read_per_million}
                  onChange={(e) => updateField(i, 'cache_read_per_million', e.target.value)}
                  className="px-3 py-1 rounded-full bg-[var(--input-bg)] border border-[var(--input-border)] text-xs text-[var(--text-primary)] focus:outline-none focus:border-[var(--input-border-focus)] w-full"
                />
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={p.cache_write_per_million}
                  onChange={(e) => updateField(i, 'cache_write_per_million', e.target.value)}
                  className="px-3 py-1 rounded-full bg-[var(--input-bg)] border border-[var(--input-border)] text-xs text-[var(--text-primary)] focus:outline-none focus:border-[var(--input-border-focus)] w-full"
                />
                <input
                  type="number"
                  step="1000"
                  min="0"
                  value={p.context_limit}
                  onChange={(e) => updateField(i, 'context_limit', e.target.value)}
                  className="px-3 py-1 rounded-full bg-[var(--input-bg)] border border-[var(--input-border)] text-xs text-[var(--text-primary)] focus:outline-none focus:border-[var(--input-border-focus)] w-full"
                />
              </div>
            ))}

            {/* Actions */}
            <div className="flex items-center gap-2 pt-2">
              <button
                onClick={handleSavePricing}
                disabled={!hasPricingChanges || savingPricing}
                className="px-4 py-1.5 text-xs font-medium rounded-full transition-colors
                  bg-accent-cyan/10 text-accent-cyan border border-accent-cyan/20
                  hover:bg-accent-cyan/20
                  disabled:opacity-30 disabled:cursor-not-allowed"
              >
                {savingPricing ? 'Saving...' : 'Save'}
              </button>
              <button
                onClick={handleResetPricing}
                className="px-4 py-1.5 text-xs font-medium rounded-full transition-colors
                  text-text-secondary border border-[var(--input-border)]
                  hover:text-[var(--text-primary)] hover:border-[var(--input-border-focus)]"
              >
                Reset to Defaults
              </button>
            </div>

            <p className="text-[10px] text-text-secondary">
              After changing prices, run a Full Re-import to recalculate all session costs.
            </p>
          </div>
        )}
      </GlassCard>

      <GlassCard>
        <h2 className="text-sm font-medium text-text-primary mb-3">
          Danger Zone
        </h2>
        <p className="text-xs text-text-secondary mb-4">
          Permanently delete all collected telemetry and imported data. This action cannot
          be undone.
        </p>
        <button
          onClick={() => setShowClearConfirm(true)}
          disabled={clearing}
          className="px-4 py-2 text-sm font-medium rounded-full transition-colors
            bg-red-500/10 text-red-400 border border-red-500/20
            hover:bg-red-500/20 hover:text-red-300
            disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {clearing ? 'Clearing...' : 'Clear All Data'}
        </button>
        {clearError && (
          <p className="text-xs text-red-400 mt-2">{clearError}</p>
        )}
      </GlassCard>

      {showClearConfirm && createPortal(
        <>
          <div
            className="fixed inset-0 bg-black/20 backdrop-blur-md z-40"
            style={{ animation: `${clearConfirmClosing ? 'overlay-out' : 'overlay-in'} 0.2s ease-out both` }}
            onClick={dismissClearConfirm}
          />
          <div className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none">
            <div
              role="dialog"
              aria-modal="true"
              onAnimationEnd={() => {
                if (clearConfirmClosing) {
                  setShowClearConfirm(false);
                  setClearConfirmClosing(false);
                }
              }}
              style={{
                backdropFilter: 'blur(40px) saturate(180%) brightness(110%)',
                WebkitBackdropFilter: 'blur(40px) saturate(180%) brightness(110%)',
                background: 'var(--glass-tint)',
                border: '1px solid var(--glass-border)',
                borderRadius: '20px',
                animation: `${clearConfirmClosing ? 'dialog-out' : 'dialog-in'} 0.2s cubic-bezier(0.16, 1, 0.3, 1) both`,
              }}
              className="pointer-events-auto relative max-w-sm w-full mx-4 p-5 shadow-2xl"
            >
              <h3 className="text-sm font-semibold text-text-primary mb-1">Clear All Data</h3>
              <p className="text-xs text-text-secondary mb-5 leading-relaxed">
                This will permanently delete all collected telemetry and imported
                JSONL data. This action cannot be undone.
              </p>
              <div className="flex items-center gap-2 justify-end">
                <button
                  onClick={dismissClearConfirm}
                  className="px-4 py-1.5 text-xs font-medium rounded-full transition-colors
                    text-text-secondary border border-[var(--input-border)]
                    hover:text-[var(--text-primary)] hover:border-[var(--input-border-focus)]"
                >
                  Cancel
                </button>
                <button
                  onClick={handleClearData}
                  className="px-4 py-1.5 text-xs font-medium rounded-full transition-colors
                    bg-red-500/15 text-red-400 border border-red-500/25
                    hover:bg-red-500/25 hover:text-red-300"
                >
                  Clear Everything
                </button>
              </div>
            </div>
          </div>
        </>,
        document.body,
      )}
    </div>
  );
}
