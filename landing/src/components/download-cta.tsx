"use client";

import { useSyncExternalStore } from "react";
import { site } from "@/data/site";

type Platform = "mac" | "windows" | "linux";

const LABELS: Record<Platform, string> = {
  mac: "macOS",
  windows: "Windows",
  linux: "Linux",
};

function detect(): Platform | null {
  const hinted = (
    navigator as Navigator & { userAgentData?: { platform?: string } }
  ).userAgentData?.platform;
  const source = `${hinted ?? ""} ${navigator.platform} ${navigator.userAgent}`.toLowerCase();

  if (source.includes("mac")) return "mac";
  if (source.includes("win")) return "windows";
  if (source.includes("linux") || source.includes("x11")) return "linux";
  return null;
}

/** The platform never changes while the page is open, so nothing to subscribe to. */
const noSubscribe = () => () => {};

export function DownloadCta() {
  // Null on the server and during hydration, so the exported HTML matches the
  // first client render; the real platform arrives right after.
  const platform = useSyncExternalStore<Platform | null>(
    noSubscribe,
    detect,
    () => null,
  );

  const others = (["mac", "windows", "linux"] as Platform[]).filter(
    (key) => key !== platform,
  );

  return (
    <div className="flex flex-col items-start gap-3">
      <a
        href={site.releases}
        className="group inline-flex items-center gap-3 rounded-full border border-cyan/40 bg-cyan/12 px-6 py-3 text-[15px] font-semibold text-fg transition-all hover:border-cyan/70 hover:bg-cyan/20"
      >
        <svg
          className="h-4 w-4 text-cyan"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
          <polyline points="7 10 12 15 17 10" />
          <line x1="12" y1="15" x2="12" y2="3" />
        </svg>
        {platform ? `Download for ${LABELS[platform]}` : "Download ClaudeLens"}
        <span className="font-mono text-[11px] font-normal text-muted">
          v{site.version}
        </span>
      </a>

      <p className="font-mono text-[11px] text-muted">
        {platform ? "Also on " : "Available for "}
        {others.map((key, index) => (
          <span key={key}>
            {index > 0 && <span className="opacity-50"> · </span>}
            <a href="#download" className="underline decoration-dotted hover:text-fg">
              {LABELS[key]}
            </a>
          </span>
        ))}
        <span className="opacity-50"> · </span>
        <a
          href={site.repo}
          className="underline decoration-dotted hover:text-fg"
        >
          Source
        </a>
      </p>
    </div>
  );
}
