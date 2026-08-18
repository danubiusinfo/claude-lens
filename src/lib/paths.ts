/**
 * Project paths come from the Claude Code transcripts, so they carry whichever
 * separator the host that recorded them uses — `/` on macOS/Linux, `\` on
 * Windows. Split on both, and rejoin with the separator the path itself used.
 */
export function pathSegments(path: string): string[] {
  return path.split(/[/\\]/).filter(Boolean);
}

/** Shows just the last two segments of a project path. */
export function shortenPath(path: string): string {
  const parts = pathSegments(path);
  if (parts.length <= 2) return path;
  const separator = path.includes('\\') && !path.includes('/') ? '\\' : '/';
  return parts.slice(-2).join(separator);
}
