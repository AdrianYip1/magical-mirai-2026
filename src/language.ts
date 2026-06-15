const LANG_KEY = 'holofragment.language';
export type Lang = 'en' | 'ja';

let _lang: Lang = (() => {
  const v = localStorage.getItem(LANG_KEY);
  return v === 'ja' ? 'ja' : 'en';
})();

export const getLanguage = (): Lang => _lang;

const listeners = new Set<() => void>();
export function onLanguageChange(fn: () => void): void { listeners.add(fn); }

export function setLanguage(l: Lang): void {
  if (_lang === l) return;
  _lang = l;
  try { localStorage.setItem(LANG_KEY, l); } catch {}
  listeners.forEach((fn) => fn());
}
