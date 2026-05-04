import { useState, useEffect, useCallback } from 'react';
import type { SourceStatusInfo } from '../types';
import { getSourceStatus } from '../lib/tauri';
import { useTauriEvent } from './useTauriEvent';

export function useSourceStatus() {
  const [status, setStatus] = useState<SourceStatusInfo | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchStatus = useCallback(() => {
    getSourceStatus()
      .then(setStatus)
      .catch((err) => setError(String(err)));
  }, []);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  useTauriEvent('db-updated', fetchStatus);

  return { status, error, refresh: fetchStatus };
}
