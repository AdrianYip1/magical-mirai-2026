import * as THREE from 'three';
import simVert    from './shaders/particles/sim.vert?raw';
import simFrag    from './shaders/particles/sim.frag?raw';
import renderVert from './shaders/particles/render.vert?raw';
import renderFrag from './shaders/particles/render.frag?raw';


const WIDTH = 256;
const COUNT = WIDTH * WIDTH;

function makeInitialState(): THREE.DataTexture {
  const data = new Float32Array(COUNT * 4);
  for (let i = 0; i < COUNT; i++) {
    data[i * 4 + 0] = (Math.random() - 0.5) * 20;
    data[i * 4 + 1] = (Math.random() - 0.5) * 16;
    data[i * 4 + 2] = (Math.random() - 0.5) *  8;
    data[i * 4 + 3] = Math.random();
  }
  const tex = new THREE.DataTexture(data, WIDTH, WIDTH, THREE.RGBAFormat, THREE.FloatType);
  tex.needsUpdate = true;
  return tex;
}

function makeRT(): THREE.WebGLRenderTarget {
  return new THREE.WebGLRenderTarget(WIDTH, WIDTH, {
    minFilter: THREE.NearestFilter,
    magFilter: THREE.NearestFilter,
    format: THREE.RGBAFormat,
    type: THREE.FloatType,
    depthBuffer: false,
    stencilBuffer: false,
  });
}

let readRT  = makeRT();
let writeRT = makeRT();
let prevTex: THREE.Texture = makeInitialState();

const targetData     = new Float32Array(COUNT * 4);
const targetTex      = new THREE.DataTexture(targetData, WIDTH, WIDTH, THREE.RGBAFormat, THREE.FloatType);
targetTex.needsUpdate = true;

const assignmentData = new Float32Array(COUNT * 4);
const assignmentTex  = new THREE.DataTexture(assignmentData, WIDTH, WIDTH, THREE.RGBAFormat, THREE.FloatType);
assignmentTex.needsUpdate = true;

const colorData = new Float32Array(COUNT * 4);
const colorTex  = new THREE.DataTexture(colorData, WIDTH, WIDTH, THREE.RGBAFormat, THREE.FloatType);
colorTex.needsUpdate = true;

let elapsedTime = 0;

const simMaterial = new THREE.RawShaderMaterial({
  vertexShader:   simVert,
  fragmentShader: simFrag,
  uniforms: {
    uState: { value: prevTex },
    uTime: { value: 0 },
    uDelta: { value: 0 },
    uBeat: { value: 0 },
    uTargetTex: { value: targetTex },
    uAssignmentTex: { value: assignmentTex },
    uFadeRate: { value: 0.25 },
  },
});

export function activateWordParticles(indices: Uint32Array, samples: Float32Array, colors?: Float32Array) {
  for (let i = 0; i < indices.length; i++) {
    const p = indices[i];
    assignmentData[p * 4 + 0] = 1.0;
    assignmentData[p * 4 + 1] = elapsedTime;
    targetData[p * 4 + 0] = samples[i * 4 + 0];
    targetData[p * 4 + 1] = samples[i * 4 + 1];
    targetData[p * 4 + 2] = samples[i * 4 + 2];
    targetData[p * 4 + 3] = 0;
    if (colors) {
      colorData[p * 4 + 0] = colors[i * 4 + 0];
      colorData[p * 4 + 1] = colors[i * 4 + 1];
      colorData[p * 4 + 2] = colors[i * 4 + 2];
      colorData[p * 4 + 3] = 1.0;
    } else {
      colorData[p * 4 + 3] = 0.0;
    }
  }
  assignmentTex.needsUpdate = true;
  targetTex.needsUpdate     = true;
  colorTex.needsUpdate      = true;
}

export function clearParticles(indices: Uint32Array) {
  for (let i = 0; i < indices.length; i++) {
    const p = indices[i];
    assignmentData[p * 4 + 0] = 0.0;
    assignmentData[p * 4 + 1] = 0.0;
  }
  assignmentTex.needsUpdate = true;
}

/** Deactivate every particle -> returns them all to the ambient curl flow. */
export function clearAllParticles() {
  assignmentData.fill(0);
  assignmentTex.needsUpdate = true;
  colorData.fill(0);
  colorTex.needsUpdate = true;
}

export function scatterParticlesInBox(
  minX: number, maxX: number,
  minY: number, maxY: number,
  minZ: number, maxZ: number,
) {
  let changed = false;
  for (let p = 0; p < COUNT; p++) {
    if (assignmentData[p * 4] < 0.5) continue;
    const tx = targetData[p * 4 + 0];
    const ty = targetData[p * 4 + 1];
    const tz = targetData[p * 4 + 2];
    if (tx >= minX && tx <= maxX && ty >= minY && ty <= maxY && tz >= minZ && tz <= maxZ) {
      assignmentData[p * 4 + 1] = -1e6; // age_s becomes huge → fade = 0
      changed = true;
    }
  }
  if (changed) assignmentTex.needsUpdate = true;
}


const simScene  = new THREE.Scene();
simScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), simMaterial));
const simCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

const uvs = new Float32Array(COUNT * 2);
for (let row = 0; row < WIDTH; row++) {
  for (let col = 0; col < WIDTH; col++) {
    const i = row * WIDTH + col;
    uvs[i * 2 + 0] = (col + 0.5) / WIDTH;
    uvs[i * 2 + 1] = (row + 0.5) / WIDTH;
  }
}

const dummyPos = new Float32Array(COUNT * 3);
const geometry = new THREE.BufferGeometry();
geometry.setAttribute('position', new THREE.BufferAttribute(dummyPos, 3));
geometry.setAttribute('aUv', new THREE.BufferAttribute(uvs, 2));

const renderMaterial = new THREE.ShaderMaterial({
  vertexShader: renderVert,
  fragmentShader: renderFrag,
  transparent: true,
  depthWrite: false,
  blending: THREE.AdditiveBlending,
  uniforms: {
    uState: { value: prevTex },
    uBeat: { value: 0 },
    uEnvMap: { value: null },
    uAssignmentTex: { value: assignmentTex },
    uColorTex: { value: colorTex },
  },
});

export const points = new THREE.Points(geometry, renderMaterial);

export function setFadeRate(rate: number) {
  simMaterial.uniforms.uFadeRate.value = rate;
}

export function update(renderer: THREE.WebGLRenderer, elapsed: number, delta: number, beat = 0, envMap?: THREE.Texture) {
  elapsedTime = elapsed;
  simMaterial.uniforms.uState.value = prevTex;
  simMaterial.uniforms.uTime.value  = elapsed;
  simMaterial.uniforms.uDelta.value = Math.min(delta, 0.05);
  simMaterial.uniforms.uBeat.value  = beat;

  renderer.setRenderTarget(writeRT);
  renderer.render(simScene, simCamera);
  renderer.setRenderTarget(null);

  const tmp = readRT;
  readRT  = writeRT;
  writeRT = tmp;
  prevTex = readRT.texture;

  if (envMap) renderMaterial.uniforms.uEnvMap.value = envMap;
  renderMaterial.uniforms.uState.value = prevTex;
  renderMaterial.uniforms.uBeat.value  = beat;
}
