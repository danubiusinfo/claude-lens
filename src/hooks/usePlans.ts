import { useState, useEffect, useCallback } from 'react';
import { listPlans, readPlan } from '../lib/tauri';
import { useTauriEvent } from './useTauriEvent';
import type { PlanEntry } from '../types';

interface SelectedPlan {
  entry: PlanEntry;
  content: string;
}

export interface PlansData {
  plans: PlanEntry[];
  loading: boolean;
  error: string | null;
  selectedPlan: SelectedPlan | null;
  selectPlan: (filename: string) => void;
  clearSelection: () => void;
  refresh: () => void;
}

export function usePlans(): PlansData {
  const [plans, setPlans] = useState<PlanEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedPlan, setSelectedPlan] = useState<SelectedPlan | null>(null);

  const fetchPlans = useCallback(async () => {
    setError(null);
    try {
      const result = await listPlans();
      setPlans(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPlans();
  }, [fetchPlans]);

  useTauriEvent('db-updated', fetchPlans);

  const selectPlan = useCallback(
    async (filename: string) => {
      const entry = plans.find((p) => p.filename === filename);
      if (!entry) return;

      try {
        const content = await readPlan(filename);
        setSelectedPlan({ entry, content });
      } catch (err) {
        console.error('Failed to read plan:', err);
      }
    },
    [plans]
  );

  const clearSelection = useCallback(() => {
    setSelectedPlan(null);
  }, []);

  return {
    plans,
    loading,
    error,
    selectedPlan,
    selectPlan,
    clearSelection,
    refresh: fetchPlans,
  };
}
