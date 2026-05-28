import './sphereSelect.css';
import type { SongOption } from './songSelect';

export type WheelItem =
  | { kind: 'song';     data: SongOption }
  | { kind: 'settings' }
  | { kind: 'language' }
  | { kind: 'credits'}

function parseSong(raw: string): { name: string; artist: string } {
  const i = raw.lastIndexOf(' — ');
  return i !== -1 ? { name: raw.slice(0, i), artist: raw.slice(i + 3) } : { name: raw, artist: '' };
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

const COLORS = [
  '#00e5ff',
  '#b388ff',
  '#f48fb1',
  '#69f0ae',
  '#ffd740',
  '#40c4ff',
];

const RADIUS = 280;

export function mountSphereSongSelect(
  items: WheelItem[],
  onSongSelect: (song: SongOption) => void,
  onSettings: () => void,
  onLanguage: () => void,
  onCredits: () => void,
  onHover: (song: SongOption) => void,
  onLeave: () => void,
  initialIndex = 0,
): { cleanup: () => void; setLoading: (on: boolean) => void } {
  const n = items.length;
  const STEP = 360 / n;
  initialIndex = ((initialIndex % n) + n) % n;

  // DOM 

  const root = document.createElement('div');
  root.className = 'sss-root';

  const scene = document.createElement('div');
  scene.className = 'sss-scene';

  const inner = document.createElement('div');
  inner.className = 'sss-inner';

  scene.appendChild(inner);
  root.appendChild(scene);
  document.body.appendChild(root);

  // Cards 

  const cardEls: HTMLDivElement[] = [];
  let songColorIdx = 0;

  items.forEach((item, i) => {
    const angleRad = (i / n) * 2 * Math.PI;
    const x = RADIUS * Math.sin(angleRad);
    const z = RADIUS * Math.cos(angleRad);
    const yDeg = (i / n) * 360;
    const baseTransform = `translate3d(${x}px,0,${z}px) rotateY(${yDeg}deg)`;

    const card = document.createElement('div');

    if (item.kind === 'song') {
      const { name, artist } = parseSong(item.data.title);
      const color = COLORS[songColorIdx++ % COLORS.length];
      card.className    = 'sss-card';
      card.style.cssText = `--c:${color}; transform:${baseTransform};`;
      card.innerHTML    = `
        <div class="sss-name">${escapeHtml(name)}</div>
        <div class="sss-artist">${escapeHtml(artist)}</div>
      `;
    } else {
      card.className = 'sss-card sss-card--utility';
      card.style.cssText = `transform:${baseTransform};`;
      card.innerHTML = item.kind === 'settings'
        ? `<div class="sss-util-label">Settings</div>`
        : item.kind === 'language'
        ? `<div class="sss-util-label">Language</div>`
        : `<div class="sss-util-label">Credits</div>`;
    }

    card.addEventListener('click', () => {
      if (dragMoved > 5) return;
      if (i !== activeIndex) { snapTo(i); return; }
      if (item.kind === 'song') selectSong(item.data);
      else if (item.kind === 'settings') onSettings();
      else if (item.kind === 'language') onLanguage();
      else if (item.kind === 'credits') onCredits();
    });

    inner.appendChild(card);
    cardEls.push(card);
  });

  // State  

  let spinAngle   = -initialIndex * STEP;   // start focused on the initial card
  let targetAngle = -initialIndex * STEP;
  let activeIndex = initialIndex;
  let dragging    = false;
  let dragMoved   = 0;
  let lastX       = 0;
  let raf: number;

  function selectSong(song: SongOption) {
    // Start playback + reveal the canvas immediately
    onSongSelect(song);
    root.style.pointerEvents = 'none';
    root.style.transition    = 'opacity 0.4s ease';
    root.style.opacity       = '0';
    setTimeout(cleanup, 400);
  }

  function snapTo(index: number) {
    activeIndex = ((index % n) + n) % n;
    const raw  = -activeIndex * STEP;
    const diff = ((raw - spinAngle) % 360 + 540) % 360 - 180;
    targetAngle = spinAngle + diff;
    updateActive();
    const item = items[activeIndex];
    if (item.kind === 'song') onHover(item.data);
    else onLeave();
  }

  function updateActive() {
    cardEls.forEach((el, i) => el.classList.toggle('sss-card--active', i === activeIndex));
  }

  // Loop  

  function tick() {
    spinAngle += (targetAngle - spinAngle) * 0.1;
    inner.style.transform = `rotateY(${spinAngle}deg)`;
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

  // Drag

  function onPointerDown(e: PointerEvent) {
    dragging  = true;
    dragMoved = 0;
    lastX     = e.clientX;
    scene.style.cursor = 'grabbing';
  }

  function onPointerMove(e: PointerEvent) {
    if (!dragging) return;
    const dx    = e.clientX - lastX;
    spinAngle  += dx * 0.35;
    targetAngle = spinAngle;
    dragMoved  += Math.abs(dx);
    lastX       = e.clientX;
  }

  function onPointerUp() {
    if (!dragging) return;
    dragging = false;
    scene.style.cursor = 'grab';
    // Only snap on a real drag. A stationary click is handled by the card's
    // click listener — snapping here too would re-fire onHover (stop + restart
    // the preview) and stomp the select that the click is about to do.
    if (dragMoved > 5) snapTo(Math.round(-spinAngle / STEP));
  }

  scene.addEventListener('pointerdown', onPointerDown);
  window.addEventListener('pointermove', onPointerMove);
  window.addEventListener('pointerup',   onPointerUp);

  let wheelAccum = 0;
  function onWheel(e: WheelEvent) {
    e.preventDefault();
    wheelAccum += e.deltaY;
    if      (wheelAccum >  40) { snapTo(activeIndex + 1); wheelAccum = 0; }
    else if (wheelAccum < -40) { snapTo(activeIndex - 1); wheelAccum = 0; }
  }
  scene.addEventListener('wheel', onWheel, { passive: false });

  // Keyboard

  function onKeyDown(e: KeyboardEvent) {
    if      (e.key === 'ArrowRight') { e.preventDefault(); snapTo(activeIndex + 1); }
    else if (e.key === 'ArrowLeft')  { e.preventDefault(); snapTo(activeIndex - 1); }
    else if (e.key === 'Enter') {
      const item = items[activeIndex];
      if      (item.kind === 'song')      selectSong(item.data);
      else if (item.kind === 'settings')  onSettings();
      else if (item.kind === 'language')  onLanguage();
      else if (item.kind === 'credits')   onCredits();
    }
  }
  window.addEventListener('keydown', onKeyDown);

  // Spinner on the active card while its preview is loading. Always clears the
  // previous one so it tracks whichever card is currently focused.
  let loadingEl: HTMLDivElement | null = null;
  function setLoading(on: boolean) {
    if (loadingEl) { loadingEl.classList.remove('sss-card--loading'); loadingEl = null; }
    if (on) {
      loadingEl = cardEls[activeIndex];
      loadingEl?.classList.add('sss-card--loading');
    }
  }

  function cleanup() {
    cancelAnimationFrame(raf);
    scene.removeEventListener('pointerdown', onPointerDown);
    scene.removeEventListener('wheel',        onWheel);
    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointerup',   onPointerUp);
    window.removeEventListener('keydown',     onKeyDown);
    root.remove();
  }

  return { cleanup, setLoading };
}
