// Plays short song previews from a plain audio element.
// The first time a song loads through TextAlive we save its audio link, then
// later previews play right away without waiting for a full reload.

import { getVolume } from './volume';

type PreviewMeta = { src: string; chorusMs: number };

const CACHE_KEY = 'holofragment.preview.v1';
const FADE_MS        = 180;
const LOOP_WINDOW_S  = 15;

// Reads the saved song links from local storage.
function loadCache(): Record<string, PreviewMeta> {
  try { return JSON.parse(localStorage.getItem(CACHE_KEY) || '{}'); }
  catch { return {}; }
}

// Writes the saved song links back to local storage.
function saveCache(c: Record<string, PreviewMeta>) {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify(c)); } catch {}
}

const cache    = loadCache();
const elements = new Map<string, HTMLAudioElement>();

let current  = '';
let fadeRaf  = 0;
let fadeFor  = '';

// Creates an audio element for a preview and seeks it to the chorus.
function makeAudio(meta: PreviewMeta): HTMLAudioElement {
  const a = new Audio();
  a.preload = 'auto';
  a.volume  = 0;
  a.src     = meta.src;

  const start = meta.chorusMs / 1000;
  const seek  = () => { try { a.currentTime = start; } catch {} };
  if (a.readyState >= 1) seek();
  else a.addEventListener('loadedmetadata', seek, { once: true });

  // Loop the snippet so a held preview does not run into the next section.
  a.addEventListener('timeupdate', () => {
    if (a.currentTime > start + LOOP_WINDOW_S) { try { a.currentTime = start; } catch {} }
  });

  a.load();
  return a;
}

// Only real web links can be replayed in a fresh audio element.
function isReplayable(src: string): boolean {
  return /^https?:\/\//.test(src);
}

// Returns true if we already saved this song audio link.
export function isCached(songUrl: string): boolean {
  return !!cache[songUrl];
}

// Forgets a song whose saved link no longer works.
function invalidate(songUrl: string) {
  delete cache[songUrl];
  saveCache(cache);
  elements.delete(songUrl);
  if (current === songUrl) current = '';
}

// Rebuilds audio elements for songs we saved in a past visit.
export function hydrateFromCache(songUrls: string[]) {
  for (const url of songUrls) {
    const meta = cache[url];
    if (meta && isReplayable(meta.src) && !elements.has(url)) elements.set(url, makeAudio(meta));
  }
}

// Saves a song audio link the first time TextAlive loads it.
export function registerSource(songUrl: string, src: string, chorusMs: number) {
  if (!src || !isReplayable(src)) return;
  console.info('[preview] cached replayable src', songUrl, '->', src);
  const prev = cache[songUrl];
  if (prev && prev.src === src) return;
  const meta: PreviewMeta = { src, chorusMs };
  cache[songUrl] = meta;
  saveCache(cache);
  if (!elements.has(songUrl)) elements.set(songUrl, makeAudio(meta));
}

// Fades a preview up to the current volume.
function fadeIn(songUrl: string, a: HTMLAudioElement) {
  cancelAnimationFrame(fadeRaf);
  fadeFor = songUrl;
  const from = a.volume;
  const t0   = performance.now();
  const step = (t: number) => {
    if (fadeFor !== songUrl) return;
    const k = Math.min(1, (t - t0) / FADE_MS);
    a.volume = from + (getVolume() - from) * k;
    if (k < 1) fadeRaf = requestAnimationFrame(step);
  };
  fadeRaf = requestAnimationFrame(step);
}

// Plays a song preview right away. Returns false if the song is not saved yet
// so the caller can fall back to the TextAlive path.
export function play(songUrl: string, onPlaying?: () => void, onError?: () => void): boolean {
  const a = elements.get(songUrl);
  if (!a) return false;

  if (current === songUrl && !a.paused) { onPlaying?.(); return true; }

  a.addEventListener('error', () => {
    console.warn('[preview] audio error, invalidating', songUrl);
    invalidate(songUrl);
    onError?.();
  }, { once: true });

  if (current && current !== songUrl) elements.get(current)?.pause();
  current = songUrl;

  const meta = cache[songUrl];
  if (meta) {
    const start = meta.chorusMs / 1000;
    if (Math.abs(a.currentTime - start) > LOOP_WINDOW_S) {
      try { a.currentTime = start; } catch {}
    }
  }

  a.volume = 0;
  const t0 = performance.now();
  a.addEventListener('playing', () => {
    const buffered = a.buffered.length ? `${a.buffered.start(0).toFixed(0)} to ${a.buffered.end(a.buffered.length - 1).toFixed(0)}s` : 'none';
    console.info(`[preview] audible in ${Math.round(performance.now() - t0)}ms (readyState=${a.readyState}, buffered=${buffered})`);
    onPlaying?.();
  }, { once: true });

  const p = a.play();
  if (p) p.then(() => fadeIn(songUrl, a)).catch(() => { onError?.(); });
  else fadeIn(songUrl, a);
  return true;
}

// Stops whatever preview is playing.
export function stop() {
  if (!current) return;
  elements.get(current)?.pause();
  current = '';
  fadeFor = '';
  cancelAnimationFrame(fadeRaf);
}
