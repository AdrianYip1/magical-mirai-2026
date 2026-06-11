const KEY = 'holofragment.volume';

let _vol = (() => {
  const n = parseFloat(localStorage.getItem(KEY) ?? '');
  return isFinite(n) ? Math.max(0, Math.min(1, n)) : 0.8;
})();

export const getVolume = (): number => _vol;

export function setVolume(v: number): void {
  _vol = Math.max(0, Math.min(1, v));
  try { localStorage.setItem(KEY, String(_vol)); } catch { /* private mode */ }
}
