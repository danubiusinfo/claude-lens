import Link from "next/link";

import { AppWindow } from "@/components/app-window";
import { DownloadCta } from "@/components/download-cta";
import { PlanPreview, TranscriptPreview, WorklogPreview } from "@/components/previews";
import { Reveal } from "@/components/reveal";
import { SectionRail } from "@/components/section-rail";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { downloads, featureGroups, site, steps } from "@/data/site";

const ACCENT_TEXT: Record<string, string> = {
  cyan: "text-cyan",
  violet: "text-violet",
  mint: "text-mint",
  amber: "text-amber",
  teal: "text-teal",
};

const ACCENT_BORDER: Record<string, string> = {
  cyan: "border-cyan/30",
  violet: "border-violet/30",
  mint: "border-mint/30",
  amber: "border-amber/30",
  teal: "border-teal/30",
};

function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <p className="font-mono text-[11px] tracking-[0.18em] text-muted uppercase">
      {children}
    </p>
  );
}

export default function Home() {
  return (
    <div className="mesh-bg relative min-h-svh">
      <SiteHeader />
      <SectionRail />

      <main>
        {/* ── Hero ─────────────────────────────────────────────── */}
        <section id="dashboard" className="px-6 pt-10 pb-20 sm:pt-16">
          <div className="mx-auto max-w-6xl">
            <div className="max-w-3xl">
              <div className="rise">
                <Eyebrow>
                  Local-first desktop app · macOS · Windows · Linux
                </Eyebrow>
              </div>

              <h1
                className="rise mt-5 text-[clamp(2.25rem,6vw,4.25rem)] leading-[0.98] font-semibold tracking-[-0.035em] text-balance text-fg"
                style={{ animationDelay: "80ms" }}
              >
                Every Claude Code session you&rsquo;ve run,{" "}
                <span className="text-cyan">on one screen</span>.
              </h1>

              <p
                className="rise mt-6 max-w-2xl text-[17px] leading-relaxed text-muted"
                style={{ animationDelay: "160ms" }}
              >
                Claude Code already writes every transcript to{" "}
                <code className="font-mono text-[15px] text-fg">~/.claude</code>.
                ClaudeLens reads them and turns them into tokens, spend, working
                time and a searchable history — in a native app that keeps all of
                it on your machine.
              </p>

              <div className="rise mt-9" style={{ animationDelay: "240ms" }}>
                <DownloadCta />
              </div>

              <ul
                className="rise mt-9 flex flex-wrap gap-2 font-mono text-[11px] text-muted"
                style={{ animationDelay: "320ms" }}
              >
                {[
                  "No account",
                  "No network calls",
                  "Reads ~/.claude",
                  "Writes only ~/.claudelens",
                ].map((fact) => (
                  <li
                    key={fact}
                    className="rounded-full border border-line bg-card px-3 py-1"
                  >
                    {fact}
                  </li>
                ))}
              </ul>
            </div>

            <div className="mt-16">
              <AppWindow />
            </div>
          </div>
        </section>

        {/* ── How it works — a real sequence, so it gets numbers ─ */}
        <Reveal as="section" className="px-6 py-16">
          <div className="mx-auto max-w-6xl">
            <Eyebrow>How it works</Eyebrow>
            <ol className="mt-8 grid gap-6 sm:grid-cols-3">
              {steps.map((step, index) => (
                <li key={step.title} className="border-t border-line pt-5">
                  <span className="font-mono text-[11px] text-cyan tabular-nums">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <h3 className="mt-2 text-[17px] font-semibold tracking-tight text-fg">
                    {step.title}
                  </h3>
                  <p className="mt-2 text-[14px] leading-relaxed text-muted">
                    {step.body}
                  </p>
                </li>
              ))}
            </ol>
          </div>
        </Reveal>

        {/* ── Sessions ─────────────────────────────────────────── */}
        <Reveal as="section" id="sessions" className="px-6 py-16">
          <div className="mx-auto grid max-w-6xl items-center gap-10 lg:grid-cols-2 lg:gap-16">
            <div>
              <Eyebrow>Sessions</Eyebrow>
              <h2 className="mt-4 text-[clamp(1.75rem,3.5vw,2.75rem)] leading-[1.05] font-semibold tracking-[-0.03em] text-fg">
                Read back any conversation, turn by turn.
              </h2>
              <p className="mt-5 max-w-lg text-[15px] leading-relaxed text-muted">
                Every session Claude Code has written to disk, searchable and
                filterable by project. Open one and you get the whole transcript
                — your messages, Claude&rsquo;s replies, its thinking and every
                tool call — with the time each turn took.
              </p>
              <p className="mt-4 max-w-lg text-[15px] leading-relaxed text-muted">
                Star the ones worth returning to and rename them, so a week-old
                debugging session is still findable a month later.
              </p>
            </div>
            <TranscriptPreview />
          </div>
        </Reveal>

        {/* ── Plans and worklog ────────────────────────────────── */}
        <section className="px-6 py-16">
          <div className="mx-auto grid max-w-6xl gap-12 lg:grid-cols-2 lg:gap-16">
            <Reveal id="plans">
              <Eyebrow>Plans</Eyebrow>
              <h2 className="mt-4 text-[clamp(1.5rem,2.6vw,2rem)] leading-tight font-semibold tracking-[-0.03em] text-fg">
                The plans you approved, kept readable.
              </h2>
              <p className="mt-4 text-[15px] leading-relaxed text-muted">
                Claude Code drops plan files into{" "}
                <code className="font-mono text-[13px] text-fg">~/.claude/plans</code>
                . ClaudeLens lists them newest-first and renders the markdown in
                full — tables, task lists and code fences included.
              </p>
              <div className="mt-7">
                <PlanPreview />
              </div>
            </Reveal>

            <Reveal id="worklog" delay={80}>
              <Eyebrow>Worklog</Eyebrow>
              <h2 className="mt-4 text-[clamp(1.5rem,2.6vw,2rem)] leading-tight font-semibold tracking-[-0.03em] text-fg">
                How long it actually took.
              </h2>
              <p className="mt-4 text-[15px] leading-relaxed text-muted">
                Working time is wall clock, measured per turn: from your message
                to the end of Claude&rsquo;s last response. Tool execution is
                part of the work, so it counts; the time you spent reading the
                answer does not.
              </p>
              <div className="mt-7">
                <WorklogPreview />
              </div>
            </Reveal>
          </div>
        </section>

        {/* ── The full feature list ────────────────────────────── */}
        <section id="features" className="px-6 py-16">
          <div className="mx-auto max-w-6xl">
            <Reveal>
              <Eyebrow>Everything in the box</Eyebrow>
              <h2 className="mt-4 max-w-2xl text-[clamp(1.75rem,3.5vw,2.75rem)] leading-[1.05] font-semibold tracking-[-0.03em] text-fg">
                Six screens&rsquo; worth of features, listed in full.
              </h2>
            </Reveal>

            <div className="mt-12 space-y-10">
              {featureGroups.map((group, groupIndex) => (
                <Reveal key={group.id} delay={groupIndex * 40}>
                  <div className="grid gap-6 lg:grid-cols-[minmax(0,15rem)_1fr] lg:gap-10">
                    <div
                      className={`border-t-2 pt-4 lg:sticky lg:top-24 lg:self-start ${ACCENT_BORDER[group.accent]}`}
                    >
                      <h3
                        className={`text-[19px] font-semibold tracking-tight ${ACCENT_TEXT[group.accent]}`}
                      >
                        {group.title}
                      </h3>
                      <p className="mt-2 text-[13px] leading-relaxed text-muted">
                        {group.summary}
                      </p>
                    </div>

                    <ul className="grid gap-3 sm:grid-cols-2">
                      {group.items.map((item) => (
                        <li key={item.title} className="glass-card p-4">
                          <h4 className="text-[14px] font-semibold tracking-tight text-fg">
                            {item.title}
                          </h4>
                          <p className="mt-1.5 text-[13px] leading-relaxed text-muted">
                            {item.body}
                          </p>
                        </li>
                      ))}
                    </ul>
                  </div>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        {/* ── Privacy ──────────────────────────────────────────── */}
        <Reveal as="section" id="privacy" className="px-6 py-16">
          <div className="liquid-glass mx-auto max-w-6xl p-8 sm:p-12">
            <div className="relative z-10 grid gap-10 lg:grid-cols-[1fr_minmax(0,22rem)]">
              <div>
                <Eyebrow>Privacy</Eyebrow>
                <h2 className="mt-4 max-w-xl text-[clamp(1.75rem,3.5vw,2.75rem)] leading-[1.05] font-semibold tracking-[-0.03em] text-fg">
                  Your transcripts never leave the machine they were written on.
                </h2>
                <p className="mt-5 max-w-xl text-[15px] leading-relaxed text-muted">
                  There is no backend to send anything to. ClaudeLens reads the
                  JSONL files Claude Code already keeps, writes a SQLite database
                  next to them in your home directory, and makes no network
                  requests at all — no account, no sync, no analytics, no
                  crash reporting.
                </p>
                <Link
                  href="/privacy"
                  className="mt-6 inline-block font-mono text-[11px] text-cyan underline decoration-dotted"
                >
                  Read the full privacy note
                </Link>
              </div>

              <dl className="space-y-4 font-mono text-[12px]">
                {[
                  { term: "Reads", value: "~/.claude/history.jsonl\n~/.claude/projects/*/*.jsonl\n~/.claude/plans/*.md" },
                  { term: "Writes", value: "~/.claudelens/claudelens.db" },
                  { term: "Sends", value: "nothing" },
                ].map((row) => (
                  <div key={row.term} className="border-t border-line pt-3">
                    <dt className="text-muted">{row.term}</dt>
                    <dd className="mt-1 whitespace-pre-line text-fg">{row.value}</dd>
                  </div>
                ))}
              </dl>
            </div>
          </div>
        </Reveal>

        {/* ── Download ─────────────────────────────────────────── */}
        <Reveal as="section" id="download" className="px-6 py-16">
          <div className="mx-auto max-w-6xl">
            <Eyebrow>Download · v{site.version}</Eyebrow>
            <h2 className="mt-4 max-w-2xl text-[clamp(1.75rem,3.5vw,2.75rem)] leading-[1.05] font-semibold tracking-[-0.03em] text-fg">
              One installer, then it finds your history by itself.
            </h2>

            <div className="mt-10 grid gap-4 md:grid-cols-3">
              {downloads.map((item) => (
                <a
                  key={item.key}
                  href={site.releases}
                  className="glass-card group flex flex-col p-5 transition-colors hover:bg-card-hover"
                >
                  <span className="text-[16px] font-semibold tracking-tight text-fg">
                    {item.os}
                  </span>
                  <span className="mt-1 text-[13px] text-muted">{item.detail}</span>
                  <code className="mt-4 block break-all font-mono text-[11px] text-cyan">
                    {item.file.replace("<version>", site.version)}
                  </code>
                  <span className="mt-4 border-t border-line pt-3 font-mono text-[10px] leading-relaxed text-muted">
                    {item.note}
                  </span>
                  <span className="mt-4 font-mono text-[11px] text-fg">
                    Get it on Releases →
                  </span>
                </a>
              ))}
            </div>

            <p className="mt-6 max-w-2xl text-[13px] leading-relaxed text-muted">
              The builds are not code-signed yet, so macOS and Windows both warn
              on first launch. The{" "}
              <a
                href={site.installDocs}
                className="text-fg underline decoration-dotted"
              >
                install guide
              </a>{" "}
              has the exact steps per platform, and the{" "}
              <a href={site.repo} className="text-fg underline decoration-dotted">
                source
              </a>{" "}
              is there if you would rather build it yourself.
            </p>
          </div>
        </Reveal>
      </main>

      <SiteFooter />
    </div>
  );
}
