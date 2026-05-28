import './style.css';
import { Player, IPlayerApp, IWord, IPhrase, IBeat, IChar } from 'textalive-app-api';
import { canvas, animate, glassInnerUniforms, glassOuterUniforms, renderer, scene, cubeCamera, cubeLargeCamera, triggerBeat } from './renderer';
import { mountSphereSongSelect } from './sphereSelect';
import type { WheelItem } from './sphereSelect';
import type { SongOption } from './songSelect';
import songs from './songs';
import { initLyrics, setWord, setChar, buildLayout } from './lyrics';
import { clearAllParticles } from './particles';
import * as previewAudio from './previewAudio';

// TextAlive's loaders occasionally reject internally (e.g. a lyric diff fetch
// returns null) in a promise we can't reach from our awaited createFromSongUrl.
// Keep those from surfacing as fatal "Uncaught (in promise)" noise — the song
// just fails to load and our own .catch handles the flow.
window.addEventListener('unhandledrejection', (e) => {
  const msg = String(e.reason?.message ?? e.reason ?? '');
  if (/sent\(\)|loadDiff|loadLyrics|n is null|\.data/.test(msg)) {
    console.warn('[textalive] internal load rejection (ignored):', msg);
    e.preventDefault();
  }
});

let fontReady = false;

cubeCamera.update(renderer, scene);
cubeLargeCamera.update(renderer, scene);
animate();

let timerReady = false;
document.getElementById('play')!.addEventListener('click', () => {
  if (timerReady) player.requestPlay();
});

const player = new Player({
  app: { token: import.meta.env.VITE_TEXTALIVE_TOKEN ?? '' },
  mediaElement: document.createElement('audio'),
});

// Rebuild standalone preview <audio> for songs we resolved in a past session.
previewAudio.hydrateFromCache(songs.map(s => s.url));

// Audio unlock primer. Browsers block programmatic audio that isn't tied to a
// user gesture, and our song loads finish seconds after the click that started
// them — so a deferred requestPlay() gets blocked. Playing a silent clip inside
// the first gesture grants the page audio permission for the rest of the
// session, so later (async) plays are allowed.
function makeSilentWav(): string {
  const sampleRate = 8000, samples = 80;            // ~0.01s of digital silence
  const buf = new ArrayBuffer(44 + samples);
  const v = new DataView(buf);
  const w = (off: number, s: string) => { for (let i = 0; i < s.length; i++) v.setUint8(off + i, s.charCodeAt(i)); };
  w(0, 'RIFF'); v.setUint32(4, 36 + samples, true); w(8, 'WAVE'); w(12, 'fmt ');
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, sampleRate, true); v.setUint32(28, sampleRate, true);
  v.setUint16(32, 1, true); v.setUint16(34, 8, true); w(36, 'data'); v.setUint32(40, samples, true);
  for (let i = 0; i < samples; i++) v.setUint8(44 + i, 128);   // 8-bit silence
  return URL.createObjectURL(new Blob([buf], { type: 'audio/wav' }));
}
function unlockAudio() {
  try {
    const a = new Audio(makeSilentWav());
    const p = a.play();
    if (p) p.then(() => a.pause()).catch(() => { /* still blocked; nothing we can do */ });
  } catch { /* */ }
}
for (const ev of ['pointerdown', 'keydown'] as const) {
  window.addEventListener(ev, unlockAudio, { once: true });
}

const wheelItems: WheelItem[] = [
  ...songs.map(s => ({ kind: 'song' as const, data: s })),
  { kind: 'settings' as const },
  { kind: 'language' as const },
  { kind: 'credits' as const},
];

function findChorusStart(): number {
  for (let t = 5000; t < 240000; t += 5000) {
    const c = player.findChorus(t);
    if (c) return t;
  }
  return 30000;
}

// ── Serialized song loader ─────────────────────────────────────────────────
// TextAlive's Player throws "createFrom* method calls cannot run in parallel"
// if loads overlap, so we keep at most one load in flight. `desired` always
// holds the latest request — rapid snaps coalesce down to wherever you land.

let currentUrl: string | null = null;   // song currently loaded / loading
let loading    = false;                  // a createFromSongUrl is in flight
let ready      = false;                  // timer ready for currentUrl
let previewing = false;                  // a TextAlive preview is playing
let inPlayback = false;                   // the selected song is playing (not a menu preview)
let awaitingSeek = false;                  // suppress lyrics until the seek-to-0 lands on select
let loadStart  = 0;                       // perf timestamp of the current load (for timing logs)
let desired: { song: SongOption; cb: () => void } | null = null;

// The focused song in the menu — its full data + lyric meshes are precomputed
// so selection is instant. Switching focus aborts the previous precompute.
let focusedUrl:     string | null = null;
let meshesBuiltUrl: string | null = null;

function requestLoad(song: SongOption, cb: () => void) {
  desired = { song, cb };
  reconcile();
}

// Build the 3D lyric meshes for the focused song once its video has loaded.
// Idempotent, and only builds for the song that's still focused — stale loads
// (the user moved on) are skipped.
function ensureMeshes() {
  if (!fontReady || !player.video || !focusedUrl) return;
  if (currentUrl !== focusedUrl) return;        // loaded video isn't the focused song
  if (meshesBuiltUrl === focusedUrl) return;    // already built
  buildLayout(player.video.phrases);
  meshesBuiltUrl = focusedUrl;
}

function reconcile() {
  if (!desired) return;
  const { song, cb } = desired;
  if (currentUrl === song.url) {
    if (ready && !loading) { desired = null; cb(); }  // already loaded → act now
    return;                                            // else: still loading / awaiting timer
  }
  if (loading) return;                                 // busy elsewhere; finally() retries
  loading    = true;
  currentUrl = song.url;
  ready      = false;

  // Drop the lyric diff — it's the source of the "loadDiff null" crash and only
  // refines lyric timing; base lyrics still drive the particles.
  const { lyricDiffId, ...video } = song.videoIds ?? {};
  void lyricDiffId;

  loadStart = performance.now();
  console.info('[load] start', song.url);
  player.createFromSongUrl(song.url, { video })
    .catch(err => console.warn('[load] failed', err))
    .finally(() => { loading = false; reconcile(); });
}

// Preview loading spinner. A generation token ignores stale show/hide calls
// when the user snaps faster than a preview can load.
let setPreviewLoading: (on: boolean) => void = () => {};
let previewGen      = 0;
let spinnerTimer:    number | undefined;
let spinnerMaxTimer: number | undefined;
function showLoadingSoon(gen: number) {
  clearTimeout(spinnerTimer);
  clearTimeout(spinnerMaxTimer);
  spinnerTimer    = window.setTimeout(() => { if (gen === previewGen) setPreviewLoading(true); }, 200);
  spinnerMaxTimer = window.setTimeout(() => { if (gen === previewGen) setPreviewLoading(false); }, 15000); // never stick
}
function hideLoading(gen: number) {
  if (gen !== previewGen) return;
  clearTimeout(spinnerTimer);
  clearTimeout(spinnerMaxTimer);
  setPreviewLoading(false);
}

const wheel = mountSphereSongSelect(
  wheelItems,
  // selected → full playback from the start (precompute is likely already done)
  (song) => {
    previewAudio.stop();
    previewing = false;
    // Don't stop the player — it's already playing the preview, so seeking to 0
    // keeps audio going within the user's click (no autoplay re-block). The
    // awaitingSeek gate below suppresses the chorus lyrics until the seek lands.
    clearAllParticles();           // wipe anything from the preview era
    currentWord = currentChar = currentPhrase = null;  // re-fire lyrics from position 0
    awaitingSeek = true;           // ignore lyrics until the seek-to-0 actually lands
    inPlayback = true;
    focusedUrl = song.url;
    canvas.style.display = 'block';
    requestLoad(song, () => {
      ensureMeshes();
      player.requestMediaSeek(0);
      player.requestPlay();        // no-op if already playing; resumes from 0
    });
  },
  () => { /* settings  - TODO */ },
  () => { /* language  - TODO */ },
  () => { /* credits   - TODO */ },
  // snap to song → two independent layers:
  //   1. preview audio: instant if cached, else play once the full load is ready
  //   2. precompute: always load full song + build lyric meshes (aborts on switch)
  (song) => {
    focusedUrl = song.url;
    if (previewing) { previewing = false; player.requestStop(); }  // stop prior TextAlive preview

    const gen = ++previewGen;
    showLoadingSoon(gen);                                           // spinner if it lags >200ms

    // Fallback preview: load on the main player and play from the chorus.
    const previewViaTextAlive = () => requestLoad(song, () => {
      ensureMeshes();
      if (focusedUrl === song.url && gen === previewGen) {
        previewing = true;
        player.requestMediaSeek(findChorusStart());
        player.requestPlay();
        hideLoading(gen);
      }
    });

    // Try instant cached audio. If the element errors (dead/expired URL), the
    // onError handler recovers by switching to the TextAlive preview.
    const poolOk = previewAudio.play(
      song.url,
      () => hideLoading(gen),                                       // audible → drop spinner
      () => { if (gen === previewGen) previewViaTextAlive(); },     // pool failed → recover now
    );

    if (poolOk) requestLoad(song, () => ensureMeshes());           // pool plays audio; just precompute
    else        previewViaTextAlive();                             // no pool → TextAlive plays + precomputes
  },
  // leave → stop audio; keep the focused song's precompute (harmless)
  () => {
    previewAudio.stop();
    if (previewing) { previewing = false; player.requestStop(); }
    ++previewGen;                                                  // invalidate pending spinner
    clearTimeout(spinnerTimer);
    clearTimeout(spinnerMaxTimer);
    setPreviewLoading(false);
  },
  // Start focused on the Settings card so the user must scroll to reach a song.
  // That scroll is the gesture that unlocks audio, so the preview can then play —
  // and nothing loads or autoplays on startup (no "play not allowed" errors).
  songs.length,
);
setPreviewLoading = wheel.setLoading;

let currentWord:   IWord   | null = null;
let currentChar:   IChar   | null = null;
let currentPhrase: IPhrase | null = null;
let currentBeat:   IBeat   | null = null;

 initLyrics(() => {
    fontReady = true;
    ensureMeshes();
  });

player.addListener({
  onAppReady(_app: IPlayerApp) {},

  onVideoReady() {
    console.info(`[load] videoReady +${Math.round(performance.now() - loadStart)}ms`, currentUrl);
    ensureMeshes();
  },

  onTimerReady() {
    console.info(`[load] timerReady +${Math.round(performance.now() - loadStart)}ms (playable)`, currentUrl);
    timerReady = true;
    ready      = true;

    // Capture the resolved audio URL so future previews of this song are instant.
    const el  = player.mediaElement as HTMLAudioElement | null;
    const src = el?.currentSrc || el?.src || '';
    if (currentUrl && src) {
      const chorusMs = findChorusStart();
      previewAudio.registerSource(currentUrl, src, chorusMs);
      console.info('[preview] resolved', currentUrl, '→', src, `chorus=${chorusMs}ms`);
    }

    reconcile();   // run the queued play action now that this song is ready
  },

  onTimeUpdate(position: number) {
    if (!player.video) return;


    const beat = player.findBeat(position);
    if (beat !== currentBeat) {
      currentBeat = beat;
      glassInnerUniforms.uBeatIntensity.value = 1.0;
      glassOuterUniforms.uBeatIntensity.value = 1.0;
      if (player.findChorus(position)) triggerBeat(1.0);
    }

    const phrase = player.video.findPhrase(position);
    if (phrase !== currentPhrase) {
      currentPhrase = phrase;
    }

    // Only form lyric particles during real playback — not while a menu preview
    // is running, or its words would linger into the song when you enter.
    // While awaitingSeek, the player is still finishing its jump back to 0 after
    // a preview at the chorus; ignore those stale (late-song) positions.
    if (inPlayback && !(awaitingSeek && position > 2000)) {
      awaitingSeek = false;

      const word = player.video.findWord(position);
      if (word !== currentWord) {
        currentWord = word;
        if (word) setWord(word);
      }

      const char = player.video.findChar(position);
      if (char !== currentChar) {
        currentChar = char;
        if (char) setChar(char);
      }
    }
  }
});
