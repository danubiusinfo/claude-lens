import Link from "next/link";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";

export default function NotFound() {
  return (
    <div className="mesh-bg flex min-h-svh flex-col">
      <SiteHeader />
      <main className="flex flex-1 items-center px-6 py-20">
        <div className="mx-auto max-w-md">
          <p className="font-mono text-[11px] tracking-[0.18em] text-muted uppercase">
            404
          </p>
          <h1 className="mt-4 text-[clamp(1.75rem,4vw,2.5rem)] leading-tight font-semibold tracking-[-0.03em] text-fg">
            That page isn&rsquo;t here.
          </h1>
          <p className="mt-4 text-[15px] leading-relaxed text-muted">
            Check the address, or head back to the overview.
          </p>
          <Link
            href="/"
            className="mt-7 inline-block rounded-full border border-cyan/40 bg-cyan/12 px-5 py-2.5 font-mono text-[12px] text-fg transition-colors hover:bg-cyan/20"
          >
            Back to the overview
          </Link>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
