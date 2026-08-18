"use client";

import { useEffect } from "react";
import {
  setThemeMode,
  useMediaQuery,
  useThemeMode,
  type ThemeMode,
} from "@/lib/client-state";

/* The same three glyphs and the same three modes as the app's Settings screen. */
const MODES: { value: ThemeMode; glyph: string; label: string }[] = [
  { value: "light", glyph: "☀", label: "Light" },
  { value: "dark", glyph: "☾", label: "Dark" },
  { value: "system", glyph: "⚙", label: "System" },
];

export function ThemeToggle() {
  const mode = useThemeMode();
  const systemPrefersLight = useMediaQuery("(prefers-color-scheme: light)");

  // Resolve the appearance for every mode, not just "system". During hydration
  // the store still reports "system" for one commit, so a system-only branch
  // would wipe the class the pre-paint script just wrote.
  useEffect(() => {
    const light = mode === "light" || (mode === "system" && systemPrefersLight);
    document.documentElement.classList.toggle("light", light);
  }, [mode, systemPrefersLight]);

  return (
    <div
      role="radiogroup"
      aria-label="Appearance"
      className="flex items-center gap-0.5 rounded-full border border-line bg-card p-[2px]"
    >
      {MODES.map((option) => (
        <button
          key={option.value}
          role="radio"
          aria-checked={mode === option.value}
          aria-label={option.label}
          title={option.label}
          onClick={() => setThemeMode(option.value)}
          className={`grid h-6 w-6 place-items-center rounded-full text-[11px] transition-colors ${
            mode === option.value
              ? "bg-card-hover text-fg"
              : "text-muted hover:text-fg"
          }`}
        >
          <span aria-hidden>{option.glyph}</span>
        </button>
      ))}
    </div>
  );
}
