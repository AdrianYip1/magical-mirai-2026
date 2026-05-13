import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { TextGeometry } from 'three/addons/geometries/TextGeometry.js';
import { FontLoader, Font } from 'three/addons/loaders/FontLoader.js';
import { Player, IPlayerApp, IPhrase, IBeat } from 'textalive-app-api';
import panelVert from './shaders/panel.vert.glsl?raw';
import panelFrag from './shaders/panel.frag.glsl?raw';
import cubeVert from './shaders/cube.vert.glsl?raw';
import cubeFrag from './shaders/cube.frag.glsl?raw';
import glassFrag from './shaders/glass.frag?raw';
import { ConvexGeometry, GlitchPass } from 'three/examples/jsm/Addons.js';

// Constant Values
const GOLDEN_RATIO = (1 + Math.sqrt(5)) / 2;
const GOLDEN_ANGLE = 2 * Math.PI * (2 - GOLDEN_RATIO);

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

const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 100);
camera.position.set(0, 0, 5);

const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.dampingFactor = 0.05;
controls.enableZoom = true;

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderTarget.setSize(window.innerWidth, window.innerHeight);
  glassUniforms.uResolution.value.set(window.innerWidth, window.innerHeight);
});

const panelUniforms = {
  uTime:          { value: 0.0 },
  uBeatIntensity: { value: 0.0 },
  color:          { value: new THREE.Color(0x00ffff) },
};

const glassUniforms = {
  uCameraPos: {value: camera.position},
  uSceneTexture: {value : null as THREE.Texture | null},
  uResolution: {value: new THREE.Vector2(window.innerWidth, window.innerHeight)},
  uBeatIntensity: {value: 0.0},
};

function drawSphere(vertices: number) {
  const pointsGeo = fibSphere(vertices);
  const positions = pointsGeo.attributes.position;

  // Get vec3 for convex geometry
  const points: THREE.Vector3[] = [];
  for (let i = 0; i < positions.count; i++) {
    points.push(new THREE.Vector3(
      positions.getX(i),
      positions.getY(i),
      positions.getZ(i)
    ));
  }

  // Use convex hull triangulation in 3d
  const geometry = new ConvexGeometry(points);
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

  scene.add(mesh);
  return mesh;
}

const sphereMesh = drawSphere(10);

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

// Animation loop
const clock = new THREE.Clock();

function animate() {
  requestAnimationFrame(animate);
  controls.update();
  glassUniforms.uBeatIntensity.value *= 0.9;
  panelUniforms.uTime.value = clock.getElapsedTime();


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
    }

    const phrase = player.video.findPhrase(position);
    if (phrase !== currentPhrase) {
      currentPhrase = phrase;
      setLyric(phrase ? phrase.text : '');
      console.log('[lyric]', phrase?.text ?? '');
    }
  },
});

// fibSphere will take n amount of vertices and find the xyz position of each one
// sets them into a Float32Array and loads into a buffer geometry.
function fibSphere(vertices: number) {
  const geometry = new THREE.BufferGeometry();
  const positions = new Float32Array(vertices * 3);

  for (let k = 0; k < vertices; k++) { // k goes from 0 to n - 1
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

