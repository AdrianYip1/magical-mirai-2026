const LANG_KEY = 'holofragment.language';
export type Lang = 'en' | 'ja';

let _lang: Lang = (() => {
  const v = localStorage.getItem(LANG_KEY);
  return v === 'ja' ? 'ja' : 'en';
})();

// Returns the current interface language.
export const getLanguage = (): Lang => _lang;

const listeners = new Set<() => void>();

// Registers a callback to run whenever the language changes.
export function onLanguageChange(fn: () => void): void { listeners.add(fn); }

// Changes the language, saves it, and notifies any listeners.
export function setLanguage(l: Lang): void {
  if (_lang === l) return;
  _lang = l;
  try { localStorage.setItem(LANG_KEY, l); } catch {}
  listeners.forEach((fn) => fn());
}
