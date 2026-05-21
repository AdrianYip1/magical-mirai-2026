import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { SPHERE_RADIUS, MIN_VERTS, drawSphere } from './sphere';

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

export const renderTarget = new THREE.WebGLRenderTarget(window.innerWidth, window.innerHeight);
export const renderLargerTarget = new THREE.WebGLRenderTarget(window.innerWidth, window.innerHeight);

// Scene
export const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0a0a1a);

export const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 100);
camera.position.set(0, 0, 3);
camera.layers.enable(1);
camera.layers.enable(2);

export const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.dampingFactor = 0.05;
controls.enableZoom = true;
controls.target.set(0, 0, 0);
controls.minDistance = 0;
controls.maxDistance = 6 * SPHERE_RADIUS;
controls.rotateSpeed = -1;

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

// Light cubes
const lightCubeData: [number, number, number, number, number][] = [
  // x, y, z, colour, size — outside sphere
  [ 6,  2,  4, 0x00ffff, 0.6],
  [-5, -6,  3, 0xff00ff, 0.6],
  [ 4,  6, -5, 0xff8800, 0.5],
  [-6,  3, -6, 0x0088ff, 0.7],
  [ 0, -8,  2, 0x00ff88, 0.5],
  // inside sphere
  [ 2,  1,  0, 0xffffff, 0.3],
  [-1, -2,  2, 0x88aaff, 0.3],
  [ 0,  3, -2, 0xff88aa, 0.3],
];
for (const [x, y, z, colour, size] of lightCubeData) {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(size, size, size),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(colour).multiplyScalar(4) })
  );
  mesh.position.set(x, y, z);
  scene.add(mesh);
}

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

// Animation loop
export function animate() {
  requestAnimationFrame(animate);

  glassInnerUniforms.uCameraPos.value = camera.position;
  glassOuterUniforms.uCameraPos.value = camera.position;
  controls.rotateSpeed = camera.position.length() < SPHERE_RADIUS ? -1 : 1;
  controls.update();

  glassInnerUniforms.uBeatIntensity.value = 0.9;
  glassOuterUniforms.uBeatIntensity.value = 0.9;

  sphereMesh.visible = false;
  largerSphereMesh.visible = false;
  cubeCamera.update(renderer, scene);
  renderer.setRenderTarget(renderTarget);
  renderer.render(scene, camera);
  sphereMesh.visible = true;
  glassInnerUniforms.uSceneTexture.value = renderTarget.texture;

  cubeLargeCamera.update(renderer, scene);
  renderer.setRenderTarget(renderLargerTarget);
  renderer.render(scene, camera);
  largerSphereMesh.visible = true;
  glassOuterUniforms.uSceneTexture.value = renderLargerTarget.texture;

  renderer.setRenderTarget(null);
  renderer.render(scene, camera);
}
