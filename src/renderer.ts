import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { SPHERE_RADIUS, MIN_VERTS, drawSphere } from './sphere';
import { update as updateParticles, points as particlePoints } from './particles';
import { auroraMesh, tickAurora, setAuroraMenuReflect, setAuroraMenuTex, setAuroraResolution } from './aurora';
import { menuReflectScene, updateMenuReflect } from './menuReflect';
import { CUBE_INTERVAL, OUTER_SPHERE } from './perf';
import { getDetailMode, getSphereSpin, getGlassFx, type DetailMode } from './settings';
import lyricGlassVert from './shaders/lyric-glass.vert?raw';
import lyricGlassFrag from './shaders/lyric-glass.frag?raw';

export const canvasWrapper = document.createElement('div');
canvasWrapper.className = 'canvas-wrapper';
Object.assign(canvasWrapper.style, {
  position: 'fixed', inset: '0', width: '100%', height: '100%',
  overflow: 'hidden', zIndex: '0',
});
document.body.appendChild(canvasWrapper);

export const canvas = document.createElement('canvas');
canvasWrapper.appendChild(canvas);
canvas.style.display = 'block';
canvas.style.width = '100%';
canvas.style.height = '100%';

export const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.5;
renderer.autoClear = false;

export const renderTarget = new THREE.WebGLRenderTarget(window.innerWidth, window.innerHeight);
export const renderLargerTarget = new THREE.WebGLRenderTarget(window.innerWidth, window.innerHeight);
const renderTargetHalf = new THREE.WebGLRenderTarget(
  Math.ceil(window.innerWidth / 2), Math.ceil(window.innerHeight / 2)
);
const menuReflectRT = new THREE.WebGLRenderTarget(
  Math.ceil(window.innerWidth / 2), Math.ceil(window.innerHeight / 2)
);

export const scene = new THREE.Scene();

export const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 200);
camera.position.set(0, 0, 58);
camera.layers.enable(1);
camera.layers.enable(2);

export const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.dampingFactor = 0.05;
controls.enableZoom = false;
controls.target.set(0, 0, 0);
controls.minDistance = 22;   // just outside the outer glass sphere (r=21)
controls.maxDistance = 68;
controls.rotateSpeed = -1;
// Prevent camera from orbiting behind the text (z=0 plane).
// ±0.5π keeps the camera in the front hemisphere with a little side-view wiggle.
controls.minAzimuthAngle = -Math.PI * 0.5;
controls.maxAzimuthAngle =  Math.PI * 0.5;
controls.minPolarAngle   =  Math.PI * 0.2;
controls.maxPolarAngle   =  Math.PI * 0.8;

const _drawBuf = new THREE.Vector2();
function syncAuroraResolution() {
  renderer.getDrawingBufferSize(_drawBuf);
  setAuroraResolution(_drawBuf.x, _drawBuf.y);
}
syncAuroraResolution();

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderTarget.setSize(window.innerWidth, window.innerHeight);
  renderLargerTarget.setSize(window.innerWidth, window.innerHeight);
  renderTargetHalf.setSize(Math.ceil(window.innerWidth / 2), Math.ceil(window.innerHeight / 2));
  menuReflectRT.setSize(Math.ceil(window.innerWidth / 2), Math.ceil(window.innerHeight / 2));
  syncAuroraResolution();
});

export const cubeRenderTarget = new THREE.WebGLCubeRenderTarget(256);
export const cubeCamera = new THREE.CubeCamera(0.1, 100, cubeRenderTarget);
cubeCamera.position.set(0, 0, 0);
cubeCamera.layers.set(0);
scene.add(cubeCamera);

const cubeRenderTargetLow = new THREE.WebGLCubeRenderTarget(64);
const cubeCameraLow = new THREE.CubeCamera(0.1, 100, cubeRenderTargetLow);
cubeCameraLow.position.set(0, 0, 0);
cubeCameraLow.layers.set(0);
scene.add(cubeCameraLow);

export const cubeLargeRenderTarget = new THREE.WebGLCubeRenderTarget(256);
export const cubeLargeCamera = new THREE.CubeCamera(0.1, 100, cubeLargeRenderTarget);
cubeLargeCamera.position.set(0, 0, 0);
cubeLargeCamera.layers.set(0);
cubeLargeCamera.layers.enable(1);
scene.add(cubeLargeCamera);

const sharedGlassUniforms = {
  uBeatProgress:   { value: 0.0 },
  uChorusFactor:   { value: 0.0 },
  uTime:           { value: 0.0 },
  uRippleTime:     { value: new Float32Array(4) },
  uRippleStrength: { value: new Float32Array(4) },
  uRippleDir:      { value: [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()] },
};

export const glassInnerUniforms = {
  uCameraPos:    { value: camera.position },
  uBeatIntensity:{ value: 0.0 },
  uEnvMap:       { value: cubeRenderTarget.texture },
  uSceneTexture: { value: null as THREE.Texture | null },
  uRadius:       { value: SPHERE_RADIUS },
  uDetailLevel:  { value: 1.0 },
  uFill:         { value: 0.0 },
  ...sharedGlassUniforms,
};

export const glassOuterUniforms = {
  uCameraPos:    { value: camera.position },
  uBeatIntensity:{ value: 0.0 },
  uEnvMap:       { value: cubeLargeRenderTarget.texture },
  uSceneTexture: { value: null as THREE.Texture | null },
  uRadius:       { value: SPHERE_RADIUS * 3 },
  uDetailLevel:  { value: 1.0 },
  uFill:         { value: 0.0 },
  ...sharedGlassUniforms,
};

export const sphereMesh = drawSphere(scene, MIN_VERTS, glassInnerUniforms, 1);
sphereMesh.scale.setScalar(SPHERE_RADIUS);
sphereMesh.renderOrder = 0;

export const largerSphereMesh = drawSphere(scene, MIN_VERTS, glassOuterUniforms, 2);
largerSphereMesh.scale.setScalar(SPHERE_RADIUS * 3);
largerSphereMesh.renderOrder = 1;

scene.add(new THREE.AmbientLight(0xffffff, 0.4));
const dirLight = new THREE.DirectionalLight(0x88ccff, 1.5);
dirLight.position.set(2, 4, 3);
scene.add(dirLight);

// Aurora sky dome — on layer 0 so cube cameras capture it for glass reflections
scene.add(auroraMesh);

scene.add(particlePoints);

// Segment count = number of carousel panels so each flat face aligns with one card.
export const menuState = { cylAngle: 0 };

let cylSegments = 8;

function buildCylGeo(n: number, r: number, h: number): THREE.BufferGeometry {
  const raw = new THREE.CylinderGeometry(r, r, h, n, 1, true);
  const geo = raw.toNonIndexed();
  raw.dispose();
  geo.computeVertexNormals();
  return geo;
}

function computeCylRadius(n: number): number {
  const W = window.innerWidth, H = window.innerHeight;
  const tanHFovX = Math.tan(Math.PI / 6) * (W / H); // tan(half horizontal FOV)
  const cssHalfW = (170 / 2) * (900 / (900 - 280));  // CSS apparent panel half-width
  const sinPN = Math.sin(Math.PI / n), cosPN = Math.cos(Math.PI / n);
  const s2 = 2 * tanHFovX;
  const r = (cssHalfW * s2 * 58) / (sinPN * W + cssHalfW * s2 * cosPN);
  return Math.max(4, Math.min(r, 20));
}

function computeCylHeight(n: number, r: number): number {
  const d = 58 - r * Math.cos(Math.PI / n); // camera-to-face distance
  const cssFullH = 190 * (900 / (900 - 280));
  return cssFullH * Math.tan(Math.PI / 6) * d / (window.innerHeight / 2);
}

const _initR = computeCylRadius(cylSegments);
const _initH = computeCylHeight(cylSegments, _initR);

export const cylDims = { r: _initR, h: _initH, n: cylSegments };

export const cylinderMesh = new THREE.Mesh(
  buildCylGeo(cylSegments, _initR, _initH),
  new THREE.ShaderMaterial({
    vertexShader:   lyricGlassVert,
    fragmentShader: lyricGlassFrag,
    uniforms: {
      uCameraPos:     glassInnerUniforms.uCameraPos,
      uEnvMap:        glassInnerUniforms.uEnvMap,
      uBeatIntensity: glassInnerUniforms.uBeatIntensity,
      uOpacity:       { value: 0.7 },
      uFill:          { value: 1.0 },
    },
    transparent: true,
    depthWrite:  false,
    side:        THREE.DoubleSide,
  }),
);
cylinderMesh.renderOrder = 0;
cylinderMesh.visible = false;
scene.add(cylinderMesh);

/** Rebuild the cylinder with n sides, sized to match the CSS carousel cards on screen. */
export function setCylinderSegments(n: number) {
  const old = cylinderMesh.geometry;
  const r = computeCylRadius(n);
  const h = computeCylHeight(n, r);
  cylinderMesh.geometry = buildCylGeo(n, r, h);
  old.dispose();
  cylSegments = n;
  cylDims.r = r; cylDims.h = h; cylDims.n = n;
}

let menuMode = false;
/** True while the main carousel menu is shown — hides the glass sphere so only the cylinder shows. */
export function setMenuMode(active: boolean) { menuMode = active; }

let settingsMode = false;
/** True while the settings panel is open — the sphere drifts slowly; particles are unaffected. */
export function setSettingsMode(active: boolean) { settingsMode = active; }

let songMode = false;
/** True while a song is playing — the sphere rotates if sphere spin is enabled. */
export function setSongMode(active: boolean) {
  songMode = active;
  controls.enableRotate = !active;
  controls.enablePan    = !active;
}

let hideOuterSphere = false;
/** Suppresses the outer glass sphere regardless of menu/song mode (use during back transitions). */
export function setHideOuterSphere(v: boolean) { hideOuterSphere = v; }

const fadeScene  = new THREE.Scene();
fadeScene.add(new THREE.Mesh(
  new THREE.PlaneGeometry(2, 2),
  new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.015, depthWrite: false })
));
const fadeCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

let beatIntensity = 0;
export function triggerBeat(strength: number) {
  beatIntensity = strength;
}

let rippleIdx    = 0;
let chorusTarget = 0;

export function setBeatProgress(v: number) {
  if (getGlassFx() === 'off') return;
  sharedGlassUniforms.uBeatProgress.value = v;
}

export function setChorusFactor(v: number) {
  chorusTarget = v;
}

export function fireDownbeat(strength: number, dir: THREE.Vector3) {
  if (getGlassFx() === 'off') return;
  const slot = rippleIdx % 4;
  rippleIdx++;
  sharedGlassUniforms.uRippleTime.value[slot]     = elapsed;
  sharedGlassUniforms.uRippleStrength.value[slot] = strength;
  sharedGlassUniforms.uRippleDir.value[slot].copy(dir);
}

let activeCubeCamera: THREE.CubeCamera = cubeCamera;
let activeCubeInterval = CUBE_INTERVAL;
let activeRenderTarget: THREE.WebGLRenderTarget = renderTarget;
let outerSphereActive = OUTER_SPHERE;
let detailHigh = true;

/** Immediately re-render the cubemap with the current scene (call after removing objects that appeared in reflections). */
export function flushCubemapNow() {
  sphereMesh.visible      = false;
  largerSphereMesh.visible = false;
  auroraMesh.visible      = false;
  activeCubeCamera.update(renderer, scene);
  if (outerSphereActive && !menuMode && !hideOuterSphere) largerSphereMesh.visible = true;
  auroraMesh.visible = true;
}

export function applyDetailMode(mode: DetailMode) {
  if (mode === 'low') {
    detailHigh          = false;
    activeCubeCamera    = cubeCameraLow;
    activeCubeInterval  = 8;
    activeRenderTarget  = renderTargetHalf;
    // Both spheres share the low-res cubemap; no separate outer-sphere passes.
    glassInnerUniforms.uEnvMap.value      = cubeRenderTargetLow.texture;
    glassOuterUniforms.uEnvMap.value      = cubeRenderTargetLow.texture;
    glassInnerUniforms.uDetailLevel.value = 0.0;
    glassOuterUniforms.uDetailLevel.value = 0.0;
    outerSphereActive = OUTER_SPHERE;
  } else {
    detailHigh          = true;
    activeCubeCamera    = cubeCamera;
    activeCubeInterval  = CUBE_INTERVAL;
    activeRenderTarget  = renderTarget;
    glassInnerUniforms.uEnvMap.value      = cubeRenderTarget.texture;
    glassOuterUniforms.uEnvMap.value      = cubeLargeRenderTarget.texture;
    glassInnerUniforms.uDetailLevel.value = 1.0;
    glassOuterUniforms.uDetailLevel.value = 1.0;
    outerSphereActive = OUTER_SPHERE;
    largerSphereMesh.visible = OUTER_SPHERE && !menuMode;
  }
}

applyDetailMode(getDetailMode());

const clock = new THREE.Clock();
let elapsed  = 0;
let cubeFrame = 0;

export function animate() {
  requestAnimationFrame(animate);
  const delta = clock.getDelta();
  elapsed += delta;
  beatIntensity *= 0.85;

  controls.rotateSpeed = camera.position.length() < SPHERE_RADIUS ? -1 : 1;
  controls.update();

  if (cylinderMesh.visible) {
    // Face 0 of the cylinder has its outward normal at π/n — offset by −π/n so it
    // points at angle 0 (toward the camera) when spinAngle=0 (panel 0 at front).
    cylinderMesh.rotation.y     = -Math.PI / cylSegments + menuState.cylAngle;
    sphereMesh.rotation.y       = menuState.cylAngle;
    largerSphereMesh.rotation.y = menuState.cylAngle;
  }

  if ((settingsMode || songMode) && getSphereSpin() === 'on') {
    largerSphereMesh.rotation.y += delta * 0.1;
  }

  glassInnerUniforms.uCameraPos.value = camera.position;
  glassOuterUniforms.uCameraPos.value = camera.position;
  glassInnerUniforms.uBeatIntensity.value = beatIntensity;
  glassOuterUniforms.uBeatIntensity.value = beatIntensity;

  sharedGlassUniforms.uTime.value = elapsed;
  sharedGlassUniforms.uChorusFactor.value +=
    (chorusTarget - sharedGlassUniforms.uChorusFactor.value) * 0.05;

  tickAurora(elapsed);

  updateParticles(renderer, elapsed, delta, beatIntensity, cubeRenderTarget.texture);

  const updateCube = (cubeFrame % activeCubeInterval === 0);
  cubeFrame++;

  // Cubemap passes — hide expensive objects that don't need to be reflected.
  sphereMesh.visible  = false;
  largerSphereMesh.visible = false;
  auroraMesh.visible  = false; // aurora is the main perf cost: skip 12 face renders

  if (updateCube) {
    activeCubeCamera.update(renderer, scene);
  }
  renderer.setRenderTarget(activeRenderTarget);
  renderer.clear();
  renderer.render(scene, camera);
  glassInnerUniforms.uSceneTexture.value = activeRenderTarget.texture;

  if (outerSphereActive) {
    if (detailHigh) {
      if (updateCube) cubeLargeCamera.update(renderer, scene);
      renderer.setRenderTarget(renderLargerTarget);
      renderer.clear();
      renderer.render(scene, camera);
      glassOuterUniforms.uSceneTexture.value = renderLargerTarget.texture;
    } else {
      glassOuterUniforms.uSceneTexture.value = activeRenderTarget.texture;
    }
  }

  if (cylinderMesh.visible) {
    updateMenuReflect();
    renderer.setRenderTarget(menuReflectRT);
    renderer.clear();
    renderer.render(menuReflectScene, camera);
    setAuroraMenuTex(menuReflectRT.texture);
  }
  setAuroraMenuReflect(cylinderMesh.visible);

  if (outerSphereActive && !menuMode && !hideOuterSphere) largerSphereMesh.visible = true;
  auroraMesh.visible = true;

  renderer.setRenderTarget(null);
  renderer.clearDepth();
  renderer.render(fadeScene, fadeCamera);
  renderer.render(scene, camera);

}
