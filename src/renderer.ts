import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { SPHERE_RADIUS, MIN_VERTS, drawSphere } from './sphere';
import { update as updateParticles, points as particlePoints } from './particles';
import { auroraMesh, tickAurora } from './aurora';

// DOM
export const canvasWrapper = document.createElement('div');
canvasWrapper.className = 'canvas-wrapper';
Object.assign(canvasWrapper.style, {
  position: 'fixed', inset: '0', width: '100%', height: '100%',
  overflow: 'hidden', zIndex: '0',
});
document.body.appendChild(canvasWrapper);

export const canvas = document.createElement('canvas');
canvasWrapper.appendChild(canvas);
canvas.style.display = 'none';
canvas.style.width = '100%';
canvas.style.height = '100%';

// Renderer
export const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(devicePixelRatio);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.5;
renderer.autoClear = false;

export const renderTarget = new THREE.WebGLRenderTarget(window.innerWidth, window.innerHeight);
export const renderLargerTarget = new THREE.WebGLRenderTarget(window.innerWidth, window.innerHeight);

// Scene
export const scene = new THREE.Scene();

export const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 100);
camera.position.set(0, 0, 22);
camera.layers.enable(1);
camera.layers.enable(2);

export const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.dampingFactor = 0.05;
controls.enableZoom = false;
controls.target.set(0, 0, 0);
controls.minDistance = 16;   // just outside the outer glass sphere (r=15)
controls.maxDistance = 35;   // comfortable wide view
controls.rotateSpeed = -1;
// Prevent camera from orbiting behind the text (z=0 plane).
// ±0.5π keeps the camera in the front hemisphere with a little side-view wiggle.
controls.minAzimuthAngle = -Math.PI * 0.5;
controls.maxAzimuthAngle =  Math.PI * 0.5;
controls.minPolarAngle   =  Math.PI * 0.2;
controls.maxPolarAngle   =  Math.PI * 0.8;

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderTarget.setSize(window.innerWidth, window.innerHeight);
  renderLargerTarget.setSize(window.innerWidth, window.innerHeight);
});

// Cube cameras
export const cubeRenderTarget = new THREE.WebGLCubeRenderTarget(256);
export const cubeCamera = new THREE.CubeCamera(0.1, 100, cubeRenderTarget);
cubeCamera.position.set(0, 0, 0);
cubeCamera.layers.set(0);
scene.add(cubeCamera);

export const cubeLargeRenderTarget = new THREE.WebGLCubeRenderTarget(256);
export const cubeLargeCamera = new THREE.CubeCamera(0.1, 100, cubeLargeRenderTarget);
cubeLargeCamera.position.set(0, 0, 0);
cubeLargeCamera.layers.set(0);
cubeLargeCamera.layers.enable(1);
scene.add(cubeLargeCamera);

// Shader uniforms
export const glassInnerUniforms = {
  uCameraPos:    { value: camera.position },
  uBeatIntensity:{ value: 0.0 },
  uEnvMap:       { value: cubeRenderTarget.texture },
  uSceneTexture: { value: null as THREE.Texture | null },
  uRadius:       { value: SPHERE_RADIUS },
};

export const glassOuterUniforms = {
  uCameraPos:    { value: camera.position },
  uBeatIntensity:{ value: 0.0 },
  uEnvMap:       { value: cubeLargeRenderTarget.texture },
  uSceneTexture: { value: null as THREE.Texture | null },
  uRadius:       { value: SPHERE_RADIUS * 3 },
};

// Light cubes removed


// Spheres
export const sphereMesh = drawSphere(scene, MIN_VERTS, glassInnerUniforms, 1);
sphereMesh.scale.setScalar(SPHERE_RADIUS);
sphereMesh.renderOrder = 0;

export const largerSphereMesh = drawSphere(scene, MIN_VERTS, glassOuterUniforms, 2);
largerSphereMesh.scale.setScalar(SPHERE_RADIUS * 3);
largerSphereMesh.renderOrder = 1;

// Lighting
scene.add(new THREE.AmbientLight(0xffffff, 0.4));
const dirLight = new THREE.DirectionalLight(0x88ccff, 1.5);
dirLight.position.set(2, 4, 3);
scene.add(dirLight);

// Aurora sky dome — on layer 0 so cube cameras capture it for glass reflections
scene.add(auroraMesh);

// Particles
scene.add(particlePoints);

// Fade quad — dims previous frame each tick to create motion trails
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

const clock = new THREE.Clock();
let elapsed = 0;

// Animation loop
export function animate() {
  requestAnimationFrame(animate);
  const delta = clock.getDelta();
  elapsed += delta;
  beatIntensity *= 0.85;

  controls.rotateSpeed = camera.position.length() < SPHERE_RADIUS ? -1 : 1;
  controls.update();

  glassInnerUniforms.uCameraPos.value = camera.position;
  glassOuterUniforms.uCameraPos.value = camera.position;
  glassInnerUniforms.uBeatIntensity.value = beatIntensity;
  glassOuterUniforms.uBeatIntensity.value = beatIntensity;

  tickAurora(elapsed);

  // particle sim step (writes to its own render target)
  updateParticles(renderer, elapsed, delta, beatIntensity, cubeRenderTarget.texture);

  // Cubemap passes — hide expensive objects that don't need to be reflected.
  sphereMesh.visible  = false;
  largerSphereMesh.visible = false;
  auroraMesh.visible  = false; // aurora is the main perf cost: skip 12 face renders
  cubeCamera.update(renderer, scene);
  renderer.setRenderTarget(renderTarget);
  renderer.clear();
  renderer.render(scene, camera);
  glassInnerUniforms.uSceneTexture.value = renderTarget.texture;

  cubeLargeCamera.update(renderer, scene);
  renderer.setRenderTarget(renderLargerTarget);
  renderer.clear();
  renderer.render(scene, camera);
  glassOuterUniforms.uSceneTexture.value = renderLargerTarget.texture;

  // Restore for the final screen render (inner sphere intentionally hidden for now).
  largerSphereMesh.visible = true;
  auroraMesh.visible       = true;

  // final render to screen — fade quad first, then scene on top
  renderer.setRenderTarget(null);
  renderer.clearDepth();
  renderer.render(fadeScene, fadeCamera);
  renderer.render(scene, camera);
}
