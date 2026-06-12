import './style.css';
import * as THREE from 'three';
import { Player, IPlayerApp, IWord, IPhrase, IBeat, IChar } from 'textalive-app-api';
import { canvas, animate, glassInnerUniforms, glassOuterUniforms, renderer, scene, cubeCamera, cubeLargeCamera, triggerBeat, camera, controls } from './renderer';
import { mountSphereSongSelect, getLastMenuParticles } from './sphereSelect';
import type { WheelItem, DiParticle } from './sphereSelect';
import type { SongOption } from './songSelect';
import songs from './songs';
import { initLyrics, setWord, setChar, clearCurrentWord, clearPhrase, buildLayout, displayStaticText, clearStaticText, clearLyricMeshes } from './lyrics';
import { clearAllParticles, activateWordParticles, setFadeRate, COUNT } from './particles';
import * as previewAudio from './previewAudio';
import { getVolume } from './volume';
import { enterSettings, leaveSettings } from './settingsScene';

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

const player = new Player({
  app: { token: import.meta.env.VITE_TEXTALIVE_TOKEN ?? '' },
  mediaElement: document.createElement('audio'),
});

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
  { kind: 'credits' as const },
];

function findChorusStart(): number {
  for (let t = 5000; t < 240000; t += 5000) {
    const c = player.findChorus(t);
    if (c) return t;
  }
  return 30000;
}

let currentUrl: string | null = null;   // song currently loaded / loading
let loading = false; // a createFromSongUrl is in flight
let ready = false; // timer ready for currentUrl
let previewing = false; // a TextAlive preview is playing
let inPlayback   = false; // the selected song is playing (not a menu preview)
let utilityView: 'settings' | 'credits' | null = null;
let awaitingSeek = false; // suppress lyrics until the seek-to-0 lands on select
let loadStart  = 0; // perf timestamp of the current load (for timing logs)
let desired: { song: SongOption; cb: () => void } | null = null;

let backGen = 0;

let focusedUrl:     string | null = null;
let meshesBuiltUrl: string | null = null;

function requestLoad(song: SongOption, cb: () => void) {
  desired = { song, cb };
  reconcile();
}

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
    return; // else: still loading / awaiting timer
  }
  if (loading) return; // busy elsewhere; finally() retries
  loading = true;
  currentUrl = song.url;
  ready = false;

  // Drop the lyric diff-> it's the source of the "loadDiff null" crash and only
  // refines lyric timing; base lyrics still drive the particles.
  const { lyricDiffId, ...video } = song.videoIds ?? {};
  void lyricDiffId;

  loadStart = performance.now();
  console.info('[load] start', song.url);
  player.createFromSongUrl(song.url, { video })
    .catch(err => console.warn('[load] failed', err))
    .finally(() => { loading = false; reconcile(); });
}

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

const backBtn = document.createElement('button');
backBtn.id = 'back';
backBtn.textContent = '← Back';
backBtn.style.display = 'none';
document.body.appendChild(backBtn);

let selectedSongIndex = songs.length; // tracks which song is active so we return to it
let wheel = remountMenu(songs.length);

function remountMenu(returnIndex = songs.length, hidden = false): ReturnType<typeof mountSphereSongSelect> {
  const m = mountSphereSongSelect(
    wheelItems,
    (song) => {
      previewAudio.stop();
      previewing = false;
      // Don't stop the player — it's already playing the preview, so seeking to 0
      // keeps audio going within the user's click (no autoplay re-block). The
      // awaitingSeek gate below suppresses the chorus lyrics until the seek lands.
      clearAllParticles(); clearLyricMeshes(); // wipe anything from the preview era
      currentWord = currentChar = currentPhrase = null;  // re-fire lyrics from position 0
      awaitingSeek = true; // ignore lyrics until the seek-to-0 actually lands
      inPlayback = true;
      selectedSongIndex = songs.findIndex(s => s.url === song.url);
      if (selectedSongIndex < 0) selectedSongIndex = songs.length;
      focusedUrl = song.url;
      ++backGen;
      canvas.style.transition = '';
      canvas.style.opacity    = '1';
      canvas.style.display    = 'block';
      backBtn.style.display = 'block';
      requestLoad(song, () => {
        ensureMeshes();
        player.requestMediaSeek(0);
        player.volume = getVolume() * 100;
        player.requestPlay(); // no-op if already playing; resumes from 0
      });
    },
    () => {
      utilityView       = 'settings';
      selectedSongIndex = songs.length;
      ++backGen;
      canvas.style.transition = '';
      canvas.style.opacity    = '1';
      canvas.style.display    = 'block';
      backBtn.style.display   = 'block';
      clearAllParticles(); clearLyricMeshes();
      enterSettings(camera, canvas, controls);
    },
    () => {
      utilityView       = 'credits';
      selectedSongIndex = songs.length + 1;
      ++backGen;
      canvas.style.transition = '';
      canvas.style.opacity    = '1';
      canvas.style.display    = 'block';
      backBtn.style.display   = 'block';
      clearAllParticles(); clearLyricMeshes();
      setFadeRate(0);
      displayStaticText([
        'HOLOFRAGMENT',
        '',
        'Magical Mirai 2026',
        '',
        'Adrian Yip',
        '',
        'Three.js  TypeScript  Vite',
        'TextAlive App API',
      ]);
    },
    (song) => {
      focusedUrl = song.url;
      if (previewing) { previewing = false; player.requestStop(); }

      const gen = ++previewGen;
      showLoadingSoon(gen);

      const previewViaTextAlive = () => requestLoad(song, () => {
        ensureMeshes();
        if (focusedUrl === song.url && gen === previewGen) {
          previewing = true;
          player.requestMediaSeek(findChorusStart());
          player.volume = getVolume() * 100;
          player.requestPlay();
          hideLoading(gen);
        }
      });

      const poolOk = previewAudio.play(
        song.url,
        () => hideLoading(gen),
        () => { if (gen === previewGen) previewViaTextAlive(); },
      );

      if (poolOk) requestLoad(song, () => ensureMeshes());
      else previewViaTextAlive();
    },
    () => {
      previewAudio.stop();
      if (previewing) { previewing = false; player.requestStop(); }
      ++previewGen;
      clearTimeout(spinnerTimer);
      clearTimeout(spinnerMaxTimer);
      setPreviewLoading(false);
    },
    returnIndex,
    hidden,
  );
  setPreviewLoading = m.setLoading;
  return m;
}

backBtn.addEventListener('click', triggerBack);

function triggerBack() {
  if (!inPlayback && utilityView === null) return;
  const wasInPlayback = inPlayback;
  const wasUtility    = utilityView;
  inPlayback  = false;
  utilityView = null;
  backBtn.style.display = 'none';

  previewAudio.stop();
  if (wasInPlayback && (previewing || timerReady)) player.requestStop();
  previewing = false;
  currentWord = currentChar = currentPhrase = null;
  desired = null; // cancel any queued load callback so the song doesn't start after going back

  if (wasUtility === 'settings') leaveSettings(camera, controls);
  else { clearStaticText(); setFadeRate(0.25); }

  wheel.abortDisintegration();

  const menuPtcls = getLastMenuParticles();
  clearAllParticles(); clearLyricMeshes();
  if (menuPtcls.length > 0) {
    const { indices, samples, colors } = buildMenuTargets(menuPtcls);
    activateWordParticles(indices, samples, colors);
  }

  wheel = remountMenu(selectedSongIndex, true);
  const myWheel = wheel;
  const myGen   = ++backGen;

  setTimeout(() => {
    if (backGen !== myGen) return;
    myWheel.reveal();
  }, 500);
  setTimeout(() => {
    if (backGen !== myGen) return;
    canvas.style.transition = 'opacity 0.5s';
    canvas.style.opacity = '0';
    clearAllParticles();
    setTimeout(() => {
      if (backGen !== myGen) return;
      canvas.style.display = 'none';
      canvas.style.opacity = '1';
      canvas.style.transition = '';
    }, 520);
  }, 700);
}

function buildMenuTargets(menuParticles: DiParticle[]): { indices: Uint32Array; samples: Float32Array; colors: Float32Array } {
  const TOTAL = COUNT;
  const indices = new Uint32Array(TOTAL);
  const samples = new Float32Array(TOTAL * 4);
  const colors  = new Float32Array(TOTAL * 4);

  const plane     = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
  const raycaster = new THREE.Raycaster();
  const hit       = new THREE.Vector3();
  const ndc       = new THREE.Vector2();
  const menuCount = menuParticles.length;
  const worldPos  = new Float32Array(menuCount * 3);

  for (let j = 0; j < menuCount; j++) {
    const p = menuParticles[j];
    ndc.set(
      (p.x / window.innerWidth)  *  2 - 1,
      -(p.y / window.innerHeight) * 2 + 1,
    );
    raycaster.setFromCamera(ndc, camera);
    if (raycaster.ray.intersectPlane(plane, hit)) {
      worldPos[j * 3]     = hit.x;
      worldPos[j * 3 + 1] = hit.y;
      worldPos[j * 3 + 2] = hit.z;
    }
  }

  const pool = new Uint32Array(TOTAL);
  for (let i = 0; i < TOTAL; i++) pool[i] = i;
  for (let i = TOTAL - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = pool[i]; pool[i] = pool[j]; pool[j] = tmp;
  }

  for (let i = 0; i < TOTAL; i++) {
    indices[i] = pool[i];
    const j = i % menuCount;
    samples[i * 4]     = worldPos[j * 3];
    samples[i * 4 + 1] = worldPos[j * 3 + 1];
    samples[i * 4 + 2] = worldPos[j * 3 + 2];
    samples[i * 4 + 3] = 0;
    colors[i * 4]     = menuParticles[j].r / 255;
    colors[i * 4 + 1] = menuParticles[j].g / 255;
    colors[i * 4 + 2] = menuParticles[j].b / 255;
    colors[i * 4 + 3] = 1.0;
  }

  return { indices, samples, colors };
}

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

    const el  = player.mediaElement as HTMLAudioElement | null;
    const src = el?.currentSrc || el?.src || '';
    if (currentUrl && src) {
      const chorusMs = findChorusStart();
      previewAudio.registerSource(currentUrl, src, chorusMs);
      console.info('[preview] resolved', currentUrl, '→', src, `chorus=${chorusMs}ms`);
    }

    reconcile();
  },

  onTimeUpdate(position: number) {
    if (!player.video) return;


    const beat = player.findBeat(position);
    if (beat !== currentBeat) {
      currentBeat = beat;
      glassInnerUniforms.uBeatIntensity.value = 1.0;
      glassOuterUniforms.uBeatIntensity.value = 1.0;
      if (player.findChorus(position)) triggerBeat(1.0);
      wheel.beat(1.0);
    }

    const phrase = player.video.findPhrase(position);
    if (phrase !== currentPhrase) {
      if (currentPhrase && inPlayback) {
        const stale = currentPhrase;
        setTimeout(() => clearPhrase(stale), 900);
      }
      currentPhrase = phrase;
    }

    if (inPlayback && !(awaitingSeek && position > 2000)) {
      awaitingSeek = false;

      const word = player.video.findWord(position);
      if (word !== currentWord) {
        currentWord = word;
        if (word) setWord(word);
        else clearCurrentWord();
      }

      const char = player.video.findChar(position);
      if (char !== currentChar) {
        currentChar = char;
        if (char) setChar(char);
      }
    }
  }
});
