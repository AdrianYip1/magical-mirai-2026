import * as THREE from 'three';
import { Player, IPlayerApp } from 'textalive-app-api';

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

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// Placeholder panel 
const panel = new THREE.Mesh(
  new THREE.PlaneGeometry(4, 1),
  new THREE.MeshBasicMaterial({ color: 0x00ffff, wireframe: true })
);
scene.add(panel);

// Animation loop
function animate() {
  requestAnimationFrame(animate);
  panel.rotation.y += 0.005;
  renderer.render(scene, camera);
}
animate();

// TextAlive api
const player = new Player({
  app: { token: import.meta.env.VITE_TEXTALIVE_TOKEN ?? '' },
  mediaElement: document.createElement('audio'),
});

player.addListener({
  onAppReady(app: IPlayerApp) {
    if (!app.songUrl) {
      player.createFromSongUrl('https://piapro.jp/t/E2i3', {
        video: { beatId: 4267297, chordId: 2727635, repetitiveSegmentId: 2824327 },
      });
    }
  },

  onVideoReady() {
    console.log('[TextAlive] video ready');
  },

  onTimerReady() {
    console.log('[TextAlive] timer ready — playback available');
  },

  onTimeUpdate(position: number) {
    void position;
  },

  onBeat() {
    console.log('[TextAlive] beat');
  },

  onPhrase() {
    console.log('[TextAlive] phrase');
  },
});
