import type { Metadata } from "next";
import Link from "next/link";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { site } from "@/data/site";

export const metadata: Metadata = {
  title: "Privacy",
  description:
    "ClaudeLens makes no network requests. It reads the Claude Code transcripts in ~/.claude and writes a SQLite database to ~/.claudelens. Nothing is uploaded.",
};

const FACTS = [
  {
    term: "What it reads",
    body: (
      <>
        <code>~/.claude/history.jsonl</code>, every transcript under{" "}
        <code>~/.claude/projects/</code>, and the markdown files in{" "}
        <code>~/.claude/plans/</code>. Read access only — ClaudeLens never
        modifies or deletes anything Claude Code wrote.
      </>
    ),
  },
  {
    term: "What it writes",
    body: (
      <>
        One SQLite database at <code>~/.claudelens/claudelens.db</code>, plus your
        theme and pricing settings in the same folder. Nothing else on your disk
        is touched.
      </>
    ),
  },
  {
    term: "What it sends",
    body: (
      <>
        Nothing. There is no server, no account, no sync, no analytics, no crash
        reporting and no update check. The app opens outbound links only when you
        click them: the GitHub repository, and{" "}
        <a href={site.maker.url}>danubius.io</a> from the About window.
      </>
    ),
  },
  {
    term: "Who can see your data",
    body: (
      <>
        Only you, and anyone who already has access to your machine. Your
        transcripts contain whatever you discussed with Claude Code, source code
        included — treat <code>~/.claudelens</code> with the same care as{" "}
        <code>~/.claude</code>.
      </>
    ),
  },
  {
    term: "How to remove it",
    body: (
      <>
        Uninstall the app and delete <code>~/.claudelens</code>. That is the
        complete footprint. Leave <code>~/.claude</code> alone — it belongs to
        Claude Code.
      </>
    ),
  },
  {
    term: "This website",
    body: (
      <>
        Static files with no cookies, no analytics and no third-party scripts.
        Fonts are served from this domain, so loading the page contacts no one
        but the host.
      </>
    ),
  },
];

export default function PrivacyPage() {
  return (
    <div className="mesh-bg min-h-svh">
      <SiteHeader />

      <main className="px-6 py-14">
        <article className="mx-auto max-w-2xl">
          <p className="font-mono text-[11px] tracking-[0.18em] text-muted uppercase">
            Privacy
          </p>
          <h1 className="mt-4 text-[clamp(2rem,5vw,3rem)] leading-[1.02] font-semibold tracking-[-0.035em] text-fg">
            No servers, so nothing to send.
          </h1>
          <p className="mt-5 text-[16px] leading-relaxed text-muted">
            ClaudeLens is a desktop app that reads files you already have. Here is
            exactly what it touches.
          </p>

          <dl className="mt-12 space-y-8">
            {FACTS.map((fact) => (
              <div key={fact.term} className="border-t border-line pt-5">
                <dt className="font-mono text-[12px] text-cyan">{fact.term}</dt>
                <dd className="mt-2 text-[15px] leading-relaxed text-muted [&_a]:text-fg [&_a]:underline [&_a]:decoration-dotted [&_code]:font-mono [&_code]:text-[13px] [&_code]:text-fg">
                  {fact.body}
                </dd>
              </div>
            ))}
          </dl>

          <p className="mt-12 font-mono text-[11px] text-muted">
            Last updated 2026-08-18 · v{site.version} ·{" "}
            <Link href="/" className="underline decoration-dotted hover:text-fg">
              Back to the overview
            </Link>
          </p>
        </article>
      </main>

      <SiteFooter />
    </div>
  );
}
