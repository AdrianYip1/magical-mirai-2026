import './sphereSelect.css';
import type { SongOption } from './songSelect';
import { getLanguage } from './language';
import { menuState } from './renderer';
import { setMenuReflectLoading } from './menuReflect';
import { proceduralThumbnail } from './procThumb';

export type WheelItem =
  | { kind: 'song';     data: SongOption }
  | { kind: 'settings' }
  | { kind: 'credits'}

// Splits a song title into its name and artist parts.
function parseSong(raw: string): { name: string; artist: string } {
  const i = raw.lastIndexOf(' — ');
  return i !== -1 ? { name: raw.slice(0, i), artist: raw.slice(i + 3) } : { name: raw, artist: '' };
}

// Escapes the characters that have special meaning in HTML.
function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export const COLORS = ['#00e5ff', '#b388ff', '#f48fb1', '#69f0ae', '#ffd740', '#40c4ff'];
const RADIUS  = 280;

const CANVAS_W = 170;
const CANVAS_H = 190;
const CELL = 2;
const GRID_X = Math.floor(CANVAS_W / CELL);   // 85
const GRID_Y = Math.floor(CANVAS_H / CELL);   // 95
const STAGGER_MS  = 5_000;
const ROW_CONV_MS = 600;
const CONVERGE_MS = STAGGER_MS + ROW_CONV_MS;
const P_R = 1.5;

interface Ptcl {
  col: number; row: number;
  homeX: number; homeY: number;
  x: number; y: number;
  fromX: number; fromY: number;
  cr: number; cg: number; cb: number;
  alpha: number;
}

type LoadPhase = 'idle' | 'converge' | 'pulse' | 'done';

// Loads an image and returns its pixels drawn at the given size.
function sampleImg(src: string, w: number, h: number, fit: 'contain' | 'cover'): Promise<ImageData> {
  return new Promise((res, rej) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = w; c.height = h;
      const ctx = c.getContext('2d')!;
      const ar = img.naturalWidth / img.naturalHeight;
      let dw: number, dh: number;
      if (fit === 'contain') {
        if (ar >= 1) { dw = w; dh = w / ar; } else { dh = h; dw = h * ar; }
      } else {
        if (ar >= 1) { dh = h; dw = h * ar; } else { dw = w; dh = w / ar; }
      }
      ctx.drawImage(img, (w - dw) / 2, (h - dh) / 2, dw, dh);
      res(ctx.getImageData(0, 0, w, h));
    };
    img.onerror = () => rej(new Error(`sampleImg: ${src}`));
    img.src = src;
  });
}

// Smooth easing curve that starts and ends slowly.
function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

// Animates a card from scattered particles into its final image.
class ParticleLoader {
  private cv:       HTMLCanvasElement;
  private ctx:      CanvasRenderingContext2D;
  private img:      HTMLImageElement;
  private thumbSrc: string;
  private ps:       Ptcl[] = [];
  private ph:       LoadPhase = 'idle';
  private t0 = 0;
  private raf = 0;
  private wantDone     = false;
  private gen          = 0;
  private beatIntensity = 0;
  private _buf     = new Uint8ClampedArray(CANVAS_W * CANVAS_H * 4);
  private _imgData = new ImageData(CANVAS_W, CANVAS_H);

  constructor(cv: HTMLCanvasElement, img: HTMLImageElement, thumbSrc: string) {
    this.cv = cv; this.ctx = cv.getContext('2d')!; this.img = img; this.thumbSrc = thumbSrc;
  }

  // Begins the converge animation for this card.
  async start() {
    const myGen = ++this.gen;
    cancelAnimationFrame(this.raf); this.raf = 0;
    this.wantDone      = false;
    this.beatIntensity = 0;
    this.ph = 'idle'; this.ps = [];
    this.ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);
    this.cv.style.transition  = '';
    this.cv.style.opacity     = '1';
    this.img.style.transition = '';
    this.img.style.opacity    = '0';

    let thumbPx: Uint8ClampedArray | null = null;
    try { thumbPx = (await sampleImg(this.thumbSrc, CANVAS_W, CANVAS_H, 'cover')).data; }
    catch { /* fall back to white particles */ }
    if (this.gen !== myGen) return;

    for (let row = 0; row < GRID_Y; row++) {
      for (let col = 0; col < GRID_X; col++) {
        const homeX = (col + 0.5) * CELL, homeY = (row + 0.5) * CELL;
        const fromX = Math.random() * CANVAS_W,  fromY = Math.random() * CANVAS_H;
        const px = Math.min(Math.floor(homeX), CANVAS_W - 1);
        const py = Math.min(Math.floor(homeY), CANVAS_H - 1);
        const i  = (py * CANVAS_W + px) * 4;
        this.ps.push({
          col, row, homeX, homeY,
          x: fromX, y: fromY, fromX, fromY,
          cr: thumbPx ? thumbPx[i]     : 255,
          cg: thumbPx ? thumbPx[i + 1] : 255,
          cb: thumbPx ? thumbPx[i + 2] : 255,
          alpha: 0,
        });
      }
    }

    if (this.wantDone) {
      for (const p of this.ps) { p.x = p.homeX; p.y = p.homeY; p.alpha = 1; }
      this._enterPulse();
      return;
    }

    this.ph = 'converge'; this.t0 = performance.now();
    this.raf = requestAnimationFrame(t => this._tick(t));
  }

  // Tells the animation to finish early once loading is done.
  complete() {
    const p = this.ph;
    if (p === 'pulse' || p === 'done') return;
    if (p === 'idle') { this.wantDone = true; return; }
    if (p === 'converge') {
      const elNow = performance.now() - this.t0;
      if (elNow < STAGGER_MS) this.t0 -= (STAGGER_MS - elNow);
      const myGen = this.gen;
      setTimeout(() => { if (this.gen === myGen) this._enterPulse(); }, ROW_CONV_MS + 50);
    }
  }

  // Stops the animation and shows the plain image.
  cancel() {
    ++this.gen;
    cancelAnimationFrame(this.raf); this.raf = 0;
    this.ph = 'idle'; this.ps = [];
    this.ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);
    this.cv.style.transition  = '';
    this.cv.style.opacity     = '0';
    this.img.style.transition = '';
    this.img.style.opacity    = '1';
  }

  // Brightens the particles on a beat while pulsing.
  beatHit(intensity: number) {
    if (this.ph === 'pulse') this.beatIntensity = Math.min(1, this.beatIntensity + intensity * 0.6);
  }

  // Snaps the particles home and fades the real image in.
  private _enterPulse() {
    this.ph = 'pulse';
    for (const p of this.ps) { p.x = p.homeX; p.y = p.homeY; p.alpha = 1; }
    this.img.style.transition = 'opacity 0.4s';
    this.img.style.opacity    = '1';
  }

  // Runs one animation frame and draws the particles.
  private _tick(now: number) {
    this.raf = requestAnimationFrame(t => this._tick(t));
    const el = now - this.t0;

    switch (this.ph) {
      case 'converge': {
        for (const p of this.ps) {
          const delay  = (GRID_Y - 1 - p.row) / (GRID_Y - 1) * STAGGER_MS;
          const localT = Math.max(0, Math.min((el - delay) / ROW_CONV_MS, 1));
          const pos    = easeInOutCubic(localT);
          p.x     = p.fromX + (p.homeX - p.fromX) * pos;
          p.y     = p.fromY + (p.homeY - p.fromY) * pos;
          p.alpha = Math.min(localT * 2, 1);
        }
        if (el >= CONVERGE_MS) this._enterPulse();
        break;
      }
      case 'pulse': {
        this.beatIntensity *= 0.88;
        for (const p of this.ps) { p.x = p.homeX; p.y = p.homeY; }
        break;
      }
      default: return;
    }

    const buf   = this._buf;
    const glow  = 1 + this.beatIntensity * 0.22;
    buf.fill(0);
    const PR2 = P_R * P_R;
    const R   = Math.ceil(P_R);
    for (const p of this.ps) {
      if (p.alpha <= 0) continue;
      const cx = Math.round(p.x), cy = Math.round(p.y);
      for (let dy = -R; dy <= R; dy++) {
        for (let dx = -R; dx <= R; dx++) {
          const d2 = dx * dx + dy * dy;
          if (d2 > PR2) continue;
          const px = cx + dx, py = cy + dy;
          if (px < 0 || px >= CANVAS_W || py < 0 || py >= CANVAS_H) continue;
          const i       = (py * CANVAS_W + px) * 4;
          const falloff = (1 - d2 / PR2) * p.alpha * glow;
          buf[i]     = Math.min(255, buf[i]     + Math.round(p.cr * falloff));
          buf[i + 1] = Math.min(255, buf[i + 1] + Math.round(p.cg * falloff));
          buf[i + 2] = Math.min(255, buf[i + 2] + Math.round(p.cb * falloff));
        }
      }
    }
    for (let i = 0; i < buf.length; i += 4) {
      buf[i + 3] = Math.max(buf[i], buf[i + 1], buf[i + 2]);
    }
    this._imgData.data.set(buf);
    this.ctx.putImageData(this._imgData, 0, 0);
  }
}

// Menu break apart effect used when a card is chosen.

const DI_SCALE    = 2;
const DI_DURATION = 2000;
const DI_CSAMP    = 6;

export interface DiParticle { x: number; y: number; r: number; g: number; b: number; }

let lastMenuParticles: DiParticle[] = [];
// Returns the points captured from the last menu.
export function getLastMenuParticles(): DiParticle[] { return lastMenuParticles; }

// Captures the current menu cards so the back transition can reuse them.
export function primeMenuParticles(): DiParticle[] {
  lastMenuParticles = captureMenuParticles(_cardEls);
  return lastMenuParticles;
}

// Turns a hex colour string into red green blue numbers.
function hexToRgb(hex: string): [number, number, number] {
  const m = hex.match(/#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})/i);
  return m ? [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)] : [80, 80, 80];
}

// Reads each menu card into a list of coloured points.
function captureMenuParticles(cardEls: HTMLDivElement[]): DiParticle[] {
  const out: DiParticle[] = [];

  for (const card of cardEls) {
    const rect = card.getBoundingClientRect();
    if (rect.width < 5 || rect.height < 5) continue;
    if (rect.right < 0 || rect.left > window.innerWidth) continue;
    if (parseFloat(card.style.opacity || '0') < 0.05) continue;

    const cw = Math.ceil(rect.width), ch = Math.ceil(rect.height);
    const off = document.createElement('canvas');
    off.width = cw; off.height = ch;
    const oc = off.getContext('2d')!;

    // Fill with the card theme colour first so the canvas is never fully clear.
    // A card whose image has not decoded yet would otherwise give back nothing
    // and break the back transition.
    const [fr, fg, fb] = hexToRgb(getComputedStyle(card).getPropertyValue('--c').trim());
    oc.fillStyle = `rgb(${fr},${fg},${fb})`;
    oc.fillRect(0, 0, cw, ch);

    const bgImg = card.querySelector<HTMLImageElement>('.sss-card-bg');
    if (bgImg?.complete && bgImg.naturalWidth > 0) {
      try { oc.drawImage(bgImg, 0, 0, cw, ch); } catch { /* tainted */ }
    }

    const cv = card.querySelector<HTMLCanvasElement>('.sss-particle-cv');
    if (cv && parseFloat(cv.style.opacity || '0') > 0.1) {
      try { oc.drawImage(cv, 0, 0, cw, ch); } catch { /* tainted */ }
    }

    let data: Uint8ClampedArray | null = null;
    try { data = oc.getImageData(0, 0, cw, ch).data; } catch { /* tainted */ }

    for (let ly = DI_CSAMP / 2; ly < ch; ly += DI_CSAMP) {
      for (let lx = DI_CSAMP / 2; lx < cw; lx += DI_CSAMP) {
        let r = fr, g = fg, b = fb;
        if (data) {
          const idx = (Math.floor(ly) * cw + Math.floor(lx)) * 4;
          if (data[idx + 3] < 16) continue;
          r = data[idx]; g = data[idx + 1]; b = data[idx + 2];
        }
        out.push({ x: rect.left + lx, y: rect.top + ly, r, g, b });
      }
    }
  }

  return out;
}

// Blows the captured points apart and fades them out over time.
function runDisintegration(particles: DiParticle[], onDone: () => void): () => void {
  const W = Math.ceil(window.innerWidth  / DI_SCALE);
  const H = Math.ceil(window.innerHeight / DI_SCALE);

  const overlay = document.createElement('canvas');
  overlay.width  = W;
  overlay.height = H;
  Object.assign(overlay.style, {
    position: 'fixed', inset: '0',
    width: '100%', height: '100%',
    zIndex: '55', pointerEvents: 'none',
    imageRendering: 'pixelated',
  });
  document.body.appendChild(overlay);
  const ctx = overlay.getContext('2d')!;

  const n = particles.length;
  const buf = new Uint8ClampedArray(W * H * 4);
  const imgData = new ImageData(W, H);
  const px = new Float32Array(n);
  const py = new Float32Array(n);
  const vx = new Float32Array(n);
  const vy = new Float32Array(n);

  for (let k = 0; k < n; k++) {
    px[k] = particles[k].x;
    py[k] = particles[k].y;
    const angle = Math.random() * Math.PI * 2;
    const speed = 60 + Math.random() * 200;
    vx[k] = Math.cos(angle) * speed;
    vy[k] = Math.sin(angle) * speed;
  }

  const start = performance.now();
  let raf: number;
  let cancelled = false;

  // Stops the effect early and removes the overlay.
  function cancel() {
    if (cancelled) return;
    cancelled = true;
    cancelAnimationFrame(raf);
    overlay.remove();
  }

  // Moves and draws every point for one frame.
  function tick(now: number) {
    if (cancelled) return;
    const progress = Math.min((now - start) / DI_DURATION, 1);
    const dt = 1 / 60;

    buf.fill(0);

    for (let k = 0; k < n; k++) {
      const alpha = Math.max(0, 1 - progress * 1.3);
      if (alpha <= 0) continue;

      px[k] += vx[k] * dt;
      py[k] += vy[k] * dt;

      const cx = Math.round(px[k] / DI_SCALE);
      const cy = Math.round(py[k] / DI_SCALE);
      if (cx < 0 || cx >= W || cy < 0 || cy >= H) continue;

      const i = (cy * W + cx) * 4;
      buf[i] = Math.min(255, buf[i] + Math.round(particles[k].r * alpha));
      buf[i + 1] = Math.min(255, buf[i + 1] + Math.round(particles[k].g * alpha));
      buf[i + 2] = Math.min(255, buf[i + 2] + Math.round(particles[k].b * alpha));
    }

    for (let i = 0; i < buf.length; i += 4) {
      buf[i + 3] = Math.max(buf[i], buf[i + 1], buf[i + 2]);
    }

    imgData.data.set(buf);
    ctx.putImageData(imgData, 0, 0);

    if (progress >= 1) { cancelled = true; overlay.remove(); onDone(); }
    else { raf = requestAnimationFrame(tick); }
  }

  raf = requestAnimationFrame(tick);
  return cancel;
}

// Returns the settings or credits label in the current language.
function getUtilLabel(kind: string): string {
  const lang = getLanguage();
  if (kind === 'settings') return lang === 'en' ? 'Settings' : '設定';
  if (kind === 'credits')  return lang === 'en' ? 'Credits'  : 'クレジット';
  return kind;
}

let _cardEls: HTMLDivElement[] = [];
let _items:   WheelItem[]      = [];

// Returns a song name and artist in the current language.
export function getSongNames(song: import('./songSelect').SongOption): { name: string; artist: string } {
  const lang = getLanguage();
  if (lang === 'ja') {
    const { name, artist } = parseSong(song.title);
    return {
      name:   song.titleJa  ?? name,
      artist: song.artistJa ?? artist,
    };
  }
  return parseSong(song.title);
}

// Refreshes every card label when the language changes.
function updateUtilityLabels() {
  _items.forEach((item, i) => {
    const card = _cardEls[i];
    if (!card) return;
    if (item.kind === 'song') {
      const { name, artist } = getSongNames(item.data);
      const nameEl   = card.querySelector('.sss-name');
      const artistEl = card.querySelector('.sss-artist');
      if (nameEl)   nameEl.textContent   = name;
      if (artistEl) artistEl.textContent = artist;
    } else {
      const el = card.querySelector('.sss-util-label');
      if (el) el.textContent = getUtilLabel(item.kind);
    }
  });
}

// Builds the 3D song wheel and wires up all of its controls.
export function mountSphereSongSelect(
  items: WheelItem[],
  onSongSelect: (song: SongOption) => void,
  onSettings: () => void,
  onCredits: () => void,
  onHover: (song: SongOption) => void,
  onLeave: () => void,
  initialIndex = 0,
  hidden = false,
): { cleanup: () => void; setLoading: (on: boolean) => void; beat: (intensity: number) => void; reveal: () => void; abortDisintegration: () => void } {
  const n = items.length;
  const STEP = 360 / n;
  initialIndex = ((initialIndex % n) + n) % n;

  _items = items;

  const root = document.createElement('div');
  root.className = 'sss-root';
  const scene = document.createElement('div');
  scene.className = 'sss-scene';
  const inner = document.createElement('div');
  inner.className = 'sss-inner';
  scene.appendChild(inner);
  root.appendChild(scene);
  if (hidden) {
    root.style.opacity = '0';
    root.style.pointerEvents = 'none';
  }
  document.body.appendChild(root);

  const cardEls: HTMLDivElement[] = [];
  _cardEls = cardEls;
  const loaders = new Map<number, ParticleLoader>();
  let songColorIdx = 0;

  items.forEach((item, i) => {
    const angleRad = (i / n) * 2 * Math.PI;
    const x = RADIUS * Math.sin(angleRad);
    const z = RADIUS * Math.cos(angleRad);
    const yDeg = (i / n) * 360;
    const baseTransform = `translate3d(${x}px,0,${z}px) rotateY(${yDeg}deg)`;
    const card = document.createElement('div');

    if (item.kind === 'song') {
      const { name, artist } = getSongNames(item.data);
      const color = COLORS[songColorIdx++ % COLORS.length];
      // Use the song's cover art when provided, otherwise fall back to the
      // procedural card art. This single source feeds the card background, the
      // converge loader particles, and the menu reflection.
      const thumbnail = item.data.image
        ? import.meta.env.BASE_URL + item.data.image
        : proceduralThumbnail(item.data.url);
      card.className     = 'sss-card';
      card.style.cssText = `--c:${color}; transform:${baseTransform};`;
      card.innerHTML     = `
        <img class="sss-card-bg" src="${thumbnail}" alt="${escapeHtml(name)}" />
        <canvas class="sss-particle-cv" width="${CANVAS_W}" height="${CANVAS_H}"></canvas>
        <div class="sss-card-text">
          <div class="sss-name">${escapeHtml(name)}</div>
          <div class="sss-artist">${escapeHtml(artist)}</div>
        </div>
      `;
      const imgEl = card.querySelector<HTMLImageElement>('.sss-card-bg')!;
      const cvEl  = card.querySelector<HTMLCanvasElement>('.sss-particle-cv')!;
      loaders.set(i, new ParticleLoader(cvEl, imgEl, thumbnail));
    } else {
      card.className     = `sss-card sss-card--utility sss-card--${item.kind}`;
      card.style.cssText = `transform:${baseTransform};`;
      card.innerHTML     = `<div class="sss-util-glyph"></div><div class="sss-util-label">${getUtilLabel(item.kind)}</div>`;
    }

    // Cards have no click listener. Clicks are handled in the window pointer up
    // so rotated cards on Android cannot swallow the event.

    inner.appendChild(card);
    cardEls.push(card);
  });

  let spinAngle   = -initialIndex * STEP;
  let targetAngle = -initialIndex * STEP;
  let activeIndex = initialIndex;
  let dragging    = false;
  let dragMoved   = 0;
  let lastX       = 0;
  let downX       = 0;
  let downY       = 0;
  let raf: number;

  let cancelDi: (() => void) | null = null;

  // Picks a song and plays the break apart effect.
  function selectSong(song: SongOption) {
    onSongSelect(song);
    root.style.pointerEvents = 'none';
    const diParticles = captureMenuParticles(cardEls);
    lastMenuParticles = diParticles;
    requestAnimationFrame(() => {
      root.style.transition = 'opacity 0.12s';
      root.style.opacity    = '0';
    });
    cancelDi = runDisintegration(diParticles, cleanup);
  }

  // Opens settings or credits and plays the break apart effect.
  function selectUtility(callback: () => void) {
    callback();
    root.style.pointerEvents = 'none';
    const diParticles = captureMenuParticles(cardEls);
    lastMenuParticles = diParticles;
    requestAnimationFrame(() => {
      root.style.transition = 'opacity 0.12s';
      root.style.opacity    = '0';
    });
    cancelDi = runDisintegration(diParticles, cleanup);
  }

  // Stops the break apart effect early and cleans up.
  function abortDisintegration() {
    if (cancelDi) {
      cancelDi();
      cancelDi = null;
    }
    // Only clean up if the wheel is still on the page. The effect may have
    // already finished and cleaned up by itself.
    if (root.isConnected) cleanup();
  }

  // Rotates the wheel so the given card becomes active.
  function snapTo(index: number) {
    loaders.get(activeIndex)?.cancel();
    activeIndex = ((index % n) + n) % n;
    const raw  = -activeIndex * STEP;
    const diff = ((raw - spinAngle) % 360 + 540) % 360 - 180;
    targetAngle = spinAngle + diff;
    updateActive();
    const item = items[activeIndex];
    if (item.kind === 'song') {
      void loaders.get(activeIndex)?.start();
      onHover(item.data);
      const pcv = cardEls[activeIndex]?.querySelector<HTMLCanvasElement>('.sss-particle-cv') ?? null;
      setMenuReflectLoading(activeIndex, pcv);
    } else {
      onLeave();
      setMenuReflectLoading(activeIndex, null);
    }
  }

  // Marks the active card and lets only it receive clicks.
  function updateActive() {
    cardEls.forEach((el, i) => {
      el.classList.toggle('sss-card--active', i === activeIndex);
      el.style.pointerEvents = i === activeIndex ? 'auto' : 'none';
    });
  }

  // Eases the wheel toward its target angle each frame.
  function tick() {
    spinAngle += (targetAngle - spinAngle) * 0.1;
    inner.style.transform = `rotateY(${spinAngle}deg)`;
    menuState.cylAngle = spinAngle * (Math.PI / 180);
    raf = requestAnimationFrame(tick);
  }
  raf = requestAnimationFrame(tick);

  updateActive();
  requestAnimationFrame(() => requestAnimationFrame(() => {
    cardEls.forEach((el, i) => {
      el.style.transition = `opacity 0.5s ${i * 0.06}s ease`;
      el.style.opacity    = '1';
    });
  }));

  // Finds the front most card under a screen point.
  function findClickedCardIndex(x: number, y: number): number | null {
    let bestIndex: number | null = null;
    let bestZ = -Infinity;
    cardEls.forEach((el, i) => {
      const rect = el.getBoundingClientRect();
      if (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) {
        const angleRad = (i / n) * 2 * Math.PI + spinAngle * Math.PI / 180;
        const z = Math.cos(angleRad);
        if (z > bestZ) { bestZ = z; bestIndex = i; }
      }
    });
    return bestIndex;
  }

  // Starts a drag when the pointer goes down.
  function onPointerDown(e: PointerEvent) {
    dragging = true; dragMoved = 0; lastX = e.clientX;
    downX = e.clientX; downY = e.clientY;
    scene.style.cursor = 'grabbing';
  }
  // Spins the wheel while the pointer is dragged.
  function onPointerMove(e: PointerEvent) {
    if (!dragging) return;
    const dx = e.clientX - lastX;
    spinAngle += dx * 0.35; targetAngle = spinAngle;
    dragMoved += Math.abs(dx); lastX = e.clientX;
  }
  // On release, snaps to a card or selects the active one.
  function onPointerUp() {
    if (!dragging) return;
    dragging = false; scene.style.cursor = 'grab';
    if (dragMoved > 12) {
      snapTo(Math.round(-spinAngle / STEP));
    } else {
      const clickedIndex = findClickedCardIndex(downX, downY);
      if (clickedIndex !== null && clickedIndex !== activeIndex) {
        snapTo(clickedIndex);
      } else {
        const item = items[activeIndex];
        if (item.kind === 'song') selectSong(item.data);
        else if (item.kind === 'settings') selectUtility(onSettings);
        else if (item.kind === 'credits') selectUtility(onCredits);
      }
    }
  }

  root.addEventListener('pointerdown', onPointerDown);
  window.addEventListener('pointermove', onPointerMove);
  window.addEventListener('pointerup',   onPointerUp);

  // Ends the active card loading animation when loading finishes.
  function setLoading(on: boolean) {
    if (!on) loaders.get(activeIndex)?.complete();
  }

  // Passes a beat to the active card so it pulses.
  function beat(intensity: number) {
    loaders.get(activeIndex)?.beatHit(intensity);
  }

  // Removes the wheel and all of its listeners.
  function cleanup() {
    cancelAnimationFrame(raf);
    setMenuReflectLoading(-1, null);
    loaders.forEach(l => l.cancel());
    root.removeEventListener('pointerdown', onPointerDown);
    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointerup',   onPointerUp);
    root.remove();
  }

  // Fades the wheel back in and lets it take input again.
  function reveal() {
    root.style.transition = 'opacity 0.7s';
    root.style.opacity = '1';
    root.style.pointerEvents = '';
  }

  return { cleanup, setLoading, beat, reveal, abortDisintegration };
}
