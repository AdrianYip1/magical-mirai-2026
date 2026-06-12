const FURIGANA_KEY = 'holofragment.furigana';

let _furigana = (() => {
  return localStorage.getItem(FURIGANA_KEY) === 'true';
})();

export const getFuriganaEnabled = (): boolean => _furigana;

export function setFuriganaEnabled(v: boolean): void {
  _furigana = v;
  try { localStorage.setItem(FURIGANA_KEY, String(v)); } catch { /* private mode */ }
}

const DETAIL_KEY = 'holofragment.detail';
export type DetailMode = 'low' | 'high';

let _detail: DetailMode = (() => {
  const saved = localStorage.getItem(DETAIL_KEY);
  return saved === 'low' ? 'low' : 'high';
})();

export const getDetailMode = (): DetailMode => _detail;

export function setDetailMode(v: DetailMode): void {
  _detail = v;
  try { localStorage.setItem(DETAIL_KEY, v); } catch { /* private mode */ }
}
