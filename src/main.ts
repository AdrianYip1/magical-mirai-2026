import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { Text } from 'troika-three-text';
import { Player, IPlayerApp, IPhrase } from 'textalive-app-api';
import panelVert from './shaders/panel.vert.glsl?raw';
import panelFrag from './shaders/panel.frag.glsl?raw';
import cubeVert from './shaders/cube.vert.glsl?raw';
import cubeFrag from './shaders/cube.frag.glsl?raw';

const panelUniforms = {
  uTime:          { value: 0.0 },
  uBeatIntensity: { value: 0.0 },
  color:          { value: new THREE.Color(0x00ffff) },
};

const cubeUniforms = {
  color: { value: new THREE.Color(0x00ffff) },
};

// Renderer
const canvas = document.createElement('canvas');
document.body.appendChild(canvas);

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(devicePixelRatio);

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
});

// Panel
const panel = new THREE.Mesh(
  new THREE.PlaneGeometry(4, 1),
  new THREE.ShaderMaterial({
    vertexShader: panelVert,
    fragmentShader: panelFrag,
    uniforms: panelUniforms,
    transparent: true,
    side: THREE.DoubleSide,
  })
);
scene.add(panel);

const cube = new THREE.Mesh(
  new THREE.BoxGeometry(3, 3, 3, 1, 2, 3),
  new THREE.ShaderMaterial({
    vertexShader: cubeVert,
    fragmentShader: cubeFrag,
    uniforms: cubeUniforms,
  })
);
cube.scale.set(0.1, 0.1, 0.1);
scene.add(cube);

// 3D lyric text @ origin
const lyricText = new Text();
lyricText.font = '/NotoSansJP-Bold.otf';
lyricText.fontSize = 0.5;
lyricText.color = 0xffffff;
lyricText.anchorX = 'center';
lyricText.anchorY = 'middle';
lyricText.textAlign = 'center';
lyricText.text = '';
lyricText.sync();
scene.add(lyricText);

// Animation loop
const clock = new THREE.Clock();

function animate() {
  requestAnimationFrame(animate);
  controls.update();
  panel.rotation.y += 0.005;
  cube.rotation.x += 0.001;
  panelUniforms.uTime.value = clock.getElapsedTime();
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

    const phrase = player.video.findPhrase(position);
    if (phrase !== currentPhrase) {
      currentPhrase = phrase;
      lyricText.text = phrase ? phrase.text : '';
      lyricText.sync();
      console.log('[lyric]', lyricText.text);
    }
  },
});
