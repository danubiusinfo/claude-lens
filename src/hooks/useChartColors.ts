import { useSyncExternalStore } from 'react';

function subscribe(cb: () => void) {
  const observer = new MutationObserver(cb);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
  return () => observer.disconnect();
}

function getSnapshot() {
  return document.documentElement.classList.contains('light');
}

export function useChartColors() {
  const isLight = useSyncExternalStore(subscribe, getSnapshot);

  return {
    grid: isLight ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.04)',
    axis: isLight ? 'rgba(0,0,0,0.45)' : 'rgba(255,255,255,0.2)',
    axisSecondary: isLight ? 'rgba(0,0,0,0.30)' : 'rgba(255,255,255,0.15)',
    tooltipBg: isLight ? 'rgba(255,255,255,0.95)' : 'rgba(30,30,34,0.85)',
    tooltipBorder: isLight ? 'rgba(0,0,0,0.12)' : 'rgba(255,255,255,0.12)',
    tooltipText: isLight ? 'rgba(0,0,0,0.88)' : 'rgba(255,255,255,0.9)',
    tooltipShadow: isLight ? '0 4px 24px rgba(0,0,0,0.12)' : '0 4px 24px rgba(0,0,0,0.3)',
  };
}
