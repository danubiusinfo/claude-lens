import { useCallback, useEffect, useState } from 'react';
import { GlassCard } from '../../components/ui/GlassCard';
import { useToast } from '../../components/ui/Toast';
import {
  getSourceSettings,
  listClaudeRoots,
  rescanSources,
  runJsonlImport,
  setJsonlDirectoryOverride,
  setWslScanEnabled,
} from '../../lib/tauri';
import type { ClaudeRootInfo, ClaudeRootKind, SourceSettings } from '../../types';

const KIND_LABELS: Record<ClaudeRootKind, string> = {
  native: 'Local',
  wsl: 'WSL',
  manual: 'Custom',
};

const KIND_STYLES: Record<ClaudeRootKind, string> = {
  native: 'bg-accent-cyan/10 text-accent-cyan border-accent-cyan/20',
  wsl: 'bg-accent-purple/10 text-accent-purple border-accent-purple/20',
  manual: 'text-[var(--accent-amber)] border-[var(--accent-amber)]',
};

interface Props {
  /** Refresh the surrounding source status after sources change. */
  onSourcesChanged?: () => void;
}

export function SessionSourcesCard({ onSourcesChanged }: Props) {
  const { toast } = useToast();
  const [roots, setRoots] = useState<ClaudeRootInfo[] | null>(null);
  const [settings, setSettings] = useState<SourceSettings | null>(null);
  const [overrideDraft, setOverrideDraft] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const [nextRoots, nextSettings] = await Promise.all([
        listClaudeRoots(),
        getSourceSettings(),
      ]);
      setRoots(nextRoots);
      setSettings(nextSettings);
      setOverrideDraft(nextSettings.override_dir ?? '');
    } catch (err) {
      toast('Could not read session sources: ' + String(err), 'error');
    }
  }, [toast]);

  useEffect(() => {
    load();
  }, [load]);

  /** Re-detect the roots, pull in whatever they hold, then refresh the view. */
  const reimportFromSources = useCallback(
    async (message: string) => {
      setBusy(true);
      try {
        await rescanSources();
        await runJsonlImport(false);
        await load();
        onSourcesChanged?.();
        toast(message);
      } catch (err) {
        toast('Rescan failed: ' + String(err), 'error');
      } finally {
        setBusy(false);
      }
    },
    [load, onSourcesChanged, toast],
  );

  const handleToggleWsl = async () => {
    if (!settings) return;
    const enabled = !settings.wsl_scan_enabled;
    try {
      await setWslScanEnabled(enabled);
    } catch (err) {
      toast('Could not change the WSL setting: ' + String(err), 'error');
      return;
    }
    await reimportFromSources(
      enabled ? 'WSL scanning enabled' : 'WSL scanning disabled',
    );
  };

  const handleSaveOverride = async () => {
    const path = overrideDraft.trim();
    try {
      await setJsonlDirectoryOverride(path === '' ? null : path);
    } catch (err) {
      toast('Could not save the folder: ' + String(err), 'error');
      return;
    }
    await reimportFromSources(
      path === '' ? 'Back to automatic detection' : 'Using ' + path,
    );
  };

  const overrideActive = (settings?.override_dir ?? '') !== '';
  const overrideDirty = overrideDraft.trim() !== (settings?.override_dir ?? '');

  return (
    <GlassCard>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-accent-purple/10 flex items-center justify-center">
            <svg className="w-3.5 h-3.5 text-accent-purple" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
            </svg>
          </div>
          <h2 className="text-sm font-medium text-text-primary">Session sources</h2>
        </div>
        <button
          onClick={() => reimportFromSources('Sources rescanned')}
          disabled={busy}
          className="px-4 py-1.5 text-xs font-medium rounded-full transition-colors
            bg-accent-purple/10 text-accent-purple border border-accent-purple/20
            hover:bg-accent-purple/20
            disabled:opacity-30 disabled:cursor-not-allowed"
        >
          {busy ? 'Scanning...' : 'Rescan'}
        </button>
      </div>

      <p className="text-[11px] text-text-secondary leading-relaxed mb-3">
        Claude Code writes its sessions into <code>.claude</code> in your home
        directory. Running it inside WSL puts them on the distribution's own
        filesystem, so those are read over{' '}
        <code>\\wsl.localhost\&lt;distro&gt;</code> instead.
      </p>

      {roots === null ? (
        <div className="text-xs text-text-secondary">Loading...</div>
      ) : roots.length === 0 ? (
        <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-card)] p-3 text-[11px] text-text-secondary leading-relaxed">
          No <code>.claude</code> directory found. If you run Claude Code inside
          WSL, keep WSL scanning on below, or point the app at the folder by
          hand — for example{' '}
          <code>\\wsl.localhost\Ubuntu\home\&lt;user&gt;\.claude</code>.
        </div>
      ) : (
        <div className="space-y-2">
          {roots.map((root) => (
            <div
              key={root.path}
              className="rounded-xl bg-[var(--bg-card)] border border-[var(--border-subtle)] p-3 flex items-start justify-between gap-3"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span
                    className={`px-2 py-0.5 text-[10px] font-medium rounded-full border ${KIND_STYLES[root.kind]}`}
                  >
                    {KIND_LABELS[root.kind]}
                  </span>
                  <span className="text-xs font-medium text-[var(--text-primary)] truncate">
                    {root.label}
                  </span>
                  {!root.exists && (
                    <span className="px-2 py-0.5 text-[10px] font-medium rounded-full border border-[var(--accent-amber)] text-[var(--accent-amber)]">
                      not found
                    </span>
                  )}
                </div>
                <div className="text-[10px] text-text-secondary font-mono break-all">
                  {root.path}
                </div>
              </div>
              <div className="text-right shrink-0">
                <div className="text-lg font-semibold text-[var(--text-primary)] tabular-nums leading-none">
                  {root.jsonl_file_count}
                </div>
                <div className="text-[10px] text-text-secondary mt-1">files</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {settings?.is_windows && (
        <div className="mt-4 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="text-xs font-medium text-[var(--text-primary)]">
              Scan WSL distributions
            </div>
            <div className="text-[10px] text-text-secondary leading-relaxed">
              Looks for <code>.claude</code> in every installed distribution.
              Reading the share wakes a stopped distribution.
            </div>
          </div>
          <button
            onClick={handleToggleWsl}
            disabled={busy || overrideActive}
            title={overrideActive ? 'A custom folder is in use' : undefined}
            className={`shrink-0 w-11 h-6 rounded-full transition-colors relative disabled:opacity-30 disabled:cursor-not-allowed ${
              settings.wsl_scan_enabled
                ? 'bg-accent-purple/40'
                : 'bg-[var(--border-subtle)]'
            }`}
          >
            <span
              className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all ${
                settings.wsl_scan_enabled ? 'left-[22px]' : 'left-0.5'
              }`}
            />
          </button>
        </div>
      )}

      <div className="mt-4 pt-4 border-t border-[var(--border-subtle)]">
        <div className="text-xs font-medium text-[var(--text-primary)] mb-1">
          Custom folder
        </div>
        <div className="text-[10px] text-text-secondary leading-relaxed mb-2">
          Overrides detection and reads only this <code>.claude</code> folder.
          Leave it empty to go back to automatic detection. Live watching of a
          new folder starts after the app is restarted.
        </div>
        <div className="flex gap-2">
          <input
            value={overrideDraft}
            onChange={(e) => setOverrideDraft(e.target.value)}
            spellCheck={false}
            placeholder="\\wsl.localhost\Ubuntu\home\user\.claude"
            className="flex-1 min-w-0 px-3 py-1.5 text-xs font-mono rounded-full
              bg-[var(--bg-card)] border border-[var(--border-subtle)]
              text-[var(--text-primary)] placeholder:text-text-secondary/50
              focus:outline-none focus:border-accent-purple/40"
          />
          <button
            onClick={handleSaveOverride}
            disabled={busy || !overrideDirty}
            className="px-4 py-1.5 text-xs font-medium rounded-full transition-colors shrink-0
              bg-accent-purple/10 text-accent-purple border border-accent-purple/20
              hover:bg-accent-purple/20
              disabled:opacity-30 disabled:cursor-not-allowed"
          >
            Save
          </button>
          {overrideActive && (
            <button
              onClick={() => {
                setOverrideDraft('');
                setJsonlDirectoryOverride(null)
                  .then(() => reimportFromSources('Back to automatic detection'))
                  .catch((err) =>
                    toast('Could not clear the folder: ' + String(err), 'error'),
                  );
              }}
              disabled={busy}
              className="px-4 py-1.5 text-xs font-medium rounded-full transition-colors shrink-0
                text-text-secondary border border-[var(--border-subtle)]
                hover:text-[var(--text-primary)]
                disabled:opacity-30 disabled:cursor-not-allowed"
            >
              Clear
            </button>
          )}
        </div>
      </div>
    </GlassCard>
  );
}
