import * as THREE from 'three';
import { TextGeometry } from 'three/addons/geometries/TextGeometry.js';
import { FontLoader, Font } from 'three/addons/loaders/FontLoader.js';
import { setTargets, setLyricStrength } from './particles';

const SAMPLE_COUNT = 256 * 256;

let loadedFont: Font | null = null;

export function initLyrics(onReady: () => void) {
  const loader = new FontLoader();
  loader.load('/MPLUS1-Black.typeface.json', (font) => {
    loadedFont = font;
    console.log('[font] loaded');
    onReady();
  });
}

// Randomly sample SAMPLE_COUNT points on the surface of a BufferGeometry.
// Returns Float32Array(SAMPLE_COUNT * 4) packed as (x, y, z, 0).
function sampleSurface(geo: THREE.BufferGeometry): Float32Array {
  const pos   = geo.attributes.position as THREE.BufferAttribute;
  const index = geo.index;
  const triCount = index ? index.count / 3 : pos.count / 3;
  const out   = new Float32Array(SAMPLE_COUNT * 4);

  const v0 = new THREE.Vector3();
  const v1 = new THREE.Vector3();
  const v2 = new THREE.Vector3();

  // assign SAMPLE_COUNT number of triangles on the mesh to a particle
  for (let i = 0; i < SAMPLE_COUNT; i++) {
    const tri = Math.floor(Math.random() * triCount);

    // Get vertex indices for this triangle
    const i0 = index ? index.getX(tri * 3 + 0) : tri * 3 + 0;
    const i1 = index ? index.getX(tri * 3 + 1) : tri * 3 + 1;
    const i2 = index ? index.getX(tri * 3 + 2) : tri * 3 + 2;

    v0.set(pos.getX(i0), pos.getY(i0), pos.getZ(i0));
    v1.set(pos.getX(i1), pos.getY(i1), pos.getZ(i1));
    v2.set(pos.getX(i2), pos.getY(i2), pos.getZ(i2));

    // Random barycentric point to get pos inside triangle
    let s = Math.random();
    let t = Math.random();
    if (s + t > 1) { s = 1 - s; t = 1 - t; }
    const u = 1 - s - t; // so s + u + t = 1

    out[i * 4 + 0] = u * v0.x + s * v1.x + t * v2.x;
    out[i * 4 + 1] = u * v0.y + s * v1.y + t * v2.y;
    out[i * 4 + 2] = u * v0.z + s * v1.z + t * v2.z;
    out[i * 4 + 3] = 0;

    // Out array is SAMPLE_COUNT * 4 since each position is (x, y, z, 0)
  }

  return out;
}

export function setLyric(text: string) {
  if (!loadedFont || !text) return;

  const geo = new TextGeometry(text, {
    font: loadedFont,
    size: 2.0,
    depth: 0.4,
    curveSegments: 4, 
  });

  // Centre the geometry at world origin
  geo.computeBoundingBox();
  const center = new THREE.Vector3();
  geo.boundingBox!.getCenter(center);
  geo.translate(-center.x, -center.y, -center.z);

  const targets = sampleSurface(geo);
  setTargets(targets);
  setLyricStrength(1.0);

  geo.dispose();
}
