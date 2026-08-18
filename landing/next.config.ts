import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The site ships as plain files: `npm run build` writes ./out, which any
  // static host (GitHub Pages, S3, nginx) can serve without a Node runtime.
  output: "export",
  images: { unoptimized: true },
  // Directory-style URLs (/privacy/index.html) so hosts without rewrite rules
  // resolve every route.
  trailingSlash: true,
  // Set NEXT_PUBLIC_BASE_PATH=/claude-lens when hosting under a subpath,
  // e.g. GitHub Pages project sites.
  basePath: process.env.NEXT_PUBLIC_BASE_PATH || undefined,
};

export default nextConfig;
