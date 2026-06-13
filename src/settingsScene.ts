import * as THREE from 'three';
import { TextGeometry } from 'three/addons/geometries/TextGeometry.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { activateWordParticles, clearParticles, setFadeRate, COUNT } from './particles';
import { sampleSurface, getFont } from './lyrics';
import { setVolume, getVolume } from './volume';
import { getLanguage, setLanguage } from './language';
import { getDetailMode, setDetailMode, getSphereSpin, setSphereSpin } from './settings';
import { scene, glassInnerUniforms, applyDetailMode, flushCubemapNow } from './renderer';
import lyricGlassVert from './shaders/lyric-glass.vert?raw';
import lyricGlassFrag from './shaders/lyric-glass.frag?raw';

const FONT_SCALE = window.innerWidth < window.innerHeight ? 1.5 : 1.0;

const BAR_HALF_W = 1.32 * FONT_SCALE;
const BAR_LEFT   = -BAR_HALF_W;
const BAR_RIGHT  =  BAR_HALF_W;
const BAR_BOTTOM = -0.46 * FONT_SCALE;
const BAR_TOP    = -0.14 * FONT_SCALE;
const BAR_WIDTH  = BAR_RIGHT  - BAR_LEFT;
const BAR_HEIGHT = BAR_TOP    - BAR_BOTTOM;
const LABEL_Y    =  0.50 * FONT_SCALE;
const LABEL_SIZE =  0.95 * FONT_SCALE;

const LANG_SECTION_Y    = -1.30 * FONT_SCALE;
const LANG_SECTION_SIZE =  0.95 * FONT_SCALE;
const LANG_CHIP_Y       = -2.20 * FONT_SCALE;
const LANG_CHIP_SIZE    =  0.65 * FONT_SCALE;

const DETAIL_SECTION_Y    = -3.20 * FONT_SCALE;
const DETAIL_SECTION_SIZE =  0.95 * FONT_SCALE;
const DETAIL_CHIP_Y       = -4.10 * FONT_SCALE;
const DETAIL_CHIP_SIZE    =  0.65 * FONT_SCALE;

const SPIN_SECTION_Y    = -5.10 * FONT_SCALE;
const SPIN_SECTION_SIZE =  0.95 * FONT_SCALE;
const SPIN_CHIP_Y       = -6.00 * FONT_SCALE;
const SPIN_CHIP_SIZE    =  0.65 * FONT_SCALE;

const CONTENT_TOP    = LABEL_Y       + LABEL_SIZE       * 0.6;
const CONTENT_BOTTOM = SPIN_CHIP_Y   - SPIN_CHIP_SIZE   * 0.6;
const CONTENT_MID_Y  = (CONTENT_TOP + CONTENT_BOTTOM) / 2;
const CONTENT_HALF_H = (CONTENT_TOP - CONTENT_BOTTOM) / 2;
const LAYOUT_HALF_W  = 2.5 * FONT_SCALE;

const SCALE         = COUNT / 65536;
const LABEL_COUNT   = Math.round(10_000 * SCALE);
const OUTLINE_COUNT = Math.round( 2_500 * SCALE);
const FILL_COUNT    = Math.round( 6_500 * SCALE);
const LANG_HEAD_COUNT = Math.round(10_000 * SCALE);
const LANG_CHIP_COUNT = Math.round( 8_000 * SCALE);

const DETAIL_HEAD_COUNT = Math.round( 8_000 * SCALE);
const DETAIL_CHIP_COUNT = Math.round( 6_000 * SCALE);
const SPIN_HEAD_COUNT   = Math.round( 8_000 * SCALE);
const SPIN_CHIP_COUNT   = Math.round( 6_000 * SCALE);

const LANG_HEAD_BASE   = LABEL_COUNT + OUTLINE_COUNT + FILL_COUNT;
const LANG_CHIP_BASE   = LANG_HEAD_BASE + LANG_HEAD_COUNT;
const DETAIL_HEAD_BASE = LANG_CHIP_BASE + LANG_CHIP_COUNT;
const DETAIL_CHIP_BASE = DETAIL_HEAD_BASE + DETAIL_HEAD_COUNT;
const SPIN_HEAD_BASE   = DETAIL_CHIP_BASE + DETAIL_CHIP_COUNT;
const SPIN_CHIP_BASE   = SPIN_HEAD_BASE   + SPIN_HEAD_COUNT;

const labelIndices      = new Uint32Array(LABEL_COUNT);
const outlineIndices    = new Uint32Array(OUTLINE_COUNT);
const fillIndices       = new Uint32Array(FILL_COUNT);
const langHeadIndices   = new Uint32Array(LANG_HEAD_COUNT);
const langChipIndices   = new Uint32Array(LANG_CHIP_COUNT);
const detailHeadIndices = new Uint32Array(DETAIL_HEAD_COUNT);
const detailChipIndices = new Uint32Array(DETAIL_CHIP_COUNT);
const spinHeadIndices   = new Uint32Array(SPIN_HEAD_COUNT);
const spinChipIndices   = new Uint32Array(SPIN_CHIP_COUNT);
for (let i = 0; i < LABEL_COUNT;       i++) labelIndices[i]      = i;
for (let i = 0; i < OUTLINE_COUNT;     i++) outlineIndices[i]    = LABEL_COUNT + i;
for (let i = 0; i < FILL_COUNT;        i++) fillIndices[i]       = LABEL_COUNT + OUTLINE_COUNT + i;
for (let i = 0; i < LANG_HEAD_COUNT;   i++) langHeadIndices[i]   = LANG_HEAD_BASE + i;
for (let i = 0; i < LANG_CHIP_COUNT;   i++) langChipIndices[i]   = LANG_CHIP_BASE + i;
for (let i = 0; i < DETAIL_HEAD_COUNT; i++) detailHeadIndices[i] = DETAIL_HEAD_BASE + i;
for (let i = 0; i < DETAIL_CHIP_COUNT; i++) detailChipIndices[i] = DETAIL_CHIP_BASE + i;
for (let i = 0; i < SPIN_HEAD_COUNT;   i++) spinHeadIndices[i]   = SPIN_HEAD_BASE + i;
for (let i = 0; i < SPIN_CHIP_COUNT;   i++) spinChipIndices[i]   = SPIN_CHIP_BASE + i;

function makeGlassMat(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    vertexShader:   lyricGlassVert,
    fragmentShader: lyricGlassFrag,
    uniforms: {
      uCameraPos:     glassInnerUniforms.uCameraPos,
      uEnvMap:        glassInnerUniforms.uEnvMap,
      uBeatIntensity: glassInnerUniforms.uBeatIntensity,
      uOpacity:       { value: 1.0 },
      uFill:          { value: 1.0 },
    },
    transparent: true,
    depthWrite:  false,
    blending:    THREE.AdditiveBlending,
    renderOrder: 2,
  });
}

let labelGeo:  THREE.BufferGeometry | null = null;
let labelMesh: THREE.Mesh           | null = null;
let fillSamples:  Float32Array | null = null;
let prevFillCount = -1;

let langSectionGeo:  THREE.BufferGeometry | null = null;
let langSectionMesh: THREE.Mesh | null = null;
let langChipGeo:     THREE.BufferGeometry | null = null;
let langChipMesh:    THREE.Mesh | null = null;
let langChipOverlay: HTMLDivElement | null = null;

let detailSectionGeo:  THREE.BufferGeometry | null = null;
let detailSectionMesh: THREE.Mesh | null = null;
let detailChipGeo:     THREE.BufferGeometry | null = null;
let detailChipMesh:    THREE.Mesh | null = null;
let detailChipOverlay: HTMLDivElement | null = null;

let spinSectionGeo:  THREE.BufferGeometry | null = null;
let spinSectionMesh: THREE.Mesh | null = null;
let spinChipGeo:     THREE.BufferGeometry | null = null;
let spinChipMesh:    THREE.Mesh | null = null;
let spinChipOverlay: HTMLDivElement | null = null;

let langChipW = 400, langChipH = 120;
let detailChipW = 300, detailChipH = 120;
let spinChipW = 300, spinChipH = 120;

let orbitRef:  OrbitControls  | null = null;
let overlayEl: HTMLDivElement | null = null;
let isDragging = false;
let barScreenL = 0;
let barScreenW = 1;

// ---- Vertical scroll state ----
let scrollTargetY     = 0;
let scrollCurrentY    = 0;
let scrollMin         = 0;
let scrollMax         = 0;
let scrollWorldPerPx  = 0;
let scrollRaf         = 0;
let scrollDragActive  = false;
let scrollDragStartPx = 0;
let scrollDragStartTarget = 0;
let scrollCam:    THREE.PerspectiveCamera | null = null;
let scrollCanvas: HTMLCanvasElement       | null = null;

function clampScroll(y: number): number {
  return Math.max(scrollMin, Math.min(scrollMax, y));
}

function updateOverlayPositions(cam: THREE.PerspectiveCamera, cvs: HTMLCanvasElement) {
  if (overlayEl) {
    const tl  = worldToScreen(BAR_LEFT,  BAR_TOP,    cam, cvs);
    const br  = worldToScreen(BAR_RIGHT, BAR_BOTTOM, cam, cvs);
    const pad = 28;
    Object.assign(overlayEl.style, {
      left:   `${tl.x - pad}px`,
      top:    `${tl.y - pad}px`,
      width:  `${br.x - tl.x + pad * 2}px`,
      height: `${br.y - tl.y + pad * 2}px`,
    });
    barScreenL = tl.x;
    barScreenW = br.x - tl.x;
  }
  const moveChip = (el: HTMLDivElement | null, wy: number, W: number, H: number) => {
    if (!el) return;
    const p = worldToScreen(0, wy, cam, cvs);
    el.style.left   = `${p.x - W / 2}px`;
    el.style.top    = `${p.y - H / 2}px`;
    el.style.width  = `${W}px`;
    el.style.height = `${H}px`;
  };
  moveChip(langChipOverlay,   LANG_CHIP_Y,   langChipW,   langChipH);
  moveChip(detailChipOverlay, DETAIL_CHIP_Y, detailChipW, detailChipH);
  moveChip(spinChipOverlay,   SPIN_CHIP_Y,   spinChipW,   spinChipH);
}

function computeChipOverlaySize(
  geo: THREE.BufferGeometry | null,
  chipY: number,
  camera: THREE.Camera,
  canvasEl: HTMLCanvasElement,
): { W: number; H: number } {
  if (!geo?.boundingBox) return { W: 400, H: 120 };
  const leftPt  = worldToScreen(geo.boundingBox.min.x, chipY, camera, canvasEl);
  const rightPt = worldToScreen(geo.boundingBox.max.x, chipY, camera, canvasEl);
  const topPt   = worldToScreen(0, geo.boundingBox.max.y, camera, canvasEl);
  const botPt   = worldToScreen(0, geo.boundingBox.min.y, camera, canvasEl);
  return {
    W: Math.ceil(rightPt.x - leftPt.x) + 120,
    H: Math.ceil(botPt.y   - topPt.y)  + 80,
  };
}

function scrollRafTick() {
  if (!scrollCam || !orbitRef || !scrollCanvas) return;
  scrollCurrentY += (scrollTargetY - scrollCurrentY) * 0.12;
  scrollCam.position.y = scrollCurrentY;
  orbitRef.target.y    = scrollCurrentY;
  orbitRef.update();
  scrollCam.updateMatrixWorld(true);
  updateOverlayPositions(scrollCam, scrollCanvas);
  scrollRaf = requestAnimationFrame(scrollRafTick);
}

function onScrollWheel(e: WheelEvent) {
  e.preventDefault();
  scrollTargetY = clampScroll(scrollTargetY - e.deltaY * scrollWorldPerPx * 0.3);
}

function onScrollPointerDown(e: PointerEvent) {
  if (overlayEl?.contains(e.target as Node))         return;
  if (langChipOverlay?.contains(e.target as Node))   return;
  if (detailChipOverlay?.contains(e.target as Node)) return;
  if (spinChipOverlay?.contains(e.target as Node))   return;
  scrollDragActive      = true;
  scrollDragStartPx     = e.clientY;
  scrollDragStartTarget = scrollTargetY;
}

function onScrollPointerMove(e: PointerEvent) {
  if (!scrollDragActive) return;
  const dy = e.clientY - scrollDragStartPx;
  scrollTargetY = clampScroll(scrollDragStartTarget + dy * scrollWorldPerPx);
}

function onScrollPointerUp() {
  scrollDragActive = false;
}

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

function setupChipOverlay(
  camera: THREE.Camera,
  canvasEl: HTMLCanvasElement,
  W: number, H: number,
  onToggle: () => void,
) {
  const pos = worldToScreen(0, LANG_CHIP_Y, camera, canvasEl);

  langChipOverlay = document.createElement('div');
  Object.assign(langChipOverlay.style, {
    position:    'fixed',
    cursor:      'pointer',
    zIndex:      '10001',
    touchAction: 'none',
    left:        `${pos.x - W / 2}px`,
    top:         `${pos.y - H / 2}px`,
    width:       `${W}px`,
    height:      `${H}px`,
  });
  document.body.appendChild(langChipOverlay);
  langChipOverlay.addEventListener('pointerdown', (e) => { e.stopPropagation(); onToggle(); });
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

function rebuildLabelMesh(font: NonNullable<ReturnType<typeof getFont>>) {
  if (labelMesh) { scene.remove(labelMesh); (labelMesh.material as THREE.ShaderMaterial).dispose(); labelMesh = null; }
  if (labelGeo)  { labelGeo.dispose(); labelGeo = null; }

  const text = getLanguage() === 'ja' ? '音量' : 'VOLUME';
  labelGeo = new TextGeometry(text, {
    font, size: LABEL_SIZE, depth: 0.35, curveSegments: 4,
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
}

function rebuildLangSectionMesh(font: NonNullable<ReturnType<typeof getFont>>) {
  if (langSectionMesh) { scene.remove(langSectionMesh); (langSectionMesh.material as THREE.ShaderMaterial).dispose(); langSectionMesh = null; }
  if (langSectionGeo)  { langSectionGeo.dispose(); langSectionGeo = null; }

  const text = getLanguage() === 'ja' ? '言語' : 'LANGUAGES';
  langSectionGeo = new TextGeometry(text, { font, size: LANG_SECTION_SIZE, depth: 0.30, curveSegments: 4 });
  langSectionGeo.computeBoundingBox();
  const bb = langSectionGeo.boundingBox!;
  langSectionGeo.translate(
    -(bb.min.x + bb.max.x) / 2,
    -(bb.min.y + bb.max.y) / 2 + LANG_SECTION_Y,
    0,
  );
  activateWordParticles(langHeadIndices, sampleSurface(langSectionGeo, LANG_HEAD_COUNT));
  langSectionMesh = new THREE.Mesh(langSectionGeo, makeGlassMat());
  scene.add(langSectionMesh);
}

function rebuildChipMesh(font: NonNullable<ReturnType<typeof getFont>>) {
  if (langChipMesh) { scene.remove(langChipMesh); (langChipMesh.material as THREE.ShaderMaterial).dispose(); langChipMesh = null; }
  if (langChipGeo)  { langChipGeo.dispose(); langChipGeo = null; }

  const text = getLanguage() === 'ja' ? '日本語 JP' : 'EN 英語';
  langChipGeo = new TextGeometry(text, { font, size: LANG_CHIP_SIZE, depth: 0.15, curveSegments: 4 });
  langChipGeo.computeBoundingBox();
  const bb = langChipGeo.boundingBox!;
  langChipGeo.translate(
    -(bb.min.x + bb.max.x) / 2,
    -(bb.min.y + bb.max.y) / 2 + LANG_CHIP_Y,
    -(bb.min.z + bb.max.z) / 2,
  );
  activateWordParticles(langChipIndices, sampleSurface(langChipGeo, LANG_CHIP_COUNT));
  langChipMesh = new THREE.Mesh(langChipGeo, makeGlassMat());
  scene.add(langChipMesh);
}

function rebuildDetailSectionMesh(font: NonNullable<ReturnType<typeof getFont>>) {
  if (detailSectionMesh) { scene.remove(detailSectionMesh); (detailSectionMesh.material as THREE.ShaderMaterial).dispose(); detailSectionMesh = null; }
  if (detailSectionGeo)  { detailSectionGeo.dispose(); detailSectionGeo = null; }

  const text = getLanguage() === 'ja' ? '品質' : 'DETAIL';
  detailSectionGeo = new TextGeometry(text, { font, size: DETAIL_SECTION_SIZE, depth: 0.30, curveSegments: 4 });
  detailSectionGeo.computeBoundingBox();
  const bb = detailSectionGeo.boundingBox!;
  detailSectionGeo.translate(
    -(bb.min.x + bb.max.x) / 2,
    -(bb.min.y + bb.max.y) / 2 + DETAIL_SECTION_Y,
    0,
  );
  activateWordParticles(detailHeadIndices, sampleSurface(detailSectionGeo, DETAIL_HEAD_COUNT));
  detailSectionMesh = new THREE.Mesh(detailSectionGeo, makeGlassMat());
  scene.add(detailSectionMesh);
}

function rebuildDetailChipMesh(font: NonNullable<ReturnType<typeof getFont>>) {
  if (detailChipMesh) { scene.remove(detailChipMesh); (detailChipMesh.material as THREE.ShaderMaterial).dispose(); detailChipMesh = null; }
  if (detailChipGeo)  { detailChipGeo.dispose(); detailChipGeo = null; }

  const text = getLanguage() === 'ja'
    ? (getDetailMode() === 'high' ? '高' : '低')
    : (getDetailMode() === 'high' ? 'HIGH' : 'LOW');
  detailChipGeo = new TextGeometry(text, { font, size: DETAIL_CHIP_SIZE, depth: 0.15, curveSegments: 4 });
  detailChipGeo.computeBoundingBox();
  const bb = detailChipGeo.boundingBox!;
  detailChipGeo.translate(
    -(bb.min.x + bb.max.x) / 2,
    -(bb.min.y + bb.max.y) / 2 + DETAIL_CHIP_Y,
    -(bb.min.z + bb.max.z) / 2,
  );
  activateWordParticles(detailChipIndices, sampleSurface(detailChipGeo, DETAIL_CHIP_COUNT));
  detailChipMesh = new THREE.Mesh(detailChipGeo, makeGlassMat());
  scene.add(detailChipMesh);
}

function rebuildSpinSectionMesh(font: NonNullable<ReturnType<typeof getFont>>) {
  if (spinSectionMesh) { scene.remove(spinSectionMesh); (spinSectionMesh.material as THREE.ShaderMaterial).dispose(); spinSectionMesh = null; }
  if (spinSectionGeo)  { spinSectionGeo.dispose(); spinSectionGeo = null; }

  const text = getLanguage() === 'ja' ? '回転' : 'ROTATION';
  spinSectionGeo = new TextGeometry(text, { font, size: SPIN_SECTION_SIZE, depth: 0.30, curveSegments: 4 });
  spinSectionGeo.computeBoundingBox();
  const bb = spinSectionGeo.boundingBox!;
  spinSectionGeo.translate(
    -(bb.min.x + bb.max.x) / 2,
    -(bb.min.y + bb.max.y) / 2 + SPIN_SECTION_Y,
    0,
  );
  activateWordParticles(spinHeadIndices, sampleSurface(spinSectionGeo, SPIN_HEAD_COUNT));
  spinSectionMesh = new THREE.Mesh(spinSectionGeo, makeGlassMat());
  scene.add(spinSectionMesh);
}

function rebuildSpinChipMesh(font: NonNullable<ReturnType<typeof getFont>>) {
  if (spinChipMesh) { scene.remove(spinChipMesh); (spinChipMesh.material as THREE.ShaderMaterial).dispose(); spinChipMesh = null; }
  if (spinChipGeo)  { spinChipGeo.dispose(); spinChipGeo = null; }

  const text = getLanguage() === 'ja'
    ? (getSphereSpin() === 'on' ? 'オン' : 'オフ')
    : (getSphereSpin() === 'on' ? 'ON' : 'OFF');
  spinChipGeo = new TextGeometry(text, { font, size: SPIN_CHIP_SIZE, depth: 0.15, curveSegments: 4 });
  spinChipGeo.computeBoundingBox();
  const bb = spinChipGeo.boundingBox!;
  spinChipGeo.translate(
    -(bb.min.x + bb.max.x) / 2,
    -(bb.min.y + bb.max.y) / 2 + SPIN_CHIP_Y,
    -(bb.min.z + bb.max.z) / 2,
  );
  activateWordParticles(spinChipIndices, sampleSurface(spinChipGeo, SPIN_CHIP_COUNT));
  spinChipMesh = new THREE.Mesh(spinChipGeo, makeGlassMat());
  scene.add(spinChipMesh);
}

function setupDetailChipOverlay(
  camera: THREE.Camera,
  canvasEl: HTMLCanvasElement,
  W: number, H: number,
  onToggle: () => void,
) {
  const pos = worldToScreen(0, DETAIL_CHIP_Y, camera, canvasEl);

  detailChipOverlay = document.createElement('div');
  Object.assign(detailChipOverlay.style, {
    position:    'fixed',
    cursor:      'pointer',
    zIndex:      '10001',
    touchAction: 'none',
    left:        `${pos.x - W / 2}px`,
    top:         `${pos.y - H / 2}px`,
    width:       `${W}px`,
    height:      `${H}px`,
  });
  document.body.appendChild(detailChipOverlay);
  detailChipOverlay.addEventListener('pointerdown', (e) => { e.stopPropagation(); onToggle(); });
}

function setupSpinChipOverlay(
  camera: THREE.Camera,
  canvasEl: HTMLCanvasElement,
  W: number, H: number,
  onToggle: () => void,
) {
  const pos = worldToScreen(0, SPIN_CHIP_Y, camera, canvasEl);

  spinChipOverlay = document.createElement('div');
  Object.assign(spinChipOverlay.style, {
    position:    'fixed',
    cursor:      'pointer',
    zIndex:      '10001',
    touchAction: 'none',
    left:        `${pos.x - W / 2}px`,
    top:         `${pos.y - H / 2}px`,
    width:       `${W}px`,
    height:      `${H}px`,
  });
  document.body.appendChild(spinChipOverlay);
  spinChipOverlay.addEventListener('pointerdown', (e) => { e.stopPropagation(); onToggle(); });
}

export function enterSettings(
  camera: THREE.PerspectiveCamera,
  canvasEl: HTMLCanvasElement,
  orbitControls: OrbitControls,
): void {
  const font = getFont();
  if (!font) return;
  if (orbitRef !== null) return;  // already in settings — prevent double-entry

  orbitRef = orbitControls;
  orbitControls.saveState();  // snapshot camera/target for clean reset on exit
  orbitControls.enabled = false;
  setFadeRate(0);

  const fovHalf = (camera.fov / 2) * (Math.PI / 180);
  const aspect  = canvasEl.clientWidth / canvasEl.clientHeight;
  const zForH   = CONTENT_HALF_H / Math.tan(fovHalf) * 0.85;
  const zForW   = LAYOUT_HALF_W  / (Math.tan(fovHalf) * aspect) * 0.85;
  const z = Math.max(zForH, zForW, 1.5);

  // Compute scroll bounds: if content overflows the viewport, allow panning.
  const viewHalfH = Math.tan(fovHalf) * z;
  if (viewHalfH >= CONTENT_HALF_H) {
    scrollMin = scrollMax = CONTENT_MID_Y;
  } else {
    scrollMax = CONTENT_TOP    - viewHalfH;
    scrollMin = CONTENT_BOTTOM + viewHalfH;
  }
  scrollTargetY  = scrollMax;
  scrollCurrentY = scrollMax;
  // world units per screen pixel (for drag/wheel conversion)
  scrollWorldPerPx = (viewHalfH * 2) / canvasEl.clientHeight;

  camera.position.set(0, scrollCurrentY, z);
  camera.quaternion.identity();
  orbitControls.target.set(0, scrollCurrentY, 0);
  orbitControls.update();
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld(true);

  scrollCam    = camera;
  scrollCanvas = canvasEl;
  canvasEl.addEventListener('wheel', onScrollWheel, { passive: false });
  window.addEventListener('pointerdown', onScrollPointerDown);
  window.addEventListener('pointermove', onScrollPointerMove);
  window.addEventListener('pointerup',   onScrollPointerUp);
  scrollRaf = requestAnimationFrame(scrollRafTick);

  rebuildLabelMesh(font);

  activateWordParticles(outlineIndices, sampleOutline());

  prevFillCount = 0;
  fillSamples   = buildFillSamples();
  updateBar(getVolume());

  rebuildLangSectionMesh(font);
  rebuildChipMesh(font);
  rebuildDetailSectionMesh(font);
  rebuildDetailChipMesh(font);
  rebuildSpinSectionMesh(font);
  rebuildSpinChipMesh(font);

  ({ W: langChipW,   H: langChipH   } = computeChipOverlaySize(langChipGeo,   LANG_CHIP_Y,   camera, canvasEl));
  ({ W: detailChipW, H: detailChipH } = computeChipOverlaySize(detailChipGeo, DETAIL_CHIP_Y, camera, canvasEl));
  ({ W: spinChipW,   H: spinChipH   } = computeChipOverlaySize(spinChipGeo,   SPIN_CHIP_Y,   camera, canvasEl));

  setupOverlay(camera, canvasEl);
  setupChipOverlay(camera, canvasEl, langChipW, langChipH, () => {
    const f = getFont();
    if (!f) return;
    setLanguage(getLanguage() === 'en' ? 'ja' : 'en');
    rebuildLabelMesh(f);
    rebuildLangSectionMesh(f);
    rebuildChipMesh(f);
    rebuildDetailSectionMesh(f);
    rebuildDetailChipMesh(f);
    rebuildSpinSectionMesh(f);
    rebuildSpinChipMesh(f);
    if (scrollCam && scrollCanvas) {
      ({ W: langChipW,   H: langChipH   } = computeChipOverlaySize(langChipGeo,   LANG_CHIP_Y,   scrollCam, scrollCanvas));
      ({ W: detailChipW, H: detailChipH } = computeChipOverlaySize(detailChipGeo, DETAIL_CHIP_Y, scrollCam, scrollCanvas));
      ({ W: spinChipW,   H: spinChipH   } = computeChipOverlaySize(spinChipGeo,   SPIN_CHIP_Y,   scrollCam, scrollCanvas));
    }
  });
  setupDetailChipOverlay(camera, canvasEl, detailChipW, detailChipH, () => {
    const f = getFont();
    if (!f) return;
    const next = getDetailMode() === 'high' ? 'low' : 'high';
    setDetailMode(next);
    applyDetailMode(next);
    rebuildDetailChipMesh(f);
    if (scrollCam && scrollCanvas) {
      ({ W: detailChipW, H: detailChipH } = computeChipOverlaySize(detailChipGeo, DETAIL_CHIP_Y, scrollCam, scrollCanvas));
    }
  });
  setupSpinChipOverlay(camera, canvasEl, spinChipW, spinChipH, () => {
    const f = getFont();
    if (!f) return;
    const next = getSphereSpin() === 'on' ? 'off' : 'on';
    setSphereSpin(next);
    rebuildSpinChipMesh(f);
    if (scrollCam && scrollCanvas) {
      ({ W: spinChipW, H: spinChipH } = computeChipOverlaySize(spinChipGeo, SPIN_CHIP_Y, scrollCam, scrollCanvas));
    }
  });
}

export function leaveSettings(
  _camera: THREE.PerspectiveCamera,
  orbitControls: OrbitControls,
): void {
  cancelAnimationFrame(scrollRaf);
  scrollRaf = 0;
  if (scrollCanvas) {
    scrollCanvas.removeEventListener('wheel', onScrollWheel);
  }
  window.removeEventListener('pointerdown', onScrollPointerDown);
  window.removeEventListener('pointermove', onScrollPointerMove);
  window.removeEventListener('pointerup',   onScrollPointerUp);
  scrollDragActive = false;
  scrollCam = scrollCanvas = null;

  if (overlayEl) {
    overlayEl.removeEventListener('pointerdown', onDown);
    window.removeEventListener('pointermove',   onMove);
    window.removeEventListener('pointerup',     onUp);
    overlayEl.remove();
    overlayEl = null;
  }

  if (langChipOverlay)    { langChipOverlay.remove();    langChipOverlay = null; }
  if (detailChipOverlay)  { detailChipOverlay.remove();  detailChipOverlay = null; }
  if (spinChipOverlay)    { spinChipOverlay.remove();    spinChipOverlay = null; }

  isDragging    = false;
  fillSamples   = null;
  prevFillCount = -1;

  if (labelMesh) { scene.remove(labelMesh); (labelMesh.material as THREE.ShaderMaterial).dispose(); labelMesh = null; }
  if (labelGeo)  { labelGeo.dispose(); labelGeo = null; }
  if (langSectionMesh)    { scene.remove(langSectionMesh);    (langSectionMesh.material   as THREE.ShaderMaterial).dispose(); langSectionMesh    = null; }
  if (langSectionGeo)     { langSectionGeo.dispose();     langSectionGeo     = null; }
  if (langChipMesh)       { scene.remove(langChipMesh);       (langChipMesh.material       as THREE.ShaderMaterial).dispose(); langChipMesh       = null; }
  if (langChipGeo)        { langChipGeo.dispose();        langChipGeo        = null; }
  if (detailSectionMesh)  { scene.remove(detailSectionMesh);  (detailSectionMesh.material  as THREE.ShaderMaterial).dispose(); detailSectionMesh  = null; }
  if (detailSectionGeo)   { detailSectionGeo.dispose();   detailSectionGeo   = null; }
  if (detailChipMesh)     { scene.remove(detailChipMesh);     (detailChipMesh.material     as THREE.ShaderMaterial).dispose(); detailChipMesh     = null; }
  if (detailChipGeo)      { detailChipGeo.dispose();      detailChipGeo      = null; }
  if (spinSectionMesh)    { scene.remove(spinSectionMesh);    (spinSectionMesh.material    as THREE.ShaderMaterial).dispose(); spinSectionMesh    = null; }
  if (spinSectionGeo)     { spinSectionGeo.dispose();     spinSectionGeo     = null; }
  if (spinChipMesh)       { scene.remove(spinChipMesh);       (spinChipMesh.material       as THREE.ShaderMaterial).dispose(); spinChipMesh       = null; }
  if (spinChipGeo)        { spinChipGeo.dispose();        spinChipGeo        = null; }

  clearParticles(labelIndices);
  clearParticles(outlineIndices);
  clearParticles(fillIndices);
  clearParticles(langHeadIndices);
  clearParticles(langChipIndices);
  clearParticles(detailHeadIndices);
  clearParticles(detailChipIndices);
  clearParticles(spinHeadIndices);
  clearParticles(spinChipIndices);

  orbitControls.minDistance = 22;
  orbitControls.maxDistance = 90;
  // Restore camera to its pre-settings state via saveState/reset.
  // Disable damping so the internal update() call zeros sphericalDelta velocity.
  orbitControls.enableDamping = false;
  orbitControls.reset();          // restores position0/target0, calls update() internally
  orbitControls.enableDamping = true;

  setFadeRate(0.25);
  if (orbitRef) { orbitRef.enabled = true; orbitRef = null; }
  flushCubemapNow();
}
