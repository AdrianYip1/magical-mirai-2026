import * as THREE from 'three';
import type { WheelItem } from './sphereSelect';
import { getSongNames, COLORS } from './sphereSelect';
import { cylDims, menuState } from './renderer';
import { getLanguage, onLanguageChange } from './language';
import { proceduralThumbnail } from './procThumb';

export const menuReflectScene = new THREE.Scene();
const proxyGroup = new THREE.Group();
menuReflectScene.add(proxyGroup);

interface Tile {
  texture:    THREE.CanvasTexture;
  kind:       'song' | 'util';
  drawStatic: () => void;
  drawLoading?: (pcv: CanvasImageSource) => void;
}
let tiles: Tile[] = [];

let loadingTile: Tile | null = null;
let loadingCv:   CanvasImageSource | null = null;

// Makes a blank canvas and matching texture sized to one card.
function makeCanvasTile(aspect: number) {
  const H = 256;
  const W = Math.max(64, Math.round(H * aspect));
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const ctx = cv.getContext('2d')!;
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return { ctx, tex, W, H };
}

// Draws the song name and artist over a dark gradient.
function drawSongText(
  ctx: CanvasRenderingContext2D, W: number, H: number,
  name: string, artist: string, accent: string,
) {
  const g = ctx.createLinearGradient(0, H * 0.45, 0, H);
  g.addColorStop(0, 'rgba(0, 0, 0, 0)');
  g.addColorStop(1, 'rgba(0, 0, 0, 0.82)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.shadowColor = 'rgba(0, 0, 0, 0.6)';
  ctx.shadowBlur = 4;
  ctx.fillStyle = '#ffffff';
  ctx.font = `700 ${Math.round(H * 0.085)}px sans-serif`;
  ctx.fillText(name, W * 0.07, H * 0.88, W * 0.86);
  ctx.fillStyle = accent;
  ctx.font = `${Math.round(H * 0.06)}px monospace`;
  ctx.fillText(artist, W * 0.07, H * 0.955, W * 0.86);
  ctx.shadowBlur = 0;
}

// Draws the settings or credits card with its icon and label.
function drawUtil(ctx: CanvasRenderingContext2D, W: number, H: number, kind: 'settings' | 'credits') {
  ctx.clearRect(0, 0, W, H);
  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, '#0a262c');
  bg.addColorStop(1, '#030c12');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  const glow = ctx.createRadialGradient(W / 2, 0, 0, W / 2, 0, H * 0.9);
  glow.addColorStop(0, 'rgba(34, 219, 204, 0.16)');
  glow.addColorStop(0.6, 'rgba(34, 219, 204, 0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);

  ctx.strokeStyle = 'rgba(34, 219, 204, 0.32)';
  ctx.lineWidth = 2;
  ctx.strokeRect(1, 1, W - 2, H - 2);

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#22dbcc';
  ctx.shadowColor = 'rgba(34, 219, 204, 0.55)';
  ctx.shadowBlur = 18;
  ctx.font = `${Math.round(H * 0.30)}px sans-serif`;
  ctx.fillText(kind === 'settings' ? '⚙' : 'ℹ', W / 2, H * 0.42);

  ctx.shadowBlur = 0;
  ctx.fillStyle = 'rgba(210, 255, 250, 0.78)';
  ctx.letterSpacing = '3px';
  ctx.font = `${Math.round(H * 0.075)}px sans-serif`;
  const label = kind === 'settings'
    ? (getLanguage() === 'en' ? 'SETTINGS' : '設定')
    : (getLanguage() === 'en' ? 'CREDITS'  : 'クレジット');
  ctx.fillText(label, W / 2, H * 0.62);
  ctx.letterSpacing = '0px';
}

// Draws an image so it fills the card without stretching.
function drawCover(ctx: CanvasRenderingContext2D, img: HTMLImageElement, W: number, H: number) {
  const ir = img.width / img.height;
  const cr = W / H;
  let dw: number, dh: number;
  if (ir > cr) { dh = H; dw = H * ir; } else { dw = W; dh = W / ir; }
  ctx.drawImage(img, (W - dw) / 2, (H - dh) / 2, dw, dh);
}

// Builds the reflected copies of every card shown in the water.
export function initMenuReflect(items: WheelItem[]) {
  for (const child of [...proxyGroup.children]) {
    proxyGroup.remove(child);
    const m = child as THREE.Mesh;
    m.geometry.dispose();
    const mat = m.material as THREE.MeshBasicMaterial;
    mat.map?.dispose();
    mat.dispose();
  }
  tiles = [];
  loadingTile = null;
  loadingCv = null;

  const n = items.length;
  const { r } = cylDims;
  const w = 2 * r * Math.sin(Math.PI / n);
  const h = cylDims.h;
  const R = r * Math.cos(Math.PI / n);
  const aspect = w / h;

  proxyGroup.position.y = h;

  let songColorIdx = 0;

  items.forEach((item, i) => {
    const a = (i / n) * 2 * Math.PI;
    const { ctx, tex, W, H } = makeCanvasTile(aspect);

    let tile: Tile;
    if (item.kind === 'song') {
      const accent = COLORS[songColorIdx++ % COLORS.length];
      let img: HTMLImageElement | null = null;

      const drawStatic = () => {
        const { name, artist } = getSongNames(item.data);
        ctx.clearRect(0, 0, W, H);
        ctx.fillStyle = '#1b3a44';
        ctx.fillRect(0, 0, W, H);
        if (img) drawCover(ctx, img, W, H);
        drawSongText(ctx, W, H, name, artist, accent);
      };
      const drawLoading = (pcv: CanvasImageSource) => {
        const { name, artist } = getSongNames(item.data);
        ctx.clearRect(0, 0, W, H);
        ctx.fillStyle = '#03080f'; // card background colour
        ctx.fillRect(0, 0, W, H);
        ctx.drawImage(pcv, 0, 0, W, H);
        drawSongText(ctx, W, H, name, artist, accent);
      };

      tile = { texture: tex, kind: 'song', drawStatic, drawLoading };
      drawStatic();

      // Load the card art and redraw once it is ready.
      const loadImg = new Image();
      loadImg.crossOrigin = 'anonymous';
      loadImg.onload = () => { img = loadImg; if (loadingTile !== tile) { drawStatic(); tex.needsUpdate = true; } };
      loadImg.src = proceduralThumbnail(item.data.url);
    } else {
      const kind = item.kind;
      tile = { texture: tex, kind: 'util', drawStatic: () => drawUtil(ctx, W, H, kind) };
      tile.drawStatic();
    }
    tex.needsUpdate = true;

    const mat = new THREE.MeshBasicMaterial({ map: tex, toneMapped: false });
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
    plane.position.set(R * Math.sin(a), 0, R * Math.cos(a));
    plane.rotation.y = a;
    proxyGroup.add(plane);

    tiles.push(tile);
  });
}

// Mirrors a song card loading animation in the water. Pass null to stop.
export function setMenuReflectLoading(index: number, cv: CanvasImageSource | null) {
  const prev = loadingTile;
  const next = (cv && index >= 0 && index < tiles.length && tiles[index].kind === 'song')
    ? tiles[index] : null;

  if (prev && prev !== next) {
    prev.drawStatic();
    prev.texture.needsUpdate = true;
  }
  loadingTile = next;
  loadingCv   = next ? cv : null;
}

// Spins the reflection with the wheel and redraws any loading card.
export function updateMenuReflect() {
  proxyGroup.rotation.y = menuState.cylAngle;
  if (loadingTile && loadingCv && loadingTile.drawLoading) {
    loadingTile.drawLoading(loadingCv);
    loadingTile.texture.needsUpdate = true;
  }
}

// Repaint cached text when the language changes.
onLanguageChange(() => {
  for (const t of tiles) {
    if (t !== loadingTile) {
      t.drawStatic();
      t.texture.needsUpdate = true;
    }
  }
});
