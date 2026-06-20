const FURIGANA_KEY = 'holofragment.furigana';

let _furigana = (() => {
  return localStorage.getItem(FURIGANA_KEY) === 'true';
})();

// Returns whether kana reading aids are turned on.
export const getFuriganaEnabled = (): boolean => _furigana;

// Saves whether kana reading aids should show.
export function setFuriganaEnabled(v: boolean): void {
  _furigana = v;
  try { localStorage.setItem(FURIGANA_KEY, String(v)); } catch {}
}

const DETAIL_KEY = 'holofragment.detail';
export type DetailMode = 'low' | 'high';

let _detail: DetailMode = (() => {
  const saved = localStorage.getItem(DETAIL_KEY);
  if (saved === 'low' || saved === 'high') return saved;
  return (navigator.maxTouchPoints > 1 || window.innerWidth < 768) ? 'low' : 'high';
})();

// Returns the chosen graphics detail level.
export const getDetailMode = (): DetailMode => _detail;

// Saves the chosen graphics detail level.
export function setDetailMode(v: DetailMode): void {
  _detail = v;
  try { localStorage.setItem(DETAIL_KEY, v); } catch {}
}

const SPIN_KEY = 'holofragment.sphere_spin';
export type SphereSpin = 'on' | 'off';

let _spin: SphereSpin = (() => {
  const saved = localStorage.getItem(SPIN_KEY);
  return saved === 'off' ? 'off' : 'on';
})();

// Returns whether the glass sphere slowly rotates.
export const getSphereSpin = (): SphereSpin => _spin;

// Saves whether the glass sphere should rotate.
export function setSphereSpin(v: SphereSpin): void {
  _spin = v;
  try { localStorage.setItem(SPIN_KEY, v); } catch {}
}

const GLASS_FX_KEY = 'holofragment.glass_fx';
export type GlassFx = 'on' | 'off';

let _glassFx: GlassFx = (() => {
  const saved = localStorage.getItem(GLASS_FX_KEY);
  return saved === 'off' ? 'off' : 'on';
})();

// Returns whether the beat driven glass effects are on.
export const getGlassFx = (): GlassFx => _glassFx;

// Saves whether the beat driven glass effects are on.
export function setGlassFx(v: GlassFx): void {
  _glassFx = v;
  try { localStorage.setItem(GLASS_FX_KEY, v); } catch {}
}
