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
// Keep the camera in front of the text so it cannot swing around behind it.
controls.minAzimuthAngle = -Math.PI * 0.5;
controls.maxAzimuthAngle =  Math.PI * 0.5;
controls.minPolarAngle   =  Math.PI * 0.2;
controls.maxPolarAngle   =  Math.PI * 0.8;

const _drawBuf = new THREE.Vector2();
// Tells the aurora shader the current drawing buffer size.
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
  uFade:         { value: 1.0 },
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
  uFade:         { value: 1.0 },
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

// Aurora sky dome. It sits on layer 0 so the reflection cameras can see it.
scene.add(auroraMesh);

scene.add(particlePoints);

// One cylinder side per carousel card so each flat face lines up with a card.
export const menuState = { cylAngle: 0 };

let cylSegments = 8;

// Builds the open sided cylinder used as the carousel of cards.
function buildCylGeo(n: number, r: number, h: number): THREE.BufferGeometry {
  const raw = new THREE.CylinderGeometry(r, r, h, n, 1, true);
  const geo = raw.toNonIndexed();
  raw.dispose();
  geo.computeVertexNormals();
  return geo;
}

// Works out the cylinder radius so cards match the screen size of the CSS cards.
function computeCylRadius(n: number): number {
  const W = window.innerWidth, H = window.innerHeight;
  const tanHFovX = Math.tan(Math.PI / 6) * (W / H); // tan(half horizontal FOV)
  const cssHalfW = (170 / 2) * (900 / (900 - 280));  // CSS apparent panel half-width
  const sinPN = Math.sin(Math.PI / n), cosPN = Math.cos(Math.PI / n);
  const s2 = 2 * tanHFovX;
  const r = (cssHalfW * s2 * 58) / (sinPN * W + cssHalfW * s2 * cosPN);
  return Math.max(4, Math.min(r, 20));
}

// Works out the cylinder height to match the screen size of the CSS cards.
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

// Rebuilds the cylinder with the given number of sides.
export function setCylinderSegments(n: number) {
  const old = cylinderMesh.geometry;
  const r = computeCylRadius(n);
  const h = computeCylHeight(n, r);
  cylinderMesh.geometry = buildCylGeo(n, r, h);
  old.dispose();
  cylSegments = n;
  cylDims.r = r; cylDims.h = h; cylDims.n = n;
}

// Sets how see through the carousel cylinder is.
export function setCylinderOpacity(v: number) {
  (cylinderMesh.material as THREE.ShaderMaterial).uniforms.uOpacity.value = v;
}

let menuMode = false;
// Turns the menu on or off. The menu hides the glass sphere and shows the cylinder.
export function setMenuMode(active: boolean) { menuMode = active; }

let settingsMode = false;
// Turns settings mode on or off. In settings the sphere drifts slowly.
export function setSettingsMode(active: boolean) { settingsMode = active; }

let songMode = false;
// Turns song mode on or off and locks the camera controls during a song.
export function setSongMode(active: boolean) {
  songMode = active;
  controls.enableRotate = !active;
  controls.enablePan    = !active;
}

let hideOuterSphere = false;
// Forces the outer sphere to stay hidden. Used during back transitions.
export function setHideOuterSphere(v: boolean) { hideOuterSphere = v; }

// Sets how faded the outer sphere is.
export function setOuterSphereFade(v: number) { glassOuterUniforms.uFade.value = v; }

const fadeScene  = new THREE.Scene();
fadeScene.add(new THREE.Mesh(
  new THREE.PlaneGeometry(2, 2),
  new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.015, depthWrite: false })
));
const fadeCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

let beatIntensity = 0;
// Flashes the glass brighter on a beat. It decays on its own each frame.
export function triggerBeat(strength: number) {
  beatIntensity = strength;
}

let rippleIdx    = 0;
let chorusTarget = 0;

// Sets how far through a beat pulse the glass is, from zero to one.
export function setBeatProgress(v: number) {
  if (getGlassFx() === 'off') return;
  sharedGlassUniforms.uBeatProgress.value = v;
}

// Sets the target chorus strength the glass eases toward.
export function setChorusFactor(v: number) {
  chorusTarget = v;
}

// Sends a ripple across the glass from a direction on a strong beat.
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

// Redraws the reflection cube right now. Call it after removing reflected objects.
export function flushCubemapNow() {
  sphereMesh.visible      = false;
  largerSphereMesh.visible = false;
  auroraMesh.visible      = false;
  activeCubeCamera.update(renderer, scene);
  if (outerSphereActive && !menuMode && !hideOuterSphere) largerSphereMesh.visible = true;
  auroraMesh.visible = true;
}

// Switches between low and high detail by picking cube maps and shader settings.
export function applyDetailMode(mode: DetailMode) {
  if (mode === 'low') {
    detailHigh          = false;
    activeCubeCamera    = cubeCameraLow;
    activeCubeInterval  = 8;
    activeRenderTarget  = renderTargetHalf;
    // Both spheres share the small cube map so there is no extra outer pass.
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

// The main render loop. Runs every frame to update and draw the whole scene.
export function animate() {
  requestAnimationFrame(animate);
  const delta = clock.getDelta();
  elapsed += delta;
  beatIntensity *= 0.85;

  controls.rotateSpeed = camera.position.length() < SPHERE_RADIUS ? -1 : 1;
  controls.update();

  if (cylinderMesh.visible) {
    // Rotate the cylinder so the first card faces the camera when the angle is zero.
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

  // Reflection passes. Hide costly objects that do not need to be reflected.
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
