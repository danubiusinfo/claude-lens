/**
 * Host-OS detection for the few places the UI has to name a platform concept
 * (file manager, modifier keys). The os plugin isn't installed, and the webview
 * user agent is enough for cosmetic decisions like these.
 */
export type HostOs = 'macos' | 'windows' | 'linux';

export function hostOs(): HostOs {
  const ua = navigator.userAgent;
  if (/Win/i.test(ua)) return 'windows';
  if (/Mac|iPhone|iPad/i.test(ua)) return 'macos';
  return 'linux';
}

/** Name of the OS file manager, for button labels. */
export function fileManagerName(): string {
  switch (hostOs()) {
    case 'macos':
      return 'Finder';
    case 'windows':
      return 'Explorer';
    case 'linux':
      return 'File Manager';
  }
}

/** Display name of the primary modifier key. */
export function modifierKeyLabel(): string {
  return hostOs() === 'macos' ? '⌘' : 'Ctrl';
}
