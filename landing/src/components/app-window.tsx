"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { usePrefersReducedMotion } from "@/lib/client-state";
import { asset } from "@/lib/assets";
import { demo } from "@/data/site";
import {
  formatCost,
  formatDuration,
  formatTokens,
  sparklinePath,
} from "@/lib/format";

/* ── Small pieces ────────────────────────────────────────────── */

/** Counts up once, after `delay`, with a cubic ease-out. */
function useCount(target: number, delay: number, duration = 1100) {
  const reduced = usePrefersReducedMotion();
  const [value, setValue] = useState(0);

  useEffect(() => {
    if (reduced) return;

    let frame = 0;
    let startedAt = 0;

    const timer = window.setTimeout(() => {
      const tick = (now: number) => {
        if (!startedAt) startedAt = now;
        const progress = Math.min((now - startedAt) / duration, 1);
        setValue(target * (1 - Math.pow(1 - progress, 3)));
        if (progress < 1) frame = requestAnimationFrame(tick);
      };
      frame = requestAnimationFrame(tick);
    }, delay);

    return () => {
      window.clearTimeout(timer);
      cancelAnimationFrame(frame);
    };
  }, [target, delay, duration, reduced]);

  return reduced ? target : value;
}

function Sparkline({
  values,
  color,
  delay,
}: {
  values: readonly number[];
  color: string;
  delay: number;
}) {
  const path = sparklinePath(values, 200, 44);

  return (
    <svg
      viewBox="0 0 200 48"
      preserveAspectRatio="none"
      className="h-full w-full"
      aria-hidden
    >
      <defs>
        <linearGradient id={`fill-${color.replace(/\W/g, "")}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.22" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path
        d={`${path} L 200 48 L 0 48 Z`}
        fill={`url(#fill-${color.replace(/\W/g, "")})`}
        className="opacity-0 [animation:rise_0.8s_ease-out_both]"
        style={{ animationDelay: `${delay + 300}ms` }}
      />
      <path
        d={path}
        fill="none"
        stroke={color}
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeDasharray="400"
        style={{
          animation: "draw 1.4s cubic-bezier(0.4,0,0.2,1) both",
          animationDelay: `${delay}ms`,
          ["--dash" as string]: "400",
        }}
      />
    </svg>
  );
}

const LEVEL_OPACITY = [0, 0.28, 0.5, 0.75, 1];

function Heatmap() {
  const cells = demo.heatmap.split("").map(Number);
  const weeks = Math.floor(cells.length / 7);

  return (
    <div
      className="grid gap-[2px] sm:gap-[3px]"
      style={{
        gridTemplateRows: "repeat(7, minmax(0, 1fr))",
        gridAutoFlow: "column",
        gridAutoColumns: "minmax(0, 1fr)",
      }}
      aria-hidden
    >
      {cells.slice(0, weeks * 7).map((level, index) => (
        <span
          key={index}
          className="aspect-square rounded-[2px] opacity-0"
          style={{
            background:
              level === 0
                ? "var(--heatmap-empty)"
                : `color-mix(in srgb, var(--accent-cyan) ${LEVEL_OPACITY[level] * 100}%, transparent)`,
            animation: "cell-in 0.35s ease-out both",
            animationDelay: `${900 + Math.floor(index / 7) * 9}ms`,
          }}
        />
      ))}
    </div>
  );
}

/* ── Window chrome ───────────────────────────────────────────── */

const NAV = [
  { label: "Dashboard", active: true },
  { label: "Sessions", active: false },
  { label: "Plans", active: false },
  { label: "Settings", active: false },
];

const RANGES = ["Today", "Work Week", "7d", "30d", "All"];

export function AppWindow() {
  const tokens = useCount(demo.tokensTotal, 620);
  const cost = useCount(demo.costUsd, 720);
  const work = useCount(demo.workSeconds, 820);
  const sessions = useCount(demo.sessions, 900, 800);

  return (
    <figure className="rise" style={{ animationDelay: "120ms" }}>
      <figcaption className="sr-only">
        The ClaudeLens dashboard: a summary of tokens, spend, working time and
        session count for the selected range, a daily activity heatmap, and a
        per-project token breakdown.
      </figcaption>

      <div
        aria-hidden
        className="font-system overflow-hidden rounded-[14px] border border-[var(--glass-border)] shadow-[0_40px_120px_-30px_rgba(0,0,0,0.7)]"
      >
        {/* Title bar */}
        <div className="mesh-bg flex h-8 items-center gap-2 border-b border-[var(--border-subtle)] px-3">
          <span className="h-[11px] w-[11px] rounded-full bg-[#ff5f57]" />
          <span className="h-[11px] w-[11px] rounded-full bg-[#febc2e]" />
          <span className="h-[11px] w-[11px] rounded-full bg-[#28c840]" />
        </div>

        <div className="mesh-bg flex">
          {/* Sidebar */}
          <aside className="liquid-glass hidden w-[164px] shrink-0 flex-col !rounded-none border-0 border-r py-2 sm:flex">
            <div className="relative z-10 flex items-center gap-2 px-3 pb-3">
              <Image
                src={asset("/app-icon.png")}
                alt=""
                width={18}
                height={18}
                className="h-[18px] w-[18px]"
              />
              <span className="text-[12px] font-semibold text-fg">ClaudeLens</span>
            </div>

            <nav className="relative z-10 flex flex-1 flex-col gap-0.5 px-2">
              {NAV.map((item, index) => (
                <span
                  key={item.label}
                  className={`rise rounded-[10px] px-2.5 py-[6px] text-[12px] font-medium ${
                    item.active ? "bg-card-hover text-fg" : "text-muted"
                  }`}
                  style={{ animationDelay: `${260 + index * 60}ms` }}
                >
                  {item.label}
                </span>
              ))}
            </nav>

            <div className="relative z-10 flex items-center justify-between px-3 pt-3">
              <span className="text-[9px] text-muted">Updated 2m ago</span>
              <svg
                className="h-3 w-3 text-muted"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              >
                <polyline points="23 4 23 10 17 10" />
                <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
              </svg>
            </div>
          </aside>

          {/* Content */}
          <div className="min-w-0 flex-1 space-y-3 p-3 sm:p-4">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <h3 className="text-[15px] font-semibold text-fg">Dashboard</h3>
                <span className="flex items-center gap-1 rounded-full border border-[var(--border-subtle)] px-2 py-[2px] text-[9px] text-muted">
                  <span className="h-1.5 w-1.5 rounded-full bg-mint" />
                  2 sources
                </span>
              </div>
              <div className="hidden items-center gap-0.5 rounded-full border border-[var(--border-subtle)] bg-card p-[2px] md:flex">
                {RANGES.map((range) => (
                  <span
                    key={range}
                    className={`rounded-full px-2 py-[2px] text-[9px] ${
                      range === "Work Week"
                        ? "bg-card-hover text-fg shadow-sm"
                        : "text-muted"
                    }`}
                  >
                    {range}
                  </span>
                ))}
              </div>
            </div>

            {/* Bento summary */}
            <div className="grid grid-cols-2 gap-2.5 md:grid-cols-4">
              {/* Tokens — spans two columns, like the app */}
              <div
                className="glass-card glow-cyan rise col-span-2 flex flex-col justify-between overflow-hidden p-3"
                style={{ animationDelay: "360ms" }}
              >
                <span className="text-[10px] font-medium text-muted">Tokens</span>
                <div className="mt-1 flex items-end justify-between gap-3">
                  <div>
                    <div className="text-xl font-bold tracking-tight text-cyan tabular-nums sm:text-2xl">
                      {formatTokens(tokens)}
                    </div>
                    <div className="mt-1 flex gap-2 text-[9px] text-muted">
                      <span>↑ {formatTokens(demo.tokensIn)}</span>
                      <span>↓ {formatTokens(demo.tokensOut)}</span>
                      <span>Cache {formatTokens(demo.cacheRead)}</span>
                    </div>
                  </div>
                  <div className="h-10 w-24 shrink-0 sm:w-32">
                    <Sparkline
                      values={demo.sparkline}
                      color="var(--accent-cyan)"
                      delay={700}
                    />
                  </div>
                </div>
              </div>

              <div
                className="glass-card glow-violet rise flex flex-col justify-between p-3"
                style={{ animationDelay: "440ms" }}
              >
                <span className="text-[10px] font-medium text-muted">Total cost</span>
                <div className="text-xl font-bold tracking-tight text-violet tabular-nums">
                  {formatCost(cost)}
                </div>
              </div>

              <div
                className="glass-card glow-mint rise relative flex flex-col justify-between p-3"
                style={{ animationDelay: "520ms" }}
              >
                <div className="pointer-events-none absolute inset-x-0 bottom-0 h-[48%] opacity-55">
                  <Sparkline
                    values={demo.sparkline}
                    color="var(--accent-green)"
                    delay={820}
                  />
                </div>
                <span className="relative text-[10px] font-medium text-muted">
                  Working time
                </span>
                <div className="relative">
                  <div className="text-xl font-bold tracking-tight text-mint tabular-nums">
                    {formatDuration(work)}
                  </div>
                  <div className="mt-0.5 text-[9px] text-muted tabular-nums">
                    {Math.round(sessions)} sessions
                  </div>
                </div>
              </div>
            </div>

            {/* Heatmap */}
            <div
              className="glass-card rise overflow-hidden p-3"
              style={{ animationDelay: "600ms" }}
            >
              <div className="mb-2 flex items-center justify-between">
                <span className="text-[10px] font-medium text-muted">
                  Daily activity
                </span>
                <span className="text-[9px] text-muted">Last 52 weeks</span>
              </div>
              <div className="overflow-hidden">
                <Heatmap />
              </div>
            </div>

            {/* Projects */}
            <div
              className="glass-card rise p-3"
              style={{ animationDelay: "680ms" }}
            >
              <span className="text-[10px] font-medium text-muted">By project</span>
              <ul className="mt-2 space-y-1.5">
                {demo.projects.map((project, index) => (
                  <li key={project.name} className="flex items-center gap-2">
                    <span className="w-28 shrink-0 truncate text-[10px] text-fg sm:w-40">
                      {project.name}
                    </span>
                    <span className="h-1 flex-1 overflow-hidden rounded-full bg-[var(--heatmap-empty)]">
                      <span
                        className="block h-full rounded-full bg-cyan/60"
                        style={{
                          width: `${project.share}%`,
                          animation: "rise 0.7s ease-out both",
                          animationDelay: `${760 + index * 70}ms`,
                        }}
                      />
                    </span>
                    <span className="w-12 shrink-0 text-right text-[10px] text-muted tabular-nums">
                      {project.tokens}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </div>
    </figure>
  );
}
