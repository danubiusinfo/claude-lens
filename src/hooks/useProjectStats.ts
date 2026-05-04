import { useState, useEffect, useCallback } from 'react';
import type { ProjectStats } from '../types';
import { getProjectStats } from '../lib/tauri';
import { useTauriEvent } from './useTauriEvent';

interface ProjectStatsData {
  projects: ProjectStats[];
  loading: boolean;
  error: string | null;
}

export function useProjectStats(limit = 10): ProjectStatsData {
  const [projects, setProjects] = useState<ProjectStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetch = useCallback(async () => {
    try {
      const data = await getProjectStats(limit);
      setProjects(data);
      setError(null);
    } catch (err) {
      console.error('Failed to fetch project stats:', err);
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [limit]);

  useEffect(() => {
    setLoading(true);
    fetch();
  }, [fetch]);

  useTauriEvent('db-updated', fetch);

  return { projects, loading, error };
}
