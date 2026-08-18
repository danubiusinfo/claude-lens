"use client";

import { useSyncExternalStore } from "react";

/**
 * Browser-only values read the React 19 way: a store snapshot rather than
 * state written from an effect. Each has a server snapshot so the exported HTML
 * and the first client render agree.
 */

function subscribeToQuery(query: string) {
  return (onChange: () => void) => {
    const media = window.matchMedia(query);
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  };
}

export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    subscribeToQuery(query),
    () => window.matchMedia(query).matches,
    () => false,
  );
}

export function usePrefersReducedMotion(): boolean {
  return useMediaQuery("(prefers-reduced-motion: reduce)");
}

/* ── Appearance ──────────────────────────────────────────────── */

export type ThemeMode = "light" | "dark" | "system";

const THEME_KEY = "cl-theme";
const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((listener) => listener());
}

function subscribeToTheme(onChange: () => void) {
  listeners.add(onChange);
  // Keep other tabs in step.
  window.addEventListener("storage", onChange);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener("storage", onChange);
  };
}

function readTheme(): ThemeMode {
  try {
    const stored = localStorage.getItem(THEME_KEY);
    if (stored === "light" || stored === "dark" || stored === "system") {
      return stored;
    }
  } catch {
    // Private mode with storage blocked: fall through to the default.
  }
  return "system";
}

export function useThemeMode(): ThemeMode {
  return useSyncExternalStore(subscribeToTheme, readTheme, () => "system");
}

/**
 * Records the preference and wakes every subscriber. Applying it to <html> is
 * the toggle's effect job, so there is one writer for that class.
 */
export function setThemeMode(mode: ThemeMode) {
  try {
    localStorage.setItem(THEME_KEY, mode);
  } catch {
    // A failed write only costs persistence across reloads.
  }
  notify();
}
