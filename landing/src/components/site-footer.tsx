import Image from "next/image";
import Link from "next/link";
import { asset } from "@/lib/assets";
import { site } from "@/data/site";

export function SiteFooter() {
  return (
    <footer className="mt-24 border-t border-line px-6 py-10">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
        <div className="max-w-sm">
          <div className="flex items-center gap-2">
            <Image
              src={asset("/app-icon.png")}
              alt=""
              width={20}
              height={20}
              className="h-5 w-5"
            />
            <span className="text-[14px] font-semibold text-fg">{site.name}</span>
            <span className="font-mono text-[10px] text-muted">v{site.version}</span>
          </div>
          <p className="mt-3 text-[13px] leading-relaxed text-muted">
            Built by{" "}
            <a href={site.maker.url} className="text-fg underline decoration-dotted">
              {site.maker.name}
            </a>
            . Not affiliated with Anthropic — ClaudeLens only reads the files
            Claude Code writes on your own machine.
          </p>
        </div>

        <nav className="grid grid-cols-2 gap-x-10 gap-y-2 font-mono text-[11px] sm:grid-cols-2">
          <a href={site.repo} className="text-muted hover:text-fg">
            GitHub
          </a>
          <a href={site.releases} className="text-muted hover:text-fg">
            Releases
          </a>
          <a href={site.installDocs} className="text-muted hover:text-fg">
            Install guide
          </a>
          <Link href="/changelog" className="text-muted hover:text-fg">
            Changelog
          </Link>
          <Link href="/privacy" className="text-muted hover:text-fg">
            Privacy
          </Link>
          <a href={site.maker.url} className="text-muted hover:text-fg">
            danubius.io
          </a>
        </nav>
      </div>
    </footer>
  );
}
