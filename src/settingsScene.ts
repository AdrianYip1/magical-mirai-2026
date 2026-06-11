import * as THREE from 'three';
import { TextGeometry } from 'three/addons/geometries/TextGeometry.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { activateWordParticles, clearParticles, setFadeRate } from './particles';
import { sampleSurface, getFont } from './lyrics';
import { setVolume, getVolume } from './volume';
import { scene, glassInnerUniforms } from './renderer';
import lyricGlassVert from './shaders/lyric-glass.vert?raw';
import lyricGlassFrag from './shaders/lyric-glass.frag?raw';

// ── Layout constants ──────────────────────────────────────────────────────────
const BAR_HALF_W = 1.1;
const BAR_LEFT   = -BAR_HALF_W;
const BAR_RIGHT  =  BAR_HALF_W;
const BAR_BOTTOM = -0.38;
const BAR_TOP    = -0.12;
const BAR_WIDTH  = BAR_RIGHT  - BAR_LEFT;
const BAR_HEIGHT = BAR_TOP    - BAR_BOTTOM;
const LABEL_Y    =  0.35;
const LABEL_SIZE =  0.4;

// Worst-case half-extents used to compute a camera Z that fits everything.
const LAYOUT_HALF_H = Math.max(LABEL_Y + LABEL_SIZE * 1.3, Math.abs(BAR_BOTTOM));
const LAYOUT_HALF_W = BAR_HALF_W;

// ── Particle index allocations ────────────────────────────────────────────────
const LABEL_COUNT   = 20_000;
const OUTLINE_COUNT =  3_000;
const FILL_COUNT    = 12_000;

const labelIndices   = new Uint32Array(LABEL_COUNT);
const outlineIndices = new Uint32Array(OUTLINE_COUNT);
const fillIndices    = new Uint32Array(FILL_COUNT);
for (let i = 0; i < LABEL_COUNT;   i++) labelIndices[i]   = i;
for (let i = 0; i < OUTLINE_COUNT; i++) outlineIndices[i] = LABEL_COUNT + i;
for (let i = 0; i < FILL_COUNT;    i++) fillIndices[i]    = LABEL_COUNT + OUTLINE_COUNT + i;

// ── Module state ──────────────────────────────────────────────────────────────
let labelGeo:      THREE.BufferGeometry | null = null;
let labelMesh:     THREE.Mesh           | null = null;
let fillSamples:   Float32Array | null = null;
let prevFillCount  = -1;

let savedCamPos:   THREE.Vector3    | null = null;
let savedCamQuat:  THREE.Quaternion | null = null;
let savedTarget:   THREE.Vector3    | null = null;

let orbitRef:      OrbitControls    | null = null;
let overlayEl:     HTMLDivElement   | null = null;
let isDragging     = false;
let barScreenL     = 0;
let barScreenW     = 1;

// ── Particle helpers ──────────────────────────────────────────────────────────

function sampleOutline(): Float32Array {
  const out = new Float32Array(OUTLINE_COUNT * 4);
  for (let i = 0; i < OUTLINE_COUNT; i++) {
    const t    = Math.random();
    const edge = (Math.random() * 4) | 0;
    let x: number, y: number;
    if      (edge === 0) { x = BAR_LEFT  + t * BAR_WIDTH;  y = BAR_BOTTOM; }
    else if (edge === 1) { x = BAR_LEFT  + t * BAR_WIDTH;  y = BAR_TOP;    }
    else if (edge === 2) { x = BAR_LEFT;  y = BAR_BOTTOM   + t * BAR_HEIGHT; }
    else                 { x = BAR_RIGHT; y = BAR_BOTTOM   + t * BAR_HEIGHT; }
    out[i * 4] = x; out[i * 4 + 1] = y;
  }
  return out;
}

// Random positions across the full bar sorted by x.
// Activating the first N particles always fills from the left edge.
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

// Only updates the delta so already-settled particles aren't disturbed.
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

// ── Overlay interaction ───────────────────────────────────────────────────────

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

// ── Public API ────────────────────────────────────────────────────────────────

export function enterSettings(
  camera: THREE.PerspectiveCamera,
  canvasEl: HTMLCanvasElement,
  orbitControls: OrbitControls,
): void {
  const font = getFont();
  if (!font) return;

  orbitRef = orbitControls;
  orbitControls.enabled = false;
  setFadeRate(0); // particles hold their targets indefinitely in settings

  // Save and snap camera so the full layout is visible without user zoom.
  savedCamPos  = camera.position.clone();
  savedCamQuat = camera.quaternion.clone();
  savedTarget  = orbitControls.target.clone();

  const fovHalf = (camera.fov / 2) * (Math.PI / 180);
  const aspect  = canvasEl.clientWidth / canvasEl.clientHeight;
  const zForH   = LAYOUT_HALF_H / Math.tan(fovHalf) * 1.25;
  const zForW   = LAYOUT_HALF_W / (Math.tan(fovHalf) * aspect) * 1.25;
  camera.position.set(0, 0, Math.max(zForH, zForW, 3));
  camera.quaternion.identity();
  orbitControls.target.set(0, 0, 0);
  orbitControls.update();

  // VOLUME label
  labelGeo = new TextGeometry('VOLUME', {
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

  labelMesh = new THREE.Mesh(labelGeo, new THREE.ShaderMaterial({
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
  }));
  scene.add(labelMesh);

  // Bar outline
  activateWordParticles(outlineIndices, sampleOutline());

  // Fill (sorted samples built once per enter)
  prevFillCount = 0;
  fillSamples   = buildFillSamples();
  updateBar(getVolume());

  // Transparent overlay div for pointer interaction (projected after camera set)
  setupOverlay(camera, canvasEl);
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

  isDragging    = false;
  fillSamples   = null;
  prevFillCount = -1;

  if (labelMesh) { scene.remove(labelMesh); (labelMesh.material as THREE.ShaderMaterial).dispose(); labelMesh = null; }
  if (labelGeo)  { labelGeo.dispose(); labelGeo = null; }

  // Restore camera
  if (savedCamPos && savedCamQuat && savedTarget) {
    camera.position.copy(savedCamPos);
    camera.quaternion.copy(savedCamQuat);
    orbitControls.target.copy(savedTarget);
    orbitControls.update();
    savedCamPos = savedCamQuat = savedTarget = null;
  }

  setFadeRate(0.25); // restore normal lyric fade behaviour
  if (orbitRef) { orbitRef.enabled = true; orbitRef = null; }
}
