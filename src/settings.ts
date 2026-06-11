const FURIGANA_KEY = 'holofragment.furigana';

let _furigana = (() => {
  return localStorage.getItem(FURIGANA_KEY) === 'true';
})();

export const getFuriganaEnabled = (): boolean => _furigana;

export function setFuriganaEnabled(v: boolean): void {
  _furigana = v;
  try { localStorage.setItem(FURIGANA_KEY, String(v)); } catch { /* private mode */ }
}
