import { useState, useCallback } from 'react';
import { useTauriEvent } from './useTauriEvent';

export function useLastUpdated() {
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const handler = useCallback(() => {
    setLastUpdated(new Date());
  }, []);

  useTauriEvent('db-updated', handler);

  return lastUpdated;
}
