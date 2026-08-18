# ClaudeLens landing page

Marketing site for the app in this repository. Next.js 16 (App Router) +
Tailwind v4, exported as static files.

It is a self-contained npm project: run every command below from `landing/`.
The root `package.json` is the Tauri app and knows nothing about this one.

## Develop

```bash
npm install
npm run dev          # http://localhost:3000
```

## Build

```bash
npm run build        # writes ./out — plain HTML, CSS, JS and images
npx serve out        # preview the exported site
```

There is no server runtime: `output: "export"` in `next.config.ts` means any
static host will do.

## Deploy to GitHub Pages

`.github/workflows/deploy-landing.yml` (at the repository root, where Actions
looks for workflows) builds and publishes on every push to `main` that touches
`landing/**`.

Two things had to be true once, before the first successful run:

- **The repository is public.** GitHub Pages only serves private repositories on
  Enterprise Cloud.
- **The Pages site exists with `build_type: workflow`.** Set it under
  **Settings → Pages → Build and deployment → Source: GitHub Actions**, or over
  the API with an admin token:
  ```bash
  gh api -X POST repos/danubiusinfo/claude-lens/pages -f build_type=workflow
  ```
  The workflow cannot do this for you: `GITHUB_TOKEN` may deploy to an existing
  site, but creating one needs admin rights, so `configure-pages` with
  `enablement: true` fails with *Resource not accessible by integration*.

The workflow reads the site URL from `actions/configure-pages`, so it works
unchanged for this project site (`/claude-lens`), an organisation site, or a
custom domain — no config edit when the address changes. The app's own `ci.yml`
ignores `landing/**`, so copy changes don't trigger installer builds.

### Building for a subpath by hand

```bash
NEXT_PUBLIC_BASE_PATH=/claude-lens \
NEXT_PUBLIC_SITE_URL=https://danubiusinfo.github.io/claude-lens \
  npm run build
```

`NEXT_PUBLIC_BASE_PATH` must start with `/` and must not end with one; leave it
unset for a domain root. `NEXT_PUBLIC_SITE_URL` only affects the absolute URLs
in the Open Graph tags.

Anything referenced by an absolute path has to go through `asset()` from
`src/lib/assets.ts`. Next prefixes routes and `_next/*` itself, but not
`next/image` sources (with `images.unoptimized`) or `metadata.icons`.

## Where things live

| Path | What it holds |
|---|---|
| `src/data/site.ts` | All copy that repeats: version, links, the feature list, download files, changelog, and the sample numbers behind the hero dashboard. Edit content here, not in the components. |
| `src/app/globals.css` | Design tokens copied verbatim from `../src/index.css`, plus the `liquid-glass`, `glass-card` and `mesh-bg` treatments. The app is the source of truth — port changes from there. |
| `src/components/app-window.tsx` | The hero's live dashboard: a CSS/SVG recreation of the real Dashboard screen, not a screenshot, so it stays sharp and follows the theme. |
| `src/components/previews.tsx` | The same idea for the Sessions, Plans and Worklog screens. |
| `src/lib/client-state.ts` | Appearance preference and media queries, read through `useSyncExternalStore`. |

## Conventions worth knowing

- **Custom CSS lives in `@layer base` / `@layer components`** so Tailwind
  utilities always win. Without the layers, `.liquid-glass { position: relative }`
  silently beats `fixed` and `sticky`.
- **Dark is the default.** `.light` on `<html>` flips every token. An inline
  script in `layout.tsx` applies the stored preference before first paint and
  adds a `js` class, which is what enables the scroll reveals — with scripting
  off, every section stays visible.
- **Sample data is fixed, never random**, so the server and client render the
  same markup.
- Numbers are set in IBM Plex Mono with `tabular-nums`; prose is Schibsted
  Grotesk. The recreated app windows use the system font stack on purpose, the
  way the real app does.
