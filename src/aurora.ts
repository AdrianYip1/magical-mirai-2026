import * as THREE from 'three';
import auroraVert from './shaders/aurora.vert?raw';
import auroraFrag from './shaders/aurora.frag?raw';

const isMobile = /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent) || window.innerWidth < 768;

export const auroraUniforms = {
  uTime: { value: 0.0 },
};

export const auroraMesh = new THREE.Mesh(
  new THREE.SphereGeometry(90, 32, 16),
  new THREE.ShaderMaterial({
    defines: {
      FBM_OCTAVES:  2,
      AURORA_BANDS: isMobile ? 2 : 3,
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
