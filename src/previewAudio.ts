// TextAlive's single Player makes every song-switch a network reload (song map
// + audio buffering), so first-visit previews are slow. To get instant
// previews we decouple preview *audio* from TextAlive: the first time a song is
// loaded we capture its resolved audio URL + chorus offset, cache them in
// localStorage, and from then on play the snippet from a standalone <audio>
// element. No lyric sync is needed for a preview — just sound.

type PreviewMeta = { src: string; chorusMs: number };

const CACHE_KEY      = 'holofragment.preview.v1';
const PREVIEW_VOLUME = 0.9;
const FADE_MS        = 180;
const LOOP_WINDOW_S  = 15; // restart the snippet after this many seconds

function loadCache(): Record<string, PreviewMeta> {
  try { return JSON.parse(localStorage.getItem(CACHE_KEY) || '{}'); }
  catch { return {}; }
}

function saveCache(c: Record<string, PreviewMeta>) {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify(c)); } catch { /* private mode */ }
}

const cache    = loadCache();
const elements = new Map<string, HTMLAudioElement>();

let current  = '';   // song url of the element currently playing
let fadeRaf  = 0;
let fadeFor  = '';   // song url the active fade belongs to

function makeAudio(meta: PreviewMeta): HTMLAudioElement {
  const a = new Audio();
  a.preload = 'auto';
  a.volume  = 0;
  a.src     = meta.src;

  const start = meta.chorusMs / 1000;
  const seek  = () => { try { a.currentTime = start; } catch { /* not seekable yet */ } };
  if (a.readyState >= 1) seek();
  else a.addEventListener('loadedmetadata', seek, { once: true });

  // Loop the snippet so a held preview doesn't run into the next section.
  a.addEventListener('timeupdate', () => {
    if (a.currentTime > start + LOOP_WINDOW_S) { try { a.currentTime = start; } catch { /* */ } }
  });

  a.load();
  return a;
}

// blob:/mediasource:/data: URLs are bound to the element that created them and
// can't be replayed in a fresh <audio>; only real http(s) URLs are reusable.
function isReplayable(src: string): boolean {
  return /^https?:\/\//.test(src);
}

/** Whether we've already resolved (and cached) a song's audio URL. */
export function isCached(songUrl: string): boolean {
  return !!cache[songUrl];
}

/** Forget a song whose cached URL no longer works (e.g. a signed URL expired). */
function invalidate(songUrl: string) {
  delete cache[songUrl];
  saveCache(cache);
  elements.delete(songUrl);
  if (current === songUrl) current = '';
}

/** Recreate <audio> elements for any songs we've resolved in a past session. */
export function hydrateFromCache(songUrls: string[]) {
  for (const url of songUrls) {
    const meta = cache[url];
    if (meta && isReplayable(meta.src) && !elements.has(url)) elements.set(url, makeAudio(meta));
  }
}

/** Record a song's resolved audio URL the first time TextAlive loads it. */
export function registerSource(songUrl: string, src: string, chorusMs: number) {
  if (!src || !isReplayable(src)) return; // no src, or a blob/MediaSource we can't replay → fallback
  console.info('[preview] cached replayable src', songUrl, '→', src);
  const prev = cache[songUrl];
  if (prev && prev.src === src) return;   // already known
  const meta: PreviewMeta = { src, chorusMs };
  cache[songUrl] = meta;
  saveCache(cache);
  if (!elements.has(songUrl)) elements.set(songUrl, makeAudio(meta));
}

function fadeIn(songUrl: string, a: HTMLAudioElement) {
  cancelAnimationFrame(fadeRaf);
  fadeFor = songUrl;
  const from = a.volume;
  const t0   = performance.now();
  const step = (t: number) => {
    if (fadeFor !== songUrl) return;      // superseded by a newer preview
    const k = Math.min(1, (t - t0) / FADE_MS);
    a.volume = from + (PREVIEW_VOLUME - from) * k;
    if (k < 1) fadeRaf = requestAnimationFrame(step);
  };
  fadeRaf = requestAnimationFrame(step);
}

/**
 * Play a song's preview instantly. Returns false if we haven't resolved this
 * song's audio yet — the caller should fall back to the TextAlive path, which
 * will register the source for next time.
 */
export function play(songUrl: string, onPlaying?: () => void, onError?: () => void): boolean {
  const a = elements.get(songUrl);
  if (!a) return false;

  if (current === songUrl && !a.paused) { onPlaying?.(); return true; }  // already audible

  a.addEventListener('error', () => {           // bad/expired URL → drop it, let caller fall back
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
      try { a.currentTime = start; } catch { /* */ }
    }
  }

  a.volume = 0;
  const t0 = performance.now();
  a.addEventListener('playing', () => {
    const buffered = a.buffered.length ? `${a.buffered.start(0).toFixed(0)}–${a.buffered.end(a.buffered.length - 1).toFixed(0)}s` : 'none';
    console.info(`[preview] audible in ${Math.round(performance.now() - t0)}ms (readyState=${a.readyState}, buffered=${buffered})`);
    onPlaying?.();
  }, { once: true });

  const p = a.play();
  if (p) p.then(() => fadeIn(songUrl, a)).catch(() => { /* autoplay blocked or dead url */ });
  else fadeIn(songUrl, a);
  return true;
}

/** Stop the current preview (on leaving a song or starting full playback). */
export function stop() {
  if (!current) return;
  elements.get(current)?.pause();
  current = '';
  fadeFor = '';
  cancelAnimationFrame(fadeRaf);
}
