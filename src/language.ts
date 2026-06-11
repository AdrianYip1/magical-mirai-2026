const LANG_KEY = 'holofragment.language';
export type Lang = 'en' | 'ja';

let _lang: Lang = (() => {
  const v = localStorage.getItem(LANG_KEY);
  return v === 'ja' ? 'ja' : 'en';
})();

export const getLanguage = (): Lang => _lang;

export function setLanguage(l: Lang): void {
  _lang = l;
  try { localStorage.setItem(LANG_KEY, l); } catch {}
}
