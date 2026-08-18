import { invoke } from '@tauri-apps/api/core';
import { applyTheme, getThemeMode } from './lib/theme';

const DANUBIUS_URL = 'https://danubius.io';

declare global {
  interface Window {
    // Injected by the Rust side when the About window is created.
    __ABOUT__?: { version?: string };
  }
}

applyTheme(getThemeMode());

const version = window.__ABOUT__?.version;
const versionEl = document.getElementById('about-version');
if (versionEl) {
  versionEl.textContent = version ? `Version ${version}` : '';
}

document.getElementById('about-link')?.addEventListener('click', (event) => {
  event.preventDefault();
  invoke('open_external_url', { url: DANUBIUS_URL }).catch((err) => {
    console.error('Failed to open danubius.io', err);
  });
});
