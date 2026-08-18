/**
 * Next prefixes routes and `_next/*` with `basePath` on its own, but two things
 * slip through: `next/image` sources when `images.unoptimized` is set, and the
 * icon entries in `metadata`. Both need the prefix applied by hand, or they 404
 * whenever the site is served from a subpath such as a GitHub Pages project site.
 */
export const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

export function asset(path: string): string {
  return `${basePath}${path}`;
}
