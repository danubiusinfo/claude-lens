import Image from "next/image";
import Link from "next/link";
import { asset } from "@/lib/assets";
import { site } from "@/data/site";
import { ThemeToggle } from "./theme-toggle";

const LINKS = [
  { href: "/#features", label: "Features" },
  { href: "/#privacy", label: "Privacy" },
  { href: "/changelog", label: "Changelog" },
];

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-50 px-4 py-3">
      <div className="liquid-glass glass-topbar mx-auto flex max-w-6xl items-center gap-4 rounded-full px-4 py-2">
        <Link
          href="/"
          className="relative z-10 flex items-center gap-2 text-[14px] font-semibold tracking-tight text-fg"
        >
          <Image
            src={asset("/app-icon.png")}
            alt=""
            width={22}
            height={22}
            className="h-[22px] w-[22px]"
            priority
          />
          {site.name}
        </Link>

        <nav className="relative z-10 ml-auto hidden items-center gap-1 sm:flex">
          {LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="rounded-full px-3 py-1.5 font-mono text-[11px] text-muted transition-colors hover:bg-card hover:text-fg"
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="relative z-10 ml-auto flex items-center gap-2 sm:ml-0">
          <ThemeToggle />
          <a
            href={site.repo}
            className="grid h-7 w-7 place-items-center rounded-full text-muted transition-colors hover:bg-card hover:text-fg"
            aria-label="ClaudeLens on GitHub"
          >
            <svg className="h-4 w-4" viewBox="0 0 16 16" fill="currentColor" aria-hidden>
              <path d="M8 0a8 8 0 0 0-2.53 15.59c.4.07.55-.17.55-.38v-1.35c-2.22.48-2.69-1.07-2.69-1.07-.36-.93-.89-1.18-.89-1.18-.73-.5.05-.49.05-.49.8.06 1.23.83 1.23.83.71 1.22 1.87.87 2.33.67.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82a7.6 7.6 0 0 1 4 0c1.53-1.03 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.28.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48v2.2c0 .21.14.46.55.38A8 8 0 0 0 8 0Z" />
            </svg>
          </a>
          <a
            href={site.releases}
            className="hidden rounded-full border border-cyan/40 bg-cyan/12 px-3.5 py-1.5 font-mono text-[11px] font-medium text-fg transition-colors hover:bg-cyan/20 md:block"
          >
            Download
          </a>
        </div>
      </div>
    </header>
  );
}
