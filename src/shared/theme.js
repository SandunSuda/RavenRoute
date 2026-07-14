/* ================================================
   RavenRoute — Theme Manager
   ================================================ */

import { broadcast, onMessage } from './store.js';

const THEME_KEY = 'rr_theme';

export function getTheme() {
  return localStorage.getItem(THEME_KEY) || 'dark'; // default to dark
}

export function setTheme(theme) {
  localStorage.setItem(THEME_KEY, theme);
  applyTheme(theme);
  broadcast('THEME_CHANGED', theme);
}

export function toggleTheme() {
  const current = getTheme();
  setTheme(current === 'dark' ? 'light' : 'dark');
}

export function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  
  // Dispatch custom event for map components to catch
  window.dispatchEvent(new CustomEvent('theme-changed', { detail: theme }));
}

export function initTheme() {
  applyTheme(getTheme());
  
  onMessage('THEME_CHANGED', (theme) => {
    applyTheme(theme);
  });
  
  // Catch standard localStorage events from other tabs if broadcast channel misses it
  window.addEventListener('storage', (e) => {
    if (e.key === THEME_KEY) {
      applyTheme(e.newValue);
    }
  });
}
