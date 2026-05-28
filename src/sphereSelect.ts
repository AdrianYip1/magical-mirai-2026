import './sphereSelect.css';
import type { SongOption } from './songSelect';

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
  songs: SongOption[],
  onSelect: (song: SongOption) => void,
): () => void {
  const n = songs.length;
  const STEP  = 360 / n;


  const root = document.createElement('div');
  root.className = 'sss-root';

  const scene = document.createElement('div');
  scene.className = 'sss-scene';

  const inner = document.createElement('div');  // spins on Y axis
  inner.className = 'sss-inner';

  scene.appendChild(inner);
  root.appendChild(scene);
  document.body.appendChild(root);

 // song cards

  const cardEls: HTMLDivElement[] = [];

  songs.forEach((song, i) => {
    const { name, artist } = parseSong(song.title);
    const color = COLORS[i % COLORS.length];
    const angleRad = (i / n) * 2 * Math.PI;
    const x = RADIUS * Math.sin(angleRad);
    const z = RADIUS * Math.cos(angleRad);
    const yDeg = (i / n) * 360;

    const card = document.createElement('div');
    card.className  = 'sss-card';
    card.style.cssText = `--c:${color}; transform:translate3d(${x}px,0,${z}px) rotateY(${yDeg}deg);`;
    card.innerHTML  = `
      <div class="sss-name">${escapeHtml(name)}</div>
      <div class="sss-artist">${escapeHtml(artist)}</div>
    `;

    card.addEventListener('click', () => {
      if (dragMoved > 5) return;
      if (i === activeIndex) selectSong(song);
      else snapTo(i);
    });

    inner.appendChild(card);
    cardEls.push(card);
  });

  // sttes
  let spinAngle = 0;
  let targetAngle = 0;
  let activeIndex = 0;
  let dragging = false;
  let dragMoved = 0;
  let lastX = 0;
  let raf: number;

  function selectSong(song: SongOption) {
    root.style.transition = 'opacity 0.4s ease';
    root.style.opacity = '0';
    setTimeout(() => { cleanup(); onSelect(song); }, 400);
  }

  // Snap to card index, taking the shortest arc
  function snapTo(index: number) {
    activeIndex = ((index % n) + n) % n;
    const raw  = -activeIndex * STEP;
    const diff = ((raw - spinAngle) % 360 + 540) % 360 - 180;
    targetAngle = spinAngle + diff;
    updateActive();
  }

  function updateActive() {
    cardEls.forEach((el, i) => el.classList.toggle('sss-card--active', i === activeIndex));
  }

  //loop
  function tick() {
    spinAngle += (targetAngle - spinAngle) * 0.1;
    inner.style.transform = `rotateY(${spinAngle}deg)`;
    raf = requestAnimationFrame(tick);
  }
  raf = requestAnimationFrame(tick);

  // fade effect

  updateActive();
  requestAnimationFrame(() => requestAnimationFrame(() => {
    cardEls.forEach((el, i) => {
      el.style.transition = `opacity 0.5s ${i * 0.06}s ease`;
      el.style.opacity = '1';
    });
  }));

  // dragging the songs in select

  function onPointerDown(e: PointerEvent) {
    dragging  = true;
    dragMoved = 0;
    lastX = e.clientX;
    scene.style.cursor = 'grabbing';
  }

  function onPointerMove(e: PointerEvent) {
    if (!dragging) return;
    const dx = e.clientX - lastX;
    spinAngle  += dx * 0.35;
    targetAngle = spinAngle;   // follow cursor
    dragMoved  += Math.abs(dx);
    lastX = e.clientX;
  }

  function onPointerUp() {
    if (!dragging) return;
    dragging = false;
    scene.style.cursor = 'grab';
    snapTo(Math.round(-spinAngle / STEP));  // snap to nearest
  }

  scene.addEventListener('pointerdown', onPointerDown);
  window.addEventListener('pointermove', onPointerMove);
  window.addEventListener('pointerup',   onPointerUp);

  // arrow keys to scroll

  function onKeyDown(e: KeyboardEvent) {
    if (e.key === 'ArrowRight')  { e.preventDefault(); snapTo(activeIndex + 1); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); snapTo(activeIndex - 1); }
    else if (e.key === 'Enter') { selectSong(songs[activeIndex]); }
  }
  window.addEventListener('keydown', onKeyDown);


  function cleanup() {
    cancelAnimationFrame(raf);
    scene.removeEventListener('pointerdown', onPointerDown);
    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointerup',   onPointerUp);
    window.removeEventListener('keydown',     onKeyDown);
    root.remove();
  }

  return cleanup;
}

