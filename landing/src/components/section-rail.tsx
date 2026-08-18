"use client";

import { useEffect, useState } from "react";
import { rail } from "@/data/site";

/**
 * A copy of the app's sidebar, used as the page's spine: the stops are the
 * screens you get after installing, so scrolling the page walks the product.
 */
export function SectionRail() {
  const [active, setActive] = useState<string>(rail[0].id);

  useEffect(() => {
    const sections = rail
      .map((item) => document.getElementById(item.id))
      .filter((node): node is HTMLElement => node !== null);

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (visible) setActive(visible.target.id);
      },
      { rootMargin: "-45% 0px -45% 0px" },
    );

    sections.forEach((node) => observer.observe(node));
    return () => observer.disconnect();
  }, []);

  return (
    <nav
      aria-label="Page sections"
      // Only shown from 2xl up: below that the rail would sit on top of the
      // centred content column.
      className="liquid-glass fixed top-1/2 left-5 z-40 hidden -translate-y-1/2 flex-col gap-0.5 p-2 2xl:flex"
    >
      {rail.map((item) => (
        <a
          key={item.id}
          href={`#${item.id}`}
          aria-current={active === item.id ? "true" : undefined}
          className={`relative z-10 rounded-[10px] px-3 py-[7px] font-mono text-[11px] tracking-tight transition-colors ${
            active === item.id
              ? "bg-card-hover text-fg"
              : "text-muted hover:bg-card hover:text-fg"
          }`}
        >
          {item.label}
        </a>
      ))}
    </nav>
  );
}
