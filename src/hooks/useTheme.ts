import { useState, useCallback, useEffect } from 'react';
import { getThemeMode, saveThemeMode, applyTheme, type ThemeMode } from '../lib/theme';

export function useTheme() {
  const [mode, setMode] = useState<ThemeMode>(getThemeMode);

  const setTheme = useCallback((next: ThemeMode) => {
    saveThemeMode(next);
    setMode(next);
    applyTheme(next);
  }, []);

  // Apply on mount + listen for system preference changes
  useEffect(() => {
    applyTheme(mode);

    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = () => {
      if (mode === 'system') applyTheme('system');
    };
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, [mode]);

  return { mode, setTheme };
}
