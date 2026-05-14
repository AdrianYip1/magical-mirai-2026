import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { TextGeometry } from 'three/addons/geometries/TextGeometry.js';
import { FontLoader, Font } from 'three/addons/loaders/FontLoader.js';
import { Player, IPlayerApp, IPhrase, IBeat } from 'textalive-app-api';
import cubeVert from './shaders/cube.vert.glsl?raw';
import glassFrag from './shaders/glass.frag?raw';
import { ConvexGeometry } from 'three/examples/jsm/Addons.js';

// Constants
const GOLDEN_RATIO = (1 + Math.sqrt(5)) / 2;
const GOLDEN_ANGLE = 2 * Math.PI * (2 - GOLDEN_RATIO);
const SPHERE_RADIUS = 5;
const MIN_VERTS = 100;
const MAX_VERTS = 120;
const VERT_STEP = 5;
let currentVerts = MIN_VERTS;

// Renderer
const canvas = document.createElement('canvas');
document.body.appendChild(canvas);

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(devicePixelRatio);

const renderTarget = new THREE.WebGLRenderTarget(
  window.innerWidth,
  window.innerHeight
);

// Scene
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0a0a1a);

const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 100);
camera.position.set(0, 0, 3);

const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.dampingFactor = 0.05;
controls.enableZoom = true;
controls.target.set(0, 0, 0);
controls.minDistance = 0;
controls.maxDistance = 2 * SPHERE_RADIUS;
controls.rotateSpeed = -1;

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderTarget.setSize(window.innerWidth, window.innerHeight);
  glassUniforms.uResolution.value.set(window.innerWidth, window.innerHeight);
});

// Cube Camera
const cubeRenderTarget = new THREE.WebGLCubeRenderTarget(256);
const cubeCamera = new THREE.CubeCamera(0.1, 100, cubeRenderTarget);
cubeCamera.position.set(0, 0, 0);
scene.add(cubeCamera);

camera.layers.enable(1);

//Shader Uniforms
const glassUniforms = {
  uCameraPos: {value: camera.position},
  uSceneTexture: {value : null as THREE.Texture | null},
  uResolution: {value: new THREE.Vector2(window.innerWidth, window.innerHeight)},
  uBeatIntensity: {value: 0.0},
  uInsideSphere: {value: -1.0}, // Checks if camera is inside or outside sphere (-1 or 1) to change the direction of normal vectors of the primitives
  uEnvMap: {value: cubeRenderTarget.texture },
};

const lightCube1 = new THREE.Mesh(
  new THREE.BoxGeometry(0.5, 0.5, 0.5),
  new THREE.MeshBasicMaterial({ color: 0xffffff })
);
lightCube1.position.set(6, 2, 0);
scene.add(lightCube1);

const lightCube2 = new THREE.Mesh(
  new THREE.BoxGeometry(1, 1, 1),
  new THREE.MeshBasicMaterial({ color: 0xffffff })
);
lightCube2.position.set(-7, 4, 0);
scene.add(lightCube2);

// Build and Render the Sphere 
function buildConvexGeometry(vertexCount: number): ConvexGeometry {
  const pointsGeo = fibSphere(vertexCount);
  const positions = pointsGeo.attributes.position;
  const points: THREE.Vector3[] = [];
  for (let i = 0; i < positions.count; i++) {
    points.push(new THREE.Vector3(
      positions.getX(i),
      positions.getY(i),
      positions.getZ(i)
    ));
  }

  // Get the non averaged out normals (since they are smoothed out by default)
  const convex = new ConvexGeometry(points);
  const flat = convex.toNonIndexed();
  flat.computeVertexNormals();
  return flat;
}

function drawSphere(vertexCount: number) {
  const geometry = buildConvexGeometry(vertexCount);
  const mesh = new THREE.Mesh(
    geometry,
    new THREE.ShaderMaterial({
      vertexShader: cubeVert,
      fragmentShader: glassFrag,
      uniforms: glassUniforms,
      transparent: true,
      side: THREE.DoubleSide,
    })
  );
  mesh.layers.set(1);
  scene.add(mesh);
  return mesh;
}

function fibSphere(vertices: number) {
  const geometry = new THREE.BufferGeometry();
  const positions = new Float32Array(vertices * 3);

  for (let k = 0; k < vertices; k++) {
    const phi = k * GOLDEN_ANGLE;
    const theta = Math.acos(1 - (2 * k / (vertices - 1)));
    const x = Math.sin(theta) * Math.cos(phi);
    const y = Math.sin(theta) * Math.sin(phi);
    const z = Math.cos(theta);

    positions[k * 3] = x;
    positions[k * 3 + 1] = y;
    positions[k * 3 + 2] = z;
  }
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  return geometry;
}

const sphereMesh = drawSphere(currentVerts);
sphereMesh.scale.setScalar(SPHERE_RADIUS);


// Animation loop
function animate() {
  requestAnimationFrame(animate);
  controls.rotateSpeed = camera.position.length() < SPHERE_RADIUS ? -1 : 1;
  controls.update();

  glassUniforms.uInsideSphere.value = camera.position.length() < SPHERE_RADIUS ? -1 : 1;
  glassUniforms.uBeatIntensity.value *= 0.9;
  cubeCamera.update(renderer, scene); // since the sphere mesh is on layer 1 and cubeCamera is layer 0, sphere is excluded

  sphereMesh.visible = false;
  renderer.setRenderTarget(renderTarget);
  renderer.render(scene, camera);

  sphereMesh.visible = true;
  renderer.setRenderTarget(null);
  glassUniforms.uSceneTexture.value = renderTarget.texture;
  renderer.render(scene, camera);
}
animate();

// Play button
let timerReady = false;
document.getElementById('play')!.addEventListener('click', () => {
  if (timerReady) player.requestPlay();
});

// TextAlive
const player = new Player({
  app: { token: import.meta.env.VITE_TEXTALIVE_TOKEN ?? '' },
  mediaElement: document.createElement('audio'),
});

let currentPhrase: IPhrase | null = null;
let currentBeat: IBeat | null = null;

player.addListener({
  onAppReady(app: IPlayerApp) {
    if (!app.songUrl) {
      player.createFromSongUrl('https://piapro.jp/t/E2i3/20251215092113', {
        video: {
          beatId: 4827298,
          chordId: 2963759,
          repetitiveSegmentId: 3086266,
          lyricId: 126533,
          lyricDiffId: 28631,
        },
      });
    }
  },

  onVideoReady() {
    console.log('[TextAlive] video ready');
  },

  onTimerReady() {
    console.log('[TextAlive] timer ready');
    timerReady = true;
  },

  onTimeUpdate(position: number) {
    if (!player.video) return;

    // TODO: add an option for users to config offset (with a ui)
    // function that syncs music with beat automatically if desync
    const beat = player.findBeat(position);
    if (beat != currentBeat) {
      currentBeat = beat;
      glassUniforms.uBeatIntensity.value = 1.0;
      currentVerts = currentVerts >= MAX_VERTS ? MIN_VERTS : currentVerts + VERT_STEP;
      sphereMesh.geometry.dispose();
      sphereMesh.geometry = buildConvexGeometry(currentVerts);
    }

    const phrase = player.video.findPhrase(position);
    if (phrase !== currentPhrase) {
      currentPhrase = phrase;
      setLyric(phrase ? phrase.text : '');
      console.log('[lyric]', phrase?.text ?? '');
    }
  },
});


// 3D lyric text
let loadedFont: Font | null = null;
let lyricMesh: THREE.Mesh | null = null;

const fontLoader = new FontLoader();
fontLoader.load('/MPLUS1-Black.typeface.json', (font) => {
  loadedFont = font;
  console.log('[font] loaded');
  if (currentPhrase) setLyric(currentPhrase.text);
});

function setLyric(text: string) {
  if (!loadedFont) return;

  // remove old mesh
  if (lyricMesh) {
    lyricMesh.geometry.dispose();
    scene.remove(lyricMesh);
  }

  if (!text) {
    lyricMesh = null;
    return;
  }

  const geo = new TextGeometry(text, {
    font: loadedFont,
    size: 1.5,
    depth: 0.2,
    curveSegments: 40,
    bevelEnabled: true,
    bevelThickness: 0.04,
    bevelSize: 0.03,
    bevelSegments: 5,
  });

  // center the text around the origin
  geo.computeBoundingBox();
  const bb = geo.boundingBox!;
  const offsetX = -(bb.max.x - bb.min.x) / 2;
  const offsetY = -(bb.max.y - bb.min.y) / 2;
  geo.translate(offsetX, offsetY, 0);

  lyricMesh = new THREE.Mesh(
    geo,
    new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 0.3, roughness: 0.4 })
  );
  lyricMesh.position.z = 0.5;

  // scale down if text is wider than 4 units
  const width = bb.max.x - bb.min.x;
  if (width > 4) lyricMesh.scale.setScalar(4 / width);

  scene.add(lyricMesh);
}

// Lighting for MeshStandardMaterial
const ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
scene.add(ambientLight);
const dirLight = new THREE.DirectionalLight(0x88ccff, 1.5);
dirLight.position.set(2, 4, 3);
scene.add(dirLight);
