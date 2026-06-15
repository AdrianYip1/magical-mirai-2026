// Draws the song card art in code instead of shipping image files.
// This keeps the cards in one style and follows the contest rule against
// using any AI made assets. Each card is returned as a PNG data URL so it
// can be used anywhere an image source is expected.

type RGB = [number, number, number];

// Colours taken from the aurora shader plus a soft highlight.
const TEAL: RGB = [33, 219, 204];
const BLUE: RGB = [41, 107, 245];
const PINK: RGB = [255, 84, 158];
const GLOW: RGB = [180, 240, 255];

const rgba = (c: RGB, a: number) => `rgba(${c[0]}, ${c[1]}, ${c[2]}, ${a})`;

// Turns a string into a number we can seed the random generator with.
function hashSeed(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

// Small random generator that gives the same sequence for a given seed.
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const cache = new Map<string, string>();
const SIZE = 512;

// Paints a soft round cloud of colour over the whole canvas.
function bloom(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, c: RGB, a: number) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, rgba(c, a));
  g.addColorStop(0.5, rgba(c, a * 0.4));
  g.addColorStop(1, rgba(c, 0));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, SIZE, SIZE);
}

// Builds a small noise tile once and reuses it for film grain.
let grainTile: HTMLCanvasElement | null = null;
function getGrain(): HTMLCanvasElement {
  if (grainTile) return grainTile;
  const N = 256;
  const cv = document.createElement('canvas');
  cv.width = N; cv.height = N;
  const ctx = cv.getContext('2d')!;
  const img = ctx.createImageData(N, N);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = (Math.random() * 255) | 0;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
    img.data[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  grainTile = cv;
  return cv;
}

// Draws and caches the abstract card art for one song seed.
export function proceduralThumbnail(seed: string): string {
  const cached = cache.get(seed);
  if (cached) return cached;

  const rnd = mulberry32(hashSeed(seed));
  const cv = document.createElement('canvas');
  cv.width = SIZE; cv.height = SIZE;
  const ctx = cv.getContext('2d')!;

  // Fill a deep almost black background.
  const base = ctx.createLinearGradient(0, 0, SIZE, SIZE);
  base.addColorStop(0, 'rgb(6, 10, 18)');
  base.addColorStop(1, 'rgb(2, 4, 9)');
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, SIZE, SIZE);

  // Pick one lead colour so each card looks different but still related.
  const palette: RGB[] = [TEAL, BLUE, PINK];
  const lead = Math.floor(rnd() * 3);

  // Lay down a few soft colour clouds.
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.filter = 'blur(36px)';
  const clouds = 5 + Math.floor(rnd() * 3);
  for (let i = 0; i < clouds; i++) {
    const c = i === 0 ? palette[lead] : palette[Math.floor(rnd() * 3)];
    const x = SIZE * (-0.1 + rnd() * 1.2);
    const y = SIZE * (-0.1 + rnd() * 1.2);
    const r = SIZE * (0.35 + rnd() * 0.5);
    bloom(ctx, x, y, r, c, 0.35 + rnd() * 0.3);
  }
  ctx.restore();

  // Add one brighter glow off to the side.
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.filter = 'blur(18px)';
  bloom(
    ctx,
    SIZE * (0.3 + rnd() * 0.4),
    SIZE * (0.25 + rnd() * 0.4),
    SIZE * (0.18 + rnd() * 0.12),
    GLOW,
    0.3 + rnd() * 0.2,
  );
  ctx.restore();

  // Film grain.
  ctx.save();
  ctx.globalCompositeOperation = 'overlay';
  ctx.globalAlpha = 0.05;
  ctx.drawImage(getGrain(), 0, 0, SIZE, SIZE);
  ctx.restore();

  // Vignette to focus the centre.
  const vig = ctx.createRadialGradient(SIZE / 2, SIZE / 2, SIZE * 0.25, SIZE / 2, SIZE / 2, SIZE * 0.72);
  vig.addColorStop(0, 'rgba(0, 0, 0, 0)');
  vig.addColorStop(1, 'rgba(0, 0, 0, 0.55)');
  ctx.fillStyle = vig;
  ctx.fillRect(0, 0, SIZE, SIZE);

  const url = cv.toDataURL('image/png');
  cache.set(seed, url);
  return url;
}
