import type { Metadata } from "next";
import Link from "next/link";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { changelog, site } from "@/data/site";

export const metadata: Metadata = {
  title: "Changelog",
  description: `What shipped in each ClaudeLens release, starting with v${site.version}.`,
};

export default function ChangelogPage() {
  return (
    <div className="mesh-bg min-h-svh">
      <SiteHeader />

      <main className="px-6 py-14">
        <div className="mx-auto max-w-2xl">
          <p className="font-mono text-[11px] tracking-[0.18em] text-muted uppercase">
            Changelog
          </p>
          <h1 className="mt-4 text-[clamp(2rem,5vw,3rem)] leading-[1.02] font-semibold tracking-[-0.035em] text-fg">
            What shipped, and when.
          </h1>
          <p className="mt-5 text-[16px] leading-relaxed text-muted">
            Every release is built from a tag on{" "}
            <a href={site.repo} className="text-fg underline decoration-dotted">
              GitHub
            </a>{" "}
            and published on the{" "}
            <a href={site.releases} className="text-fg underline decoration-dotted">
              Releases page
            </a>{" "}
            with installers for all three platforms.
          </p>

          <ol className="mt-12 space-y-12">
            {changelog.map((entry) => (
              <li key={entry.version}>
                <div className="flex items-baseline gap-3 border-t border-line pt-5">
                  <h2 className="font-mono text-[15px] font-medium text-cyan">
                    v{entry.version}
                  </h2>
                  <time className="font-mono text-[11px] text-muted tabular-nums">
                    {entry.date}
                  </time>
                </div>
                <p className="mt-3 text-[17px] font-semibold tracking-tight text-fg">
                  {entry.heading}
                </p>
                <ul className="mt-4 space-y-2.5">
                  {entry.changes.map((change) => (
                    <li
                      key={change}
                      className="flex gap-3 text-[15px] leading-relaxed text-muted"
                    >
                      <span
                        aria-hidden
                        className="mt-[9px] h-1 w-1 shrink-0 rounded-full bg-cyan"
                      />
                      {change}
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ol>

          <p className="mt-12 font-mono text-[11px] text-muted">
            <Link href="/" className="underline decoration-dotted hover:text-fg">
              Back to the overview
            </Link>
          </p>
        </div>
      </main>

      <SiteFooter />
    </div>
  );
}
