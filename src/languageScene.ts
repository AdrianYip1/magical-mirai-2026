import * as THREE from 'three';
import { TextGeometry } from 'three/addons/geometries/TextGeometry.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { activateWordParticles, clearParticles, setFadeRate } from './particles';
import { sampleSurface, getFont } from './lyrics';
import { getLanguage, setLanguage } from './language';
import { scene, glassInnerUniforms } from './renderer';
import lyricGlassVert from './shaders/lyric-glass.vert?raw';
import lyricGlassFrag from './shaders/lyric-glass.frag?raw';

const HEADING_Y    =  0.55;
const HEADING_SIZE =  0.42;
const EN_Y         = -0.22;
const JA_Y         = -0.82;
const OPT_SIZE     =  0.52;

const LAYOUT_HALF_H = Math.max(HEADING_Y + HEADING_SIZE * 1.3, Math.abs(JA_Y) + OPT_SIZE * 1.2);
const LAYOUT_HALF_W = 1.6;

const HEAD_COUNT = 15_000;
const EN_COUNT   =  8_000;
const JA_COUNT   =  8_000;

const headIndices = new Uint32Array(HEAD_COUNT); for (let i = 0; i < HEAD_COUNT; i++) headIndices[i] = i;
const enIndices   = new Uint32Array(EN_COUNT);   for (let i = 0; i < EN_COUNT;   i++) enIndices[i]   = HEAD_COUNT + i;
const jaIndices   = new Uint32Array(JA_COUNT);   for (let i = 0; i < JA_COUNT;   i++) jaIndices[i]   = HEAD_COUNT + EN_COUNT + i;

let headGeo:  THREE.BufferGeometry | null = null;
let headMesh: THREE.Mesh           | null = null;
let enGeo:    THREE.BufferGeometry | null = null;
let enMesh:   THREE.Mesh           | null = null;
let jaGeo:    THREE.BufferGeometry | null = null;
let jaMesh:   THREE.Mesh           | null = null;
let enOverlay: HTMLDivElement | null = null;
let jaOverlay: HTMLDivElement | null = null;

let savedCamPos:  THREE.Vector3    | null = null;
let savedCamQuat: THREE.Quaternion | null = null;
let savedTarget:  THREE.Vector3    | null = null;
let orbitRef:     OrbitControls    | null = null;

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

function worldToScreen(wx: number, wy: number, camera: THREE.Camera, el: HTMLCanvasElement) {
  const v = new THREE.Vector3(wx, wy, 0).project(camera);
  return { x: (v.x + 1) / 2 * el.clientWidth, y: (-v.y + 1) / 2 * el.clientHeight };
}

function highlightCurrent() {
  const lang = getLanguage();
  if (enMesh) (enMesh.material as THREE.ShaderMaterial).uniforms.uOpacity.value = lang === 'en' ? 1.0 : 0.2;
  if (jaMesh) (jaMesh.material as THREE.ShaderMaterial).uniforms.uOpacity.value = lang === 'ja' ? 1.0 : 0.2;

  if (enGeo && jaGeo) {
    if (lang === 'en') {
      activateWordParticles(enIndices, sampleSurface(enGeo, EN_COUNT));
      clearParticles(jaIndices);
    } else {
      activateWordParticles(jaIndices, sampleSurface(jaGeo, JA_COUNT));
      clearParticles(enIndices);
    }
  }
}

export function enterLanguage(
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
  const zForH   = LAYOUT_HALF_H / Math.tan(fovHalf) * 1.25;
  const zForW   = LAYOUT_HALF_W / (Math.tan(fovHalf) * aspect) * 1.25;
  camera.position.set(0, 0, Math.max(zForH, zForW, 3));
  camera.quaternion.identity();
  orbitControls.target.set(0, 0, 0);
  orbitControls.update();

  headGeo = new TextGeometry('LANGUAGE', { font, size: HEADING_SIZE, depth: 0.12, curveSegments: 4 });
  headGeo.computeBoundingBox();
  const hbb = headGeo.boundingBox!;
  headGeo.translate(-(hbb.min.x + hbb.max.x) / 2, HEADING_Y - (hbb.min.y + hbb.max.y) / 2, 0);
  activateWordParticles(headIndices, sampleSurface(headGeo, HEAD_COUNT));
  headMesh = new THREE.Mesh(headGeo, makeGlassMat());
  scene.add(headMesh);

  enGeo = new TextGeometry('ENGLISH', { font, size: OPT_SIZE, depth: 0.14, curveSegments: 4 });
  enGeo.computeBoundingBox();
  const ebb = enGeo.boundingBox!;
  enGeo.translate(-(ebb.min.x + ebb.max.x) / 2, EN_Y - (ebb.min.y + ebb.max.y) / 2, 0);
  enMesh = new THREE.Mesh(enGeo, makeGlassMat());
  scene.add(enMesh);

  jaGeo = new TextGeometry('日本語', { font, size: OPT_SIZE, depth: 0.14, curveSegments: 4 });
  jaGeo.computeBoundingBox();
  const jbb = jaGeo.boundingBox!;
  jaGeo.translate(-(jbb.min.x + jbb.max.x) / 2, JA_Y - (jbb.min.y + jbb.max.y) / 2, 0);
  jaMesh = new THREE.Mesh(jaGeo, makeGlassMat());
  scene.add(jaMesh);

  highlightCurrent();

  function makeOverlay(worldY: number, onClick: () => void): HTMLDivElement {
    const tl = worldToScreen(-LAYOUT_HALF_W, worldY + OPT_SIZE * 0.85, camera, canvasEl);
    const br = worldToScreen( LAYOUT_HALF_W, worldY - OPT_SIZE * 0.85, camera, canvasEl);
    const el = document.createElement('div');
    Object.assign(el.style, {
      position: 'fixed',
      left: `${tl.x}px`, top: `${tl.y}px`,
      width: `${Math.max(60, br.x - tl.x)}px`,
      height: `${Math.max(40, br.y - tl.y)}px`,
      cursor: 'pointer', zIndex: '20',
    });
    document.body.appendChild(el);
    el.addEventListener('click', onClick);
    return el;
  }

  enOverlay = makeOverlay(EN_Y, () => { setLanguage('en'); highlightCurrent(); });
  jaOverlay = makeOverlay(JA_Y, () => { setLanguage('ja'); highlightCurrent(); });
}

export function leaveLanguage(
  camera: THREE.PerspectiveCamera,
  orbitControls: OrbitControls,
): void {
  if (enOverlay) { enOverlay.remove(); enOverlay = null; }
  if (jaOverlay) { jaOverlay.remove(); jaOverlay = null; }

  if (headMesh) { scene.remove(headMesh); (headMesh.material as THREE.ShaderMaterial).dispose(); headMesh = null; }
  if (headGeo)  { headGeo.dispose();  headGeo  = null; }
  if (enMesh)   { scene.remove(enMesh);   (enMesh.material   as THREE.ShaderMaterial).dispose(); enMesh   = null; }
  if (enGeo)    { enGeo.dispose();    enGeo    = null; }
  if (jaMesh)   { scene.remove(jaMesh);   (jaMesh.material   as THREE.ShaderMaterial).dispose(); jaMesh   = null; }
  if (jaGeo)    { jaGeo.dispose();    jaGeo    = null; }

  clearParticles(headIndices);
  clearParticles(enIndices);
  clearParticles(jaIndices);

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
