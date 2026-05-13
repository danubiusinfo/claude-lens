import { useState, useEffect, useCallback } from 'react';
import type { SessionContextStats } from '../types';
import { getSessionContextStats } from '../lib/tauri';
import { useTauriEvent } from './useTauriEvent';

interface SessionContextData {
  stats: SessionContextStats | null;
  loading: boolean;
  error: string | null;
}

export function useSessionContext(sourceSessionId: string | null): SessionContextData {
  const [stats, setStats] = useState<SessionContextStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetch = useCallback(async () => {
    if (!sourceSessionId) {
      setStats(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const data = await getSessionContextStats(sourceSessionId);
      setStats(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [sourceSessionId]);

  useEffect(() => { fetch(); }, [fetch]);

  const handleDbUpdate = useCallback(() => { fetch(); }, [fetch]);
  useTauriEvent('db-updated', handleDbUpdate);

  return { stats, loading, error };
}
