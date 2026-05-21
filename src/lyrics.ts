import * as THREE from 'three';
import { TextGeometry } from 'three/addons/geometries/TextGeometry.js';
import { FontLoader, Font } from 'three/addons/loaders/FontLoader.js';
import { scene } from './renderer';

let loadedFont: Font | null = null;
let lyricMesh: THREE.Mesh | null = null;

export function initLyrics(onReady: () => void) {
  const fontLoader = new FontLoader();
  fontLoader.load('/MPLUS1-Black.typeface.json', (font) => {
    loadedFont = font;
    console.log('[font] loaded');
    onReady();
  });
}

export function setLyric(text: string) {
  if (!loadedFont) return;

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

  const width = bb.max.x - bb.min.x;
  if (width > 4) lyricMesh.scale.setScalar(4 / width);

  scene.add(lyricMesh);
}
