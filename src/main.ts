import './style.css';
import * as THREE from 'three';
import { Player, IPlayerApp, IWord, IPhrase, IBeat, IChar, IChord } from 'textalive-app-api';
import { canvas, animate, glassInnerUniforms, glassOuterUniforms, renderer, scene, cubeCamera, cubeLargeCamera, triggerBeat, setBeatProgress, setChorusFactor, fireDownbeat, camera, controls, cylinderMesh, flushCubemapNow, setCylinderSegments, setCylinderOpacity, setMenuMode, setSettingsMode, setSongMode, setHideOuterSphere, setOuterSphereFade, menuState } from './renderer';
import { setAuroraVocalAmp, setAuroraChorusTarget, setChordTarget } from './aurora';
import { mountSphereSongSelect, getLastMenuParticles, primeMenuParticles } from './sphereSelect';
import { initMenuReflect } from './menuReflect';
import type { WheelItem, DiParticle } from './sphereSelect';
import type { SongOption } from './songSelect';
import songs from './songs';
import { initLyrics, setWord, setChar, clearCurrentWord, clearPhrase, buildLayout, displayStaticText, clearStaticText, clearLyricMeshes, getLayoutHalfExtents, getWordHalfExtentX } from './lyrics';
import { clearAllParticles, activateWordParticles, setFadeRate, setParticleAlpha, COUNT, points as particlePoints } from './particles';
import * as previewAudio from './previewAudio';
import { getVolume } from './volume';
import { enterSettings, leaveSettings, settingsCameraZ, settingsCameraY } from './settingsScene';
import { getLanguage } from './language';

// TextAlive sometimes rejects a promise we cannot reach from our own load call.
// Hide that noise so it does not show up as an uncaught error. Our own catch
// already handles a failed load.
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
  vocalAmplitudeEnabled: true,
});

previewAudio.hydrateFromCache(songs.map(s => s.url));

// Builds a tiny silent WAV as a data URL.
// Browsers block audio that is not tied to a tap or click, and our songs finish
// loading a few seconds after the tap. Playing this silent clip during the first
// tap unlocks audio for the rest of the visit so later plays are allowed.
function makeSilentWav(): string {
  const sampleRate = 8000, samples = 80; // about 0.01s of silence
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
// Plays the silent clip on the first tap to unlock audio.
function unlockAudio() {
  try {
    const a = new Audio(makeSilentWav());
    const p = a.play();
    if (p) p.then(() => a.pause()).catch(() => {}); // still blocked, nothing we can do
  } catch {}
}
for (const ev of ['pointerdown', 'keydown'] as const) {
  window.addEventListener(ev, unlockAudio, { once: true });
}

const wheelItems: WheelItem[] = [
  ...songs.map(s => ({ kind: 'song' as const, data: s })),
  { kind: 'settings' as const },
  { kind: 'credits' as const },
];

// Finds a time near the first chorus to start previews from.
function findChorusStart(): number {
  for (let t = 5000; t < 240000; t += 5000) {
    const c = player.findChorus(t);
    if (c) return t;
  }
  return 30000;
}

let currentUrl: string | null = null; // song currently loaded / loading
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

// Asks to load a song and run a callback once it is ready.
function requestLoad(song: SongOption, cb: () => void) {
  desired = { song, cb };
  reconcile();
}

// Builds the lyric layout once the font and song are both ready.
function ensureMeshes() {
  if (!fontReady || !player.video || !focusedUrl) return;
  if (currentUrl !== focusedUrl) return;
  if (meshesBuiltUrl === focusedUrl) return;
  if (!player.video.phrases?.length) return;
  buildLayout(player.video.phrases);
  meshesBuiltUrl = focusedUrl;
  if (inPlayback) {
    setFlyTargetZ(effectiveSongCameraZ(focusedUrl));
  }
}

// Loads the desired song, retrying once any in flight load finishes.
function reconcile() {
  if (!desired) return;
  const { song, cb } = desired;
  if (currentUrl === song.url) {
    if (ready && !loading) { desired = null; cb(); }  // already loaded so act now
    return; // else: still loading / awaiting timer
  }
  if (loading) return; // busy elsewhere; finally() retries
  loading = true;
  currentUrl = song.url;
  ready = false;

  // Skip the lyric diff. It causes a load crash and only refines timing.
  // The base lyrics still drive the particles.
  const { lyricDiffId, ...video } = song.videoIds ?? {};
  void lyricDiffId;

  loadStart = performance.now();
  console.info('[load] start', song.url);
  player.createFromSongUrl(song.url, { video })
    .catch(err => console.warn('[load] failed', err))
    .finally(() => { loading = false; reconcile(); });
}

let setPreviewLoading: (on: boolean) => void = () => {};
let previewGen = 0;
let spinnerTimer: number | undefined;
let spinnerMaxTimer: number | undefined;
// Shows the loading spinner after a short delay and hides it after a timeout.
function showLoadingSoon(gen: number) {
  clearTimeout(spinnerTimer);
  clearTimeout(spinnerMaxTimer);
  spinnerTimer = window.setTimeout(() => { if (gen === previewGen) setPreviewLoading(true); }, 200);
  spinnerMaxTimer = window.setTimeout(() => { if (gen === previewGen) setPreviewLoading(false); }, 15000); // never stick
}
// Hides the loading spinner for the given request.
function hideLoading(gen: number) {
  if (gen !== previewGen) return;
  clearTimeout(spinnerTimer);
  clearTimeout(spinnerMaxTimer);
  setPreviewLoading(false);
}

let wordCameraZTarget = 12;
let wordCameraZRaf = 0;
let phraseCameraZMax = 0;

// Eases the camera distance toward its target each frame.
function tickWordCameraZ() {
  const diff = wordCameraZTarget - camera.position.z;
  if (Math.abs(diff) < 0.05) {
    camera.position.z = wordCameraZTarget;
    wordCameraZRaf = 0;
    return;
  }
  camera.position.z += diff * 0.06;
  wordCameraZRaf = requestAnimationFrame(tickWordCameraZ);
}

// Sets the target camera distance for the current word.
function setWordCameraZ(z: number) {
  wordCameraZTarget = z;
  if (flyRaf) return;
  if (!wordCameraZRaf) wordCameraZRaf = requestAnimationFrame(tickWordCameraZ);
}

let flyRaf = 0;
let flyGen = 0;
const flyTo = new THREE.Vector3();
const flyLookAt = new THREE.Vector3();
const flyFromPos = new THREE.Vector3();
const flyFromLook = new THREE.Vector3();

// Smoothly flies the camera to a new position and look target.
function flyCamera(toY: number, toZ: number, lookY: number, durationMs: number, onArrive?: () => void) {
  cancelAnimationFrame(flyRaf);
  cancelAnimationFrame(wordCameraZRaf); wordCameraZRaf = 0;
  const gen = ++flyGen;
  flyTo.set(0, toY, toZ);
  flyLookAt.set(0, lookY, 0);
  flyFromPos.copy(camera.position);
  flyFromLook.copy(controls.target);
  const start = performance.now();
  // Moves the camera a little closer to the target each frame.
  function step(now: number) {
    if (flyGen !== gen) return;
    const k = Math.min((now - start) / durationMs, 1);
    const e = 1 - Math.pow(1 - k, 3);
    camera.position.lerpVectors(flyFromPos, flyTo, e);
    controls.target.lerpVectors(flyFromLook, flyLookAt, e);
    camera.lookAt(controls.target);
    if (k < 1) flyRaf = requestAnimationFrame(step);
    else { flyRaf = 0; onArrive?.(); }
  }
  flyRaf = requestAnimationFrame(step);
}

// Stops any camera fly in progress.
function cancelFly() { cancelAnimationFrame(flyRaf); flyRaf = 0; ++flyGen; }

// Updates the fly target distance, or eases there if no fly is running.
function setFlyTargetZ(z: number) {
  if (flyRaf) flyTo.z = z;
  else setWordCameraZ(z);
}

// Works out the camera distance that frames the lyrics nicely.
function computeSongCameraZ(): number {
  const { halfH, halfW } = getLayoutHalfExtents();
  const fovHalf = (camera.fov / 2) * (Math.PI / 180);
  const aspect  = canvas.clientWidth / canvas.clientHeight;

  const MOBILE_FILL = 0.70;
  const MOBILE_MIN_Z = 9;
  const PC_FILL = 0.70;
  const PC_MIN_Z = 9;

  const isMobileView = window.innerWidth < window.innerHeight;
  const minZ = isMobileView ? MOBILE_MIN_Z : PC_MIN_Z;

  if (isMobileView) {
    const zForW = halfW / (Math.tan(fovHalf) * aspect * MOBILE_FILL);
    return Math.max(zForW, minZ);
  }
  const zForH = halfH / (Math.tan(fovHalf) * PC_FILL);
  return Math.max(zForH, PC_MIN_Z);
}

// Songs that look best with the camera outside the outer sphere so its
// reflections show. These need the camera pulled back past the sphere.
const OUTSIDE_SPHERE_SONGS = new Set([
  'https://piapro.jp/t/6W2N/20251215164617', // Answer Me
  'https://piapro.jp/t/PNpQ/20251209170719', // Shutter Chance
  'https://piapro.jp/t/QBdL/20251215094303', // Toritsukulogy
]);

// Returns the camera distance for a song, pulled back for some songs.
function effectiveSongCameraZ(url: string): number {
  const z = computeSongCameraZ();
  return OUTSIDE_SPHERE_SONGS.has(url) ? Math.max(z, 25) : z;
}

const backBtn = document.createElement('button');
backBtn.id = 'back';
backBtn.textContent = '← Back';
backBtn.style.display = 'none';
document.body.appendChild(backBtn);

let selectedSongIndex = songs.length; // tracks which song is active so we return to it
setCylinderSegments(wheelItems.length);
initMenuReflect(wheelItems);
setMenuMode(true);
// Pre-set the cylinder angle so face 0 isn't visible for one frame before carousel tick fires.
menuState.cylAngle = -selectedSongIndex * (2 * Math.PI / wheelItems.length);
cylinderMesh.visible = false;
particlePoints.visible = false;
let wheel = remountMenu(songs.length, true);

// Builds a fresh song wheel and wires up all of its callbacks.
function remountMenu(returnIndex = songs.length, hidden = false): ReturnType<typeof mountSphereSongSelect> {
  const m = mountSphereSongSelect(
    wheelItems,
    (song) => {
      previewAudio.stop();
      previewing = false;
      // Do not stop the player. It is already playing the preview, so seeking to
      // the start keeps the sound going inside the same tap and avoids a fresh
      // autoplay block. The awaitingSeek flag hides chorus lyrics until it lands.
      clearAllParticles(); clearLyricMeshes();
      currentWord = currentChar = currentPhrase = null;
      awaitingSeek = true;
      songEndFired = false;
      inPlayback = true;
      selectedSongIndex = songs.findIndex(s => s.url === song.url);
      if (selectedSongIndex < 0) selectedSongIndex = songs.length;
      focusedUrl = song.url;
      ++backGen;
      canvas.style.transition = '';
      canvas.style.opacity = '1';
      setHideOuterSphere(false);
      setMenuMode(false);
      setOuterSphereFade(1);
      setSongMode(true);
      cylinderMesh.visible = false;
      particlePoints.visible = true;
      controls.minDistance = 8;
      controls.maxDistance = 90;
      flyCamera(0, effectiveSongCameraZ(song.url), 0, 2000);
      flushCubemapNow();
      backBtn.style.display = 'block';
      requestLoad(song, () => {
        ensureMeshes();
        player.requestMediaSeek(0);
        player.volume = getVolume() * 100;
        player.requestPlay();
      });
    },
    () => {
      utilityView = 'settings';
      selectedSongIndex = songs.length;
      ++backGen;
      canvas.style.transition = '';
      canvas.style.opacity = '1';
      setHideOuterSphere(false);
      setMenuMode(false);
      setOuterSphereFade(1);
      setSettingsMode(true);
      cylinderMesh.visible = false;
      particlePoints.visible = true;
      controls.enabled = false;
      controls.minDistance = 1;
      controls.maxDistance = 90;
      flushCubemapNow();
      backBtn.style.display = 'block';
      clearAllParticles(); clearLyricMeshes();
      flyCamera(settingsCameraY(camera, canvas), settingsCameraZ(camera, canvas),
                settingsCameraY(camera, canvas), 2000,
                () => enterSettings(camera, canvas, controls));
    },
    () => {
      utilityView = 'credits';
      selectedSongIndex = songs.length + 1;
      ++backGen;
      canvas.style.transition = '';
      canvas.style.opacity = '1';
      setHideOuterSphere(false);
      setMenuMode(false);
      setOuterSphereFade(1);
      setSettingsMode(true);
      cylinderMesh.visible = false;
      {
        const creditLines = getLanguage() === 'ja'
          ? [
              'HOLOFRAGMENT',
              'マジカルミライ 2026',
              'Adrian Yip   Eason Chou',
              '',
              'Three.js  TypeScript  Vite',
              'TextAlive App API  AIST RecMus',
              '初音ミク © Crypton Future Media',
              '',
              '楽曲のアートワークは各楽曲の',
              'YouTube動画のサムネイルを使用しています',
              '',
              '楽曲提供',
              '',
              'こたえて / imie',
              '',
              'アフター・ザ・カーテン / Rulmry',
              '',
              'シャッターチャンス / 夜未アガリ',
              '',
              '世界最後の音楽隊 /',
              '夏山よつぎ × ど〜ぱみん',
              '',
              'トリツクロジー / 鶴三',
              '',
              'TAKEOVER / Twinfield',
            ]
          : [
              'HOLOFRAGMENT',
              'Magical Mirai 2026',
              'Adrian Yip   Eason Chou',
              '',
              'Three.js  TypeScript  Vite',
              'TextAlive App API  AIST RecMus',
              'Hatsune Miku © Crypton Future Media',
              '',
              'All song artwork is sourced from their',
              'corresponding YouTube video thumbnails',
              '',
              'Answer Me by imie',
              '',
              'After the Curtain by Rulmry',
              '',
              'Shutter Chance by Yamiagari',
              '',
              'The Last March on Earth by',
              'Natsuyama Yotsugi × Dopamine',
              '',
              'Toritsukulogy by Tsuruzou',
              '',
              'TAKEOVER by Twinfield',
            ];
        const camZ = 23;
        controls.maxDistance = 90;
        controls.enabled = false;
        flushCubemapNow();
        backBtn.style.display = 'block';
        clearAllParticles(); clearLyricMeshes();
        setFadeRate(0);
        const fovHalf = (camera.fov / 2) * (Math.PI / 180);
        const halfH = Math.tan(fovHalf) * camZ * 0.62;
        const textScale = halfH / (creditLines.length * 1.3);
        flyCamera(0, camZ, 0, 2000, () => displayStaticText(creditLines, textScale));
      }
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

// Returns from a song or panel back to the menu with a fly out and crossfade.
function triggerBack() {
  if (!inPlayback && utilityView === null) return;
  cancelFly();
  const wasInPlayback = inPlayback;
  const wasUtility = utilityView;
  inPlayback = false;
  utilityView = null;
  backBtn.style.display = 'none';

  previewAudio.stop();
  if (wasInPlayback && (previewing || timerReady)) player.requestStop();
  previewing = false;
  currentWord = currentChar = currentPhrase = null;
  desired = null; // cancel any queued load callback so the song doesn't start after going back

  const flyFromPos    = camera.position.clone();
  const flyFromTarget = controls.target.clone();

  if (wasUtility === 'settings') {
    setSettingsMode(false);
    leaveSettings(camera, controls);
  } else {
    if (wasUtility === 'credits') setSettingsMode(false);
    clearStaticText(); setFadeRate(0.25);
    if (wasInPlayback) {
      setSongMode(false);
      cancelAnimationFrame(wordCameraZRaf);
      wordCameraZRaf = 0;
      wordCameraZTarget = 58;
    }
  }

  controls.enabled = false;
  controls.minDistance = 22;
  controls.maxDistance = 90;

  camera.position.set(0, 0, 58);
  controls.target.set(0, 0, 0);
  camera.lookAt(controls.target);
  camera.updateMatrixWorld(true);

  const prevWheel = wheel;
  prevWheel.abortDisintegration();

  const menuPtcls = getLastMenuParticles();
  clearAllParticles(); clearLyricMeshes();
  if (menuPtcls.length > 0) {
    const { indices, samples, colors } = buildMenuTargets(menuPtcls);
    activateWordParticles(indices, samples, colors);
    setParticleAlpha(1);
    particlePoints.visible = true;
  } else {
    particlePoints.visible = false;
  }

  wheel = remountMenu(selectedSongIndex, true);
  prevWheel.cleanup();
  const myWheel = wheel;
  const myGen = ++backGen;

  menuState.cylAngle = -selectedSongIndex * (2 * Math.PI / wheelItems.length);
  setHideOuterSphere(false);
  setCylinderOpacity(0);
  cylinderMesh.visible = true;

  const FLY_MS = 2000;
  const REVEAL_MS = 700;

  camera.position.copy(flyFromPos);
  controls.target.copy(flyFromTarget);
  flyCamera(0, 58, 0, FLY_MS, () => {
    controls.enabled = true;
    controls.update();
  });
  crossfadeToMenu(myGen, FLY_MS);

  setTimeout(() => {
    if (backGen !== myGen) return;
    myWheel.reveal();
  }, FLY_MS - REVEAL_MS);
}

// Fades the menu cylinder in while the song particles fade out.
function crossfadeToMenu(gen: number, duration = 700) {
  const TARGET_OPACITY = 0.7;
  const start = performance.now();
  // Advances the crossfade a little each frame.
  function step(now: number) {
    if (backGen !== gen) return;
    const k = Math.min((now - start) / duration, 1);
    setCylinderOpacity(TARGET_OPACITY * k * k);
    setParticleAlpha(Math.max(0, 1 - k * 1.4));
    setOuterSphereFade(1 - smoothstep(0.55, 1.0, k));
    if (k < 1) {
      requestAnimationFrame(step);
    } else {
      clearAllParticles();
      particlePoints.visible = false;
      setParticleAlpha(1);
      setMenuMode(true);
      setOuterSphereFade(1);
    }
  }
  requestAnimationFrame(step);
}

// Smooth ramp from zero to one between two edges.
function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.min(Math.max((x - edge0) / (edge1 - edge0), 0), 1);
  return t * t * (3 - 2 * t);
}

// Turns captured menu points into particle targets in world space.
function buildMenuTargets(menuParticles: DiParticle[]): { indices: Uint32Array; samples: Float32Array; colors: Float32Array } {
  const TOTAL = COUNT;
  const indices = new Uint32Array(TOTAL);
  const samples = new Float32Array(TOTAL * 4);
  const colors  = new Float32Array(TOTAL * 4);

  const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
  const raycaster = new THREE.Raycaster();
  const hit = new THREE.Vector3();
  const ndc = new THREE.Vector2();
  const menuCount = menuParticles.length;
  const worldPos = new Float32Array(menuCount * 3);

  for (let j = 0; j < menuCount; j++) {
    const p = menuParticles[j];
    ndc.set(
      (p.x / window.innerWidth)  *  2 - 1,
      -(p.y / window.innerHeight) * 2 + 1,
    );
    raycaster.setFromCamera(ndc, camera);
    if (raycaster.ray.intersectPlane(plane, hit)) {
      worldPos[j * 3] = hit.x;
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
    samples[i * 4] = worldPos[j * 3];
    samples[i * 4 + 1] = worldPos[j * 3 + 1];
    samples[i * 4 + 2] = worldPos[j * 3 + 2];
    samples[i * 4 + 3] = 0;
    colors[i * 4] = menuParticles[j].r / 255;
    colors[i * 4 + 1] = menuParticles[j].g / 255;
    colors[i * 4 + 2] = menuParticles[j].b / 255;
    colors[i * 4 + 3] = 1.0;
  }

  return { indices, samples, colors };
}

let songEndFired = false;
let currentWord: IWord | null = null;
let currentChar: IChar | null = null;
let currentPhrase: IPhrase | null = null;
let currentBeat: IBeat | null = null;
let currentChord: IChord | null = null;

// Not used -> This was planned to be for the aurora background, where it would change 
const SEMITONES = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
const FLAT_MAP: Record<string,string> = {
  Db:'C#',Eb:'D#',Fb:'E',Gb:'F#',Ab:'G#',Bb:'A#',Cb:'B',
};

// Helper that turns one hue channel into a colour value.
function hue2rgb(p: number, q: number, t: number): number {
  if (t < 0) t += 1; if (t > 1) t -= 1;
  if (t < 1/6) return p + (q - p) * 6 * t;
  if (t < 1/2) return q;
  if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
  return p;
}

// Maps a chord name to a colour using its root note and major or minor feel.
function chordToRgb(name: string): [number, number, number] {
  let root = name.length > 1 && (name[1] === '#' || name[1] === 'b')
    ? name.slice(0, 2) : name[0];
  root = FLAT_MAP[root] ?? root;
  const idx = SEMITONES.indexOf(root);
  const hue = idx >= 0 ? (idx / 12) * 360 : 0;
  const minor = /m(?!aj)/i.test(name.slice(root.length));
  const s = minor ? 0.65 : 0.85;
  const l = minor ? 0.48 : 0.58;
  const h = hue / 360;
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  return [hue2rgb(p, q, h + 1/3), hue2rgb(p, q, h), hue2rgb(p, q, h - 1/3)];
}

let introShown = false;

// Plays the opening title sequence then reveals the menu.
function showIntro() {
  if (introShown) return;
  introShown = true;

  const scanlines = document.createElement('div');
  Object.assign(scanlines.style, {
    position: 'fixed',
    inset: '0',
    pointerEvents: 'none',
    zIndex: '5',
    background: 'repeating-linear-gradient(0deg,transparent,transparent 2px,rgba(0,0,0,0.18) 2px,rgba(0,0,0,0.18) 4px)',
    opacity: '0',
    transition: 'opacity 0.4s',
  });
  document.body.appendChild(scanlines);
  requestAnimationFrame(() => { scanlines.style.opacity = '1'; });

  const introLines = ['HOLOFRAGMENT', '初音ミク', 'Magical Mirai 2026'];
  const fovHalf = (camera.fov / 2) * (Math.PI / 180);
  const halfH = Math.tan(fovHalf) * 58;
  const textScale = (halfH * 0.55) / (introLines.length * 2.6);

  particlePoints.visible = true;
  setFadeRate(0);

  setTimeout(() => { displayStaticText(introLines, textScale); }, 300);

  const myGen = ++backGen;
  setTimeout(() => {
    if (backGen !== myGen) return;

    scanlines.style.transition = 'opacity 0.5s';
    scanlines.style.opacity = '0';
    setTimeout(() => scanlines.remove(), 600);

    clearStaticText();

    const menuPtcls = primeMenuParticles();
    if (menuPtcls.length > 0) {
      const { indices, samples, colors } = buildMenuTargets(menuPtcls);
      activateWordParticles(indices, samples, colors);
      setParticleAlpha(1);
    }

    setTimeout(() => {
      if (backGen !== myGen) return;
      wheel.reveal();
      menuState.cylAngle = -selectedSongIndex * (2 * Math.PI / wheelItems.length);
      setMenuMode(true);
      setHideOuterSphere(false);
      setFadeRate(0.25);
      setCylinderOpacity(0);
      cylinderMesh.visible = true;
      crossfadeToMenu(myGen);
    }, 500);
  }, 2800);
}

// Start the app once the lyric font has loaded.
initLyrics(() => {
  fontReady = true;
  ensureMeshes();
  showIntro();
});

// Listens to the TextAlive player and drives the visuals from the song.
player.addListener({
  onAppReady(_app: IPlayerApp) {},

  // Goes back to the menu shortly after the song stops.
  onStop() {
    if (inPlayback) setTimeout(() => { if (inPlayback) triggerBack(); }, 2000);
  },

  // Builds the lyric layout once the song video data is ready.
  onVideoReady() {
    console.info(`[load] videoReady +${Math.round(performance.now() - loadStart)}ms`, currentUrl);
    ensureMeshes();
  },

  // Marks the song playable and saves its audio link for fast previews.
  onTimerReady() {
    console.info(`[load] timerReady +${Math.round(performance.now() - loadStart)}ms (playable)`, currentUrl);
    timerReady = true;
    ready      = true;

    const el  = player.mediaElement as HTMLAudioElement | null;
    const src = el?.currentSrc || el?.src || '';
    if (currentUrl && src) {
      const chorusMs = findChorusStart();
      previewAudio.registerSource(currentUrl, src, chorusMs);
      console.info('[preview] resolved', currentUrl, '->', src, `chorus=${chorusMs}ms`);
    }

    reconcile();
  },

  // Runs as the song plays and drives lyrics, beats, chords, and the camera.
  onTimeUpdate(position: number) {
    if (!player.video) return;

    if (inPlayback && !songEndFired && player.video.duration > 0
        && position >= player.video.duration - 300) {
      songEndFired = true;
      setTimeout(() => { if (inPlayback) triggerBack(); }, 2000);
    }

    const chorus = player.findChorus(position);
    const inChorus = !!chorus;

    const beat = player.findBeat(position);
    if (beat !== currentBeat) {
      currentBeat = beat;
      glassInnerUniforms.uBeatIntensity.value = 1.0;
      glassOuterUniforms.uBeatIntensity.value = 1.0;

      if (beat && beat.position === 0) {
        const str = inChorus ? 1.0 : 0.55;
        const dir = new THREE.Vector3(
          (Math.random() - 0.5) * 2,
          Math.random() * 0.6 + 0.2,
          (Math.random() - 0.5) * 2,
        ).normalize();
        fireDownbeat(str, dir);
      }

      if (inChorus) triggerBeat(1.0);
      wheel.beat(1.0);
    }

    if (beat) {
      const prog = Math.max(0, Math.min(1, beat.progress(position)));
      setBeatProgress(prog * (inChorus ? 1.0 : 0.45));
    }

    if (player.getVocalAmplitude) setAuroraVocalAmp(player.getVocalAmplitude(position));

    setChorusFactor(inChorus ? 1.0 : 0.0);
    setAuroraChorusTarget(inChorus ? 1.0 : 0.0);

    const chord = player.findChord(position);
    if (chord !== currentChord) {
      currentChord = chord;
      if (chord) {
        const [r, g, b] = chordToRgb(chord.name);
        setChordTarget(r, g, b);
      }
    }

    const phrase = player.video.findPhrase(position);
    if (phrase !== currentPhrase) {
      if (currentPhrase && inPlayback) {
        const stale = currentPhrase;
        setTimeout(() => clearPhrase(stale), 900);
      }
      currentPhrase = phrase;
      if (focusedUrl && inPlayback) {
        phraseCameraZMax = effectiveSongCameraZ(focusedUrl);
        setWordCameraZ(phraseCameraZMax);
      }
    }

    if (inPlayback && !(awaitingSeek && position > 2000)) {
      awaitingSeek = false;

      const word = player.video.findWord(position);
      if (word !== currentWord) {
        currentWord = word;
        if (word) {
          setWord(word);
          if (focusedUrl) {
            const fovHalf = (camera.fov / 2) * (Math.PI / 180);
            const aspect = canvas.clientWidth / canvas.clientHeight;
            const halfX = getWordHalfExtentX(word);
            const zForWord = halfX / (Math.tan(fovHalf) * aspect * 0.70);
            const baseZ = effectiveSongCameraZ(focusedUrl);
            phraseCameraZMax = Math.max(phraseCameraZMax, zForWord, baseZ);
            setWordCameraZ(phraseCameraZMax);
          }
        } else clearCurrentWord();
      }

      const char = player.video.findChar(position);
      if (char !== currentChar) {
        currentChar = char;
        if (char) setChar(char);
      }
    }
  }
});
