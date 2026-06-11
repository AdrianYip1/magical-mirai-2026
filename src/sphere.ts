import * as THREE from 'three';
import { ConvexGeometry } from 'three/examples/jsm/Addons.js';
import cubeVert from './shaders/cube.vert.glsl?raw';
import glassFrag from './shaders/glass.frag?raw';

export const SPHERE_RADIUS = 6;
export const MIN_VERTS = 50;
export const MAX_VERTS = 120;
export const VERT_STEP = 5;

const GOLDEN_RATIO = (1 + Math.sqrt(5)) / 2;
const GOLDEN_ANGLE = 2 * Math.PI * (2 - GOLDEN_RATIO);

export function fibSphere(vertices: number): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry();
  const positions = new Float32Array(vertices * 3);
  for (let k = 0; k < vertices; k++) {
    const phi = k * GOLDEN_ANGLE;
    const theta = Math.acos(1 - (2 * k / (vertices - 1)));
    positions[k * 3]     = Math.sin(theta) * Math.cos(phi);
    positions[k * 3 + 1] = Math.sin(theta) * Math.sin(phi);
    positions[k * 3 + 2] = Math.cos(theta);
  }
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  return geometry;
}

export function buildConvexGeometry(vertexCount: number): THREE.BufferGeometry {
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
  const flat = new ConvexGeometry(points).toNonIndexed();
  flat.computeVertexNormals();
  return flat;
}

export function drawSphere(
  scene: THREE.Scene,
  vertexCount: number,
  uniforms: { [key: string]: THREE.IUniform<any> },
  layer: number
): THREE.Mesh {
  const mesh = new THREE.Mesh(
    buildConvexGeometry(vertexCount),
    new THREE.ShaderMaterial({
      vertexShader: cubeVert,
      fragmentShader: glassFrag,
      uniforms,
      transparent: true,
      side: THREE.DoubleSide,
    })
  );
  mesh.layers.set(layer);
  scene.add(mesh);
  return mesh;
}
