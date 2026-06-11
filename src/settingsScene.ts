import * as THREE from 'three';
import { TextGeometry } from 'three/addons/geometries/TextGeometry.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { activateWordParticles, clearParticles, setFadeRate, COUNT } from './particles';
import { sampleSurface, getFont } from './lyrics';
import { setVolume, getVolume } from './volume';
import { getLanguage, setLanguage } from './language';
import { scene, glassInnerUniforms } from './renderer';
import lyricGlassVert from './shaders/lyric-glass.vert?raw';
import lyricGlassFrag from './shaders/lyric-glass.frag?raw';

const BAR_HALF_W = 1.1;
const BAR_LEFT   = -BAR_HALF_W;
const BAR_RIGHT  =  BAR_HALF_W;
const BAR_BOTTOM = -0.38;
const BAR_TOP    = -0.12;
const BAR_WIDTH  = BAR_RIGHT  - BAR_LEFT;
const BAR_HEIGHT = BAR_TOP    - BAR_BOTTOM;
const LABEL_Y    =  0.35;
const LABEL_SIZE =  0.4;

const LANG_BTN_Y    = -0.78;
const LANG_BTN_SIZE =  0.30;
const LANG_EN_X     = -0.52;
const LANG_JA_X     =  0.52;

const CONTENT_TOP    = LABEL_Y    + LABEL_SIZE    * 0.6;
const CONTENT_BOTTOM = LANG_BTN_Y - LANG_BTN_SIZE * 0.6;
const CONTENT_MID_Y  = (CONTENT_TOP + CONTENT_BOTTOM) / 2;
const CONTENT_HALF_H = (CONTENT_TOP - CONTENT_BOTTOM) / 2;
const LAYOUT_HALF_W  = BAR_HALF_W;

const SCALE         = COUNT / 65536;
const LABEL_COUNT   = Math.round(20_000 * SCALE);
const OUTLINE_COUNT = Math.round( 3_000 * SCALE);
const FILL_COUNT    = Math.round(12_000 * SCALE);
const LANG_EN_COUNT = Math.round( 6_000 * SCALE);
const LANG_JA_COUNT = Math.round( 6_000 * SCALE);

const LANG_EN_BASE = LABEL_COUNT + OUTLINE_COUNT + FILL_COUNT;
const LANG_JA_BASE = LANG_EN_BASE + LANG_EN_COUNT;

const labelIndices   = new Uint32Array(LABEL_COUNT);
const outlineIndices = new Uint32Array(OUTLINE_COUNT);
const fillIndices    = new Uint32Array(FILL_COUNT);
const langEnIndices  = new Uint32Array(LANG_EN_COUNT);
const langJaIndices  = new Uint32Array(LANG_JA_COUNT);
for (let i = 0; i < LABEL_COUNT;   i++) labelIndices[i]   = i;
for (let i = 0; i < OUTLINE_COUNT; i++) outlineIndices[i] = LABEL_COUNT + i;
for (let i = 0; i < FILL_COUNT;    i++) fillIndices[i]    = LABEL_COUNT + OUTLINE_COUNT + i;
for (let i = 0; i < LANG_EN_COUNT; i++) langEnIndices[i]  = LANG_EN_BASE + i;
for (let i = 0; i < LANG_JA_COUNT; i++) langJaIndices[i]  = LANG_JA_BASE + i;

function makeGlassMat(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    vertexShader:   lyricGlassVert,
    fragmentShader: lyricGlassFrag,
    uniforms: {
      uCameraPos:     glassInnerUniforms.uCameraPos,
      uEnvMap:        glassInnerUniforms.uEnvMap,
      uBeatIntensity: glassInnerUniforms.uBeatIntensity,
      uOpacity:       { value: 1.0 },
    },
    transparent: true,
    depthWrite:  false,
    blending:    THREE.AdditiveBlending,
    renderOrder: 2,
  });
}

let labelGeo:  THREE.BufferGeometry | null = null;
let labelMesh: THREE.Mesh           | null = null;
let barMesh:   THREE.Mesh           | null = null;
let fillSamples:  Float32Array | null = null;
let prevFillCount = -1;

let langEnGeo:  THREE.BufferGeometry | null = null;
let langJaGeo:  THREE.BufferGeometry | null = null;
let langEnMesh: THREE.Mesh | null = null;
let langJaMesh: THREE.Mesh | null = null;
let langEnOverlay: HTMLDivElement | null = null;
let langJaOverlay: HTMLDivElement | null = null;

let savedCamPos:  THREE.Vector3    | null = null;
let savedCamQuat: THREE.Quaternion | null = null;
let savedTarget:  THREE.Vector3    | null = null;

let orbitRef:  OrbitControls  | null = null;
let overlayEl: HTMLDivElement | null = null;
let isDragging = false;
let barScreenL = 0;
let barScreenW = 1;

function sampleOutline(): Float32Array {
  const out = new Float32Array(OUTLINE_COUNT * 4);
  for (let i = 0; i < OUTLINE_COUNT; i++) {
    const t    = Math.random();
    const edge = (Math.random() * 4) | 0;
    let x: number, y: number;
    if      (edge === 0) { x = BAR_LEFT  + t * BAR_WIDTH;  y = BAR_BOTTOM; }
    else if (edge === 1) { x = BAR_LEFT  + t * BAR_WIDTH;  y = BAR_TOP;    }
    else if (edge === 2) { x = BAR_LEFT;  y = BAR_BOTTOM + t * BAR_HEIGHT; }
    else                 { x = BAR_RIGHT; y = BAR_BOTTOM + t * BAR_HEIGHT; }
    out[i * 4] = x; out[i * 4 + 1] = y;
  }
  return out;
}

function buildFillSamples(): Float32Array {
  const xs = new Float32Array(FILL_COUNT);
  const ys = new Float32Array(FILL_COUNT);
  for (let i = 0; i < FILL_COUNT; i++) {
    xs[i] = BAR_LEFT   + Math.random() * BAR_WIDTH;
    ys[i] = BAR_BOTTOM + Math.random() * BAR_HEIGHT;
  }
  const order = Array.from({ length: FILL_COUNT }, (_, i) => i);
  order.sort((a, b) => xs[a] - xs[b]);
  const out = new Float32Array(FILL_COUNT * 4);
  for (let i = 0; i < FILL_COUNT; i++) {
    const j = order[i];
    out[i * 4]     = xs[j];
    out[i * 4 + 1] = ys[j];
  }
  return out;
}

function updateBar(v: number) {
  if (!fillSamples) return;
  const fillCount = Math.round(v * FILL_COUNT);
  if (fillCount > prevFillCount) {
    const lo = Math.max(0, prevFillCount);
    activateWordParticles(
      fillIndices.subarray(lo, fillCount),
      fillSamples.subarray(lo * 4, fillCount * 4),
    );
  } else if (fillCount < prevFillCount) {
    clearParticles(fillIndices.subarray(fillCount, prevFillCount));
  }
  prevFillCount = fillCount;
}

function updateLangParticles() {
  const lang = getLanguage();
  if (lang === 'en') {
    if (langEnGeo) activateWordParticles(langEnIndices, sampleSurface(langEnGeo, LANG_EN_COUNT));
    clearParticles(langJaIndices);
    if (langEnMesh) (langEnMesh.material as THREE.ShaderMaterial).uniforms.uOpacity.value = 1.0;
    if (langJaMesh) (langJaMesh.material as THREE.ShaderMaterial).uniforms.uOpacity.value = 0.3;
  } else {
    if (langJaGeo) activateWordParticles(langJaIndices, sampleSurface(langJaGeo, LANG_JA_COUNT));
    clearParticles(langEnIndices);
    if (langEnMesh) (langEnMesh.material as THREE.ShaderMaterial).uniforms.uOpacity.value = 0.3;
    if (langJaMesh) (langJaMesh.material as THREE.ShaderMaterial).uniforms.uOpacity.value = 1.0;
  }
}

function worldToScreen(wx: number, wy: number, camera: THREE.Camera, el: HTMLCanvasElement) {
  const v = new THREE.Vector3(wx, wy, 0).project(camera);
  return { x: (v.x + 1) / 2 * el.clientWidth, y: (-v.y + 1) / 2 * el.clientHeight };
}

function setupOverlay(camera: THREE.Camera, canvasEl: HTMLCanvasElement) {
  const tl  = worldToScreen(BAR_LEFT,  BAR_TOP,    camera, canvasEl);
  const br  = worldToScreen(BAR_RIGHT, BAR_BOTTOM, camera, canvasEl);
  const pad = 28;

  overlayEl = document.createElement('div');
  Object.assign(overlayEl.style, {
    position:    'fixed',
    left:        `${tl.x - pad}px`,
    top:         `${tl.y - pad}px`,
    width:       `${br.x - tl.x + pad * 2}px`,
    height:      `${br.y - tl.y + pad * 2}px`,
    cursor:      'ew-resize',
    zIndex:      '20',
    touchAction: 'none',
  });
  document.body.appendChild(overlayEl);

  barScreenL = tl.x;
  barScreenW = br.x - tl.x;

  overlayEl.addEventListener('pointerdown', onDown);
  window.addEventListener('pointermove',   onMove);
  window.addEventListener('pointerup',     onUp);
}

function setupLangOverlays(camera: THREE.Camera, canvasEl: HTMLCanvasElement) {
  const enPos = worldToScreen(LANG_EN_X, LANG_BTN_Y, camera, canvasEl);
  const jaPos = worldToScreen(LANG_JA_X, LANG_BTN_Y, camera, canvasEl);
  const W = 100, H = 60;

  langEnOverlay = document.createElement('div');
  Object.assign(langEnOverlay.style, {
    position: 'fixed', cursor: 'pointer', zIndex: '20', touchAction: 'none',
    left: `${enPos.x - W / 2}px`, top: `${enPos.y - H / 2}px`,
    width: `${W}px`, height: `${H}px`,
  });
  document.body.appendChild(langEnOverlay);
  langEnOverlay.addEventListener('pointerdown', () => { setLanguage('en'); updateLangParticles(); });

  langJaOverlay = document.createElement('div');
  Object.assign(langJaOverlay.style, {
    position: 'fixed', cursor: 'pointer', zIndex: '20', touchAction: 'none',
    left: `${jaPos.x - W / 2}px`, top: `${jaPos.y - H / 2}px`,
    width: `${W}px`, height: `${H}px`,
  });
  document.body.appendChild(langJaOverlay);
  langJaOverlay.addEventListener('pointerdown', () => { setLanguage('ja'); updateLangParticles(); });
}

function fromPointerX(clientX: number): number {
  return Math.max(0, Math.min(1, (clientX - barScreenL) / barScreenW));
}

function onDown(e: PointerEvent) { isDragging = true;  applyVolume(fromPointerX(e.clientX)); }
function onMove(e: PointerEvent) { if (isDragging) applyVolume(fromPointerX(e.clientX)); }
function onUp()                  { isDragging = false; }

function applyVolume(v: number) {
  setVolume(v);
  updateBar(v);
}

export function enterSettings(
  camera: THREE.PerspectiveCamera,
  canvasEl: HTMLCanvasElement,
  orbitControls: OrbitControls,
): void {
  const font = getFont();
  if (!font) return;

  orbitRef = orbitControls;
  orbitControls.enabled = false;
  setFadeRate(0);

  savedCamPos  = camera.position.clone();
  savedCamQuat = camera.quaternion.clone();
  savedTarget  = orbitControls.target.clone();

  const fovHalf = (camera.fov / 2) * (Math.PI / 180);
  const aspect  = canvasEl.clientWidth / canvasEl.clientHeight;
  const zForH   = CONTENT_HALF_H / Math.tan(fovHalf) * 1.7;
  const zForW   = LAYOUT_HALF_W  / (Math.tan(fovHalf) * aspect) * 1.7;
  const z = Math.max(zForH, zForW, 3);
  camera.position.set(0, CONTENT_MID_Y, z);
  camera.quaternion.identity();
  orbitControls.target.set(0, CONTENT_MID_Y, 0);
  orbitControls.update();

  // Volume label
  labelGeo = new TextGeometry(getLanguage() === 'ja' ? '音量' : 'VOLUME', {
    font, size: LABEL_SIZE, depth: 0.18, curveSegments: 4,
  });
  labelGeo.computeBoundingBox();
  const bb = labelGeo.boundingBox!;
  labelGeo.translate(
    -(bb.min.x + bb.max.x) / 2,
    -(bb.min.y + bb.max.y) / 2 + LABEL_Y,
    0,
  );
  activateWordParticles(labelIndices, sampleSurface(labelGeo, LABEL_COUNT));
  labelMesh = new THREE.Mesh(labelGeo, makeGlassMat());
  scene.add(labelMesh);

  // Volume bar
  const barGeo = new THREE.BoxGeometry(BAR_WIDTH, BAR_HEIGHT, 0.06);
  barGeo.translate((BAR_LEFT + BAR_RIGHT) / 2, (BAR_BOTTOM + BAR_TOP) / 2, 0);
  barMesh = new THREE.Mesh(barGeo, makeGlassMat());
  barMesh.renderOrder = 1;
  scene.add(barMesh);

  activateWordParticles(outlineIndices, sampleOutline());

  prevFillCount = 0;
  fillSamples   = buildFillSamples();
  updateBar(getVolume());

  // Language toggle — EN
  langEnGeo = new TextGeometry('EN', { font, size: LANG_BTN_SIZE, depth: 0.10, curveSegments: 4 });
  langEnGeo.computeBoundingBox();
  const enBb = langEnGeo.boundingBox!;
  langEnGeo.translate(
    -(enBb.min.x + enBb.max.x) / 2 + LANG_EN_X,
    -(enBb.min.y + enBb.max.y) / 2 + LANG_BTN_Y,
    -(enBb.min.z + enBb.max.z) / 2,
  );
  langEnMesh = new THREE.Mesh(langEnGeo, makeGlassMat());
  scene.add(langEnMesh);

  // Language toggle — JA
  langJaGeo = new TextGeometry('JA', { font, size: LANG_BTN_SIZE, depth: 0.10, curveSegments: 4 });
  langJaGeo.computeBoundingBox();
  const jaBb = langJaGeo.boundingBox!;
  langJaGeo.translate(
    -(jaBb.min.x + jaBb.max.x) / 2 + LANG_JA_X,
    -(jaBb.min.y + jaBb.max.y) / 2 + LANG_BTN_Y,
    -(jaBb.min.z + jaBb.max.z) / 2,
  );
  langJaMesh = new THREE.Mesh(langJaGeo, makeGlassMat());
  scene.add(langJaMesh);

  updateLangParticles();

  setupOverlay(camera, canvasEl);
  setupLangOverlays(camera, canvasEl);
}

export function leaveSettings(
  camera: THREE.PerspectiveCamera,
  orbitControls: OrbitControls,
): void {
  if (overlayEl) {
    overlayEl.removeEventListener('pointerdown', onDown);
    window.removeEventListener('pointermove',   onMove);
    window.removeEventListener('pointerup',     onUp);
    overlayEl.remove();
    overlayEl = null;
  }

  if (langEnOverlay) { langEnOverlay.remove(); langEnOverlay = null; }
  if (langJaOverlay) { langJaOverlay.remove(); langJaOverlay = null; }

  isDragging    = false;
  fillSamples   = null;
  prevFillCount = -1;

  if (labelMesh) { scene.remove(labelMesh); (labelMesh.material as THREE.ShaderMaterial).dispose(); labelMesh = null; }
  if (labelGeo)  { labelGeo.dispose(); labelGeo = null; }
  if (barMesh)   { scene.remove(barMesh); (barMesh.material as THREE.ShaderMaterial).dispose(); barMesh = null; }

  if (langEnMesh) { scene.remove(langEnMesh); (langEnMesh.material as THREE.ShaderMaterial).dispose(); langEnMesh = null; }
  if (langEnGeo)  { langEnGeo.dispose(); langEnGeo = null; }
  if (langJaMesh) { scene.remove(langJaMesh); (langJaMesh.material as THREE.ShaderMaterial).dispose(); langJaMesh = null; }
  if (langJaGeo)  { langJaGeo.dispose(); langJaGeo = null; }

  clearParticles(langEnIndices);
  clearParticles(langJaIndices);

  if (savedCamPos && savedCamQuat && savedTarget) {
    camera.position.copy(savedCamPos);
    camera.quaternion.copy(savedCamQuat);
    orbitControls.target.copy(savedTarget);
    orbitControls.update();
    savedCamPos = savedCamQuat = savedTarget = null;
  }

  setFadeRate(0.25);
  if (orbitRef) { orbitRef.enabled = true; orbitRef = null; }
}
