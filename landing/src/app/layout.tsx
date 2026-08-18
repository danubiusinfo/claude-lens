import type { Metadata, Viewport } from "next";
import { Schibsted_Grotesk, IBM_Plex_Mono } from "next/font/google";
import { asset } from "@/lib/assets";
import { site } from "@/data/site";
import "./globals.css";

const display = Schibsted_Grotesk({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-schibsted",
});

const mono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  display: "swap",
  variable: "--font-plex-mono",
});

export const metadata: Metadata = {
  // Absolute URLs for the social preview tags. Point NEXT_PUBLIC_SITE_URL at
  // the real domain at build time; the fallback affects metadata only.
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_SITE_URL || "https://danubiusinfo.github.io/claude-lens",
  ),
  title: {
    default: `${site.name} — read your Claude Code history`,
    template: `%s — ${site.name}`,
  },
  description:
    "A local-first desktop app that turns the Claude Code transcripts in ~/.claude into tokens, cost, working time and a searchable session history. macOS, Windows and Linux.",
  applicationName: site.name,
  keywords: [
    "Claude Code",
    "token usage",
    "developer tools",
    "local-first",
    "Tauri",
    "desktop app",
  ],
  icons: { icon: asset("/favicon.png"), apple: asset("/app-icon.png") },
  openGraph: {
    title: `${site.name} — read your Claude Code history`,
    description:
      "Tokens, cost, working time and every session Claude Code ever wrote to disk. Local-first, no account, no telemetry.",
    siteName: site.name,
    type: "website",
    images: [{ url: "/app-icon.png", width: 512, height: 512, alt: `${site.name} icon` }],
  },
  twitter: { card: "summary_large_image" },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#161618" },
    { media: "(prefers-color-scheme: light)", color: "#f2f2f7" },
  ],
};

/* Runs before first paint: applies the stored appearance without a flash and
   marks the document as scripted, which enables the scroll reveals. */
const themeScript = `(function(){try{var m=localStorage.getItem("cl-theme")||"system";var l=m==="light"||(m==="system"&&window.matchMedia("(prefers-color-scheme: light)").matches);var r=document.documentElement;r.classList.add("js");r.classList.toggle("light",l);}catch(e){}})();`;

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    // The theme script below writes `light` onto <html> before React
    // hydrates, so the class attribute is expected to differ.
    <html
      lang="en"
      className={`${display.variable} ${mono.variable}`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-svh antialiased">{children}</body>
    </html>
  );
}
