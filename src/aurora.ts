import * as THREE from 'three';
import auroraVert from './shaders/aurora.vert?raw';
import auroraFrag from './shaders/aurora.frag?raw';

export const auroraUniforms = {
  uTime: { value: 0.0 },
};

export const auroraMesh = new THREE.Mesh(
  new THREE.SphereGeometry(90, 32, 16),
  new THREE.ShaderMaterial({
    defines: {
      FBM_OCTAVES:  3,
      AURORA_BANDS: 3,
    },
    vertexShader:   auroraVert,
    fragmentShader: auroraFrag,
    uniforms:       auroraUniforms,
    side:           THREE.BackSide,
    depthWrite:     false,
  }),
);
// Render before everything else so it sits behind all foreground elements.
auroraMesh.renderOrder = -1;

export function tickAurora(elapsed: number) {
  auroraUniforms.uTime.value = elapsed;
}
