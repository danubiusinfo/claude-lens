export const site = {
  name: "ClaudeLens",
  tagline: "Every Claude Code session you've run, on one screen.",
  version: "0.1.0",
  repo: "https://github.com/danubiusinfo/claude-lens",
  releases: "https://github.com/danubiusinfo/claude-lens/releases/latest",
  installDocs:
    "https://github.com/danubiusinfo/claude-lens/blob/main/docs/INSTALL.md",
  maker: { name: "Danubius", url: "https://danubius.io" },
} as const;

/** The rail mirrors the app's sidebar: each stop is a screen you land on. */
export const rail = [
  { id: "dashboard", label: "Dashboard" },
  { id: "sessions", label: "Sessions" },
  { id: "plans", label: "Plans" },
  { id: "worklog", label: "Worklog" },
  { id: "features", label: "Everything" },
  { id: "privacy", label: "Privacy" },
  { id: "download", label: "Download" },
] as const;

export const steps = [
  {
    title: "Install and open",
    body: "One installer per platform. No account, no sign-in, no configuration file to write.",
  },
  {
    title: "It reads ~/.claude on startup",
    body: "ClaudeLens imports history.jsonl and every transcript under projects/. Re-runs are incremental, so nothing gets counted twice.",
  },
  {
    title: "Read your own history",
    body: "Tokens, cost, working time, sessions and plans — all queried from a SQLite file in your home directory.",
  },
] as const;

/** The comprehensive list. Grouped the way the app groups its screens. */
export const featureGroups = [
  {
    id: "dashboard",
    accent: "cyan",
    title: "Dashboard",
    summary: "The whole picture for a day, a work week, 7 or 30 days, or all time.",
    items: [
      {
        title: "Bento summary",
        body: "Total tokens with the input/output split and cache reads, spend in USD, working time and session count — four cards, one glance.",
      },
      {
        title: "Expandable widgets",
        body: "Click any summary card and it grows into a full chart in place, then folds back.",
      },
      {
        title: "Daily activity heatmap",
        body: "Your entire history as a calendar grid. Click a day to open what you worked on.",
      },
      {
        title: "Input vs. output tokens",
        body: "A stacked timeline that shows how much you sent versus how much Claude wrote back.",
      },
      {
        title: "Per-project breakdown",
        body: "Which repositories your tokens and time actually went into, ranked.",
      },
      {
        title: "Source health",
        body: "Which JSONL sources were found, how many entries came from each, and when the last import ran.",
      },
    ],
  },
  {
    id: "sessions",
    accent: "violet",
    title: "Sessions",
    summary: "Every conversation Claude Code has ever written to disk, browsable.",
    items: [
      {
        title: "Full transcript view",
        body: "User, assistant, thinking and tool-use turns as distinct bubbles, with markdown, code blocks and copy buttons.",
      },
      {
        title: "Search across sessions",
        body: "Type to filter the list by session name and content.",
      },
      {
        title: "Filter by project",
        body: "Narrow the list to one repository from the project picker.",
      },
      {
        title: "Bookmark and rename",
        body: "Star the sessions worth returning to and give them names you'll recognise later.",
      },
      {
        title: "Per-turn timing",
        body: "How long each turn took, measured from your message to the end of Claude's last response.",
      },
    ],
  },
  {
    id: "plans",
    accent: "amber",
    title: "Plans",
    summary: "The plan files Claude Code leaves in ~/.claude/plans, rendered.",
    items: [
      {
        title: "Plan library",
        body: "Every plan file with its title, age and size, newest first.",
      },
      {
        title: "Rendered markdown",
        body: "Full GitHub-flavoured markdown in a side panel — tables, task lists and code fences included.",
      },
    ],
  },
  {
    id: "worklog",
    accent: "mint",
    title: "Worklog",
    summary: "How long Claude Code actually worked, without the guesswork.",
    items: [
      {
        title: "Measured, not estimated",
        body: "Wall clock from your message to the end of Claude's final response in that turn. Tool execution counts; idle time between turns does not.",
      },
      {
        title: "Per day and per session",
        body: "A daily total with a trend sparkline, and the same figure broken down per session and per turn.",
      },
      {
        title: "Day drill-down",
        body: "Open any day from the heatmap to see the sessions and turns behind the number.",
      },
      {
        title: "Recompute on demand",
        body: "Re-run the calculation over the whole database from Settings whenever you want to.",
      },
    ],
  },
  {
    id: "data",
    accent: "teal",
    title: "Data and settings",
    summary: "Your machine, your database, your numbers.",
    items: [
      {
        title: "Local SQLite database",
        body: "Everything lands in ~/.claudelens/claudelens.db. Delete the folder and ClaudeLens is gone without a trace.",
      },
      {
        title: "Automatic and manual import",
        body: "Imports on startup, refreshes from the sidebar, and re-imports in full from Settings when you need a clean slate.",
      },
      {
        title: "Editable model pricing",
        body: "Set your own per-million rates for input, output, cache reads and cache writes — or reset to the shipped defaults.",
      },
      {
        title: "Clear local data",
        body: "One button wipes the database. ~/.claude is only ever read, never written.",
      },
    ],
  },
  {
    id: "craft",
    accent: "cyan",
    title: "The app itself",
    summary: "A native desktop app, not a browser tab in a costume.",
    items: [
      {
        title: "Liquid glass",
        body: "Real vibrancy on macOS 26, with an automatic fallback to the standard material on older versions.",
      },
      {
        title: "Light, dark and system",
        body: "Follows your system appearance, or pin it either way.",
      },
      {
        title: "Native menu and About window",
        body: "Platform menu bar, keyboard shortcuts and a proper About panel.",
      },
      {
        title: "Rust backend, small binary",
        body: "Tauri v2 with a Rust core: a ~6 MB installer and no bundled browser engine.",
      },
    ],
  },
] as const;

export const downloads = [
  {
    os: "macOS",
    key: "mac",
    file: "ClaudeLens_<version>_universal.dmg",
    detail: "Apple Silicon and Intel · macOS 10.15+",
    note: "Unsigned build: clear the quarantine flag on first launch.",
  },
  {
    os: "Windows",
    key: "windows",
    file: "ClaudeLens_<version>_x64-setup.exe",
    detail: "Windows 10/11 x64 · installs per user, no admin rights",
    note: "SmartScreen warns on first run: More info → Run anyway.",
  },
  {
    os: "Linux",
    key: "linux",
    file: "claude-lens_<version>_amd64.deb · .rpm · .AppImage",
    detail: "Ubuntu 22.04+ / Debian 12+ / Fedora · WebKitGTK 4.1",
    note: "Blank window on NVIDIA? Set WEBKIT_DISABLE_DMABUF_RENDERER=1.",
  },
] as const;

/** Hero numbers. Illustrative sample data, not anyone's real usage. */
export const demo = {
  tokensTotal: 4_182_000,
  tokensIn: 3_864_000,
  tokensOut: 318_000,
  cacheRead: 3_120_000,
  costUsd: 47.2,
  workSeconds: 45_600,
  sessions: 38,
  sparkline: [3, 8, 5, 12, 9, 16, 11, 19, 14, 22, 18, 27, 21, 31],
  ioSeries: [
    [22, 4], [31, 6], [18, 3], [44, 8], [37, 5],
    [52, 9], [29, 4], [61, 11], [48, 7], [55, 10],
  ],
  projects: [
    { name: "claude-lens", tokens: "1.9M", share: 100 },
    { name: "notification-service", tokens: "1.1M", share: 58 },
    { name: "document-extractor", tokens: "740K", share: 39 },
    { name: "merge-guard", tokens: "312K", share: 16 },
  ],
  /** 52 weeks × 7 days, level 0–4. Fixed so server and client render alike. */
  heatmap:
    "0000000000110200010001000000002000011000001000000010000000000000000000000000002101000110000100100000001000201010002111001000001200200210000002002000202000202220002012000022100021200011101001220210212200000002000000000003000002000002000300230120033101000003100020130000222303202300130120001211021221200033000000000000300000130200011211000103200132210303220000303000",
} as const;

export const changelog = [
  {
    version: "0.1.0",
    date: "2026-08-18",
    heading: "First public build",
    changes: [
      "Dashboard with the bento summary, expandable widgets, daily heatmap, input/output chart and per-project breakdown.",
      "Sessions browser with search, project filter, bookmarks, renaming and the full transcript panel.",
      "Plans viewer for ~/.claude/plans with GitHub-flavoured markdown.",
      "Worklog measured as wall clock per turn, aggregated per day and per session.",
      "Editable model pricing, light/dark/system theme, native menu and About window.",
      "macOS universal .dmg, Windows NSIS installer, Linux .deb, .rpm and .AppImage.",
    ],
  },
] as const;
