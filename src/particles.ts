import * as THREE from 'three';
import simVert    from './shaders/particles/sim.vert?raw';
import simFrag    from './shaders/particles/sim.frag?raw';
import renderVert from './shaders/particles/render.vert?raw';
import renderFrag from './shaders/particles/render.frag?raw';

const WIDTH = 256;
const COUNT = WIDTH * WIDTH; // 65,536 particles

// make starting data (each particle gets xyz and a starting age)
function makeInitialState(): THREE.DataTexture {
  const data = new Float32Array(COUNT * 4);
  for (let i = 0; i < COUNT; i++) {
    data[i * 4 + 0] = (Math.random() - 0.5) * 20;
    data[i * 4 + 1] = (Math.random() - 0.5) * 16;
    data[i * 4 + 2] = (Math.random() - 0.5) *  8;
    data[i * 4 + 3] = Math.random(); // stagger ages so they don't all die at once
  }
  const tex = new THREE.DataTexture(data, WIDTH, WIDTH, THREE.RGBAFormat, THREE.FloatType);
  tex.needsUpdate = true;
  return tex;
}


// make 2 empty render targets with the same size as the state texture
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

// fullscreen quad
const simMaterial = new THREE.RawShaderMaterial({
  vertexShader:   simVert,
  fragmentShader: simFrag,
  uniforms: {
    uState: { value: prevTex },
    uTime:  { value: 0 },
    uDelta: { value: 0 },
    uBeat:  { value: 0 },
  },
});


// every frame -> point the sim shader to prevTex then render the quad into writeRT, swap render targets
// similar to double buffering
const simScene  = new THREE.Scene();
simScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), simMaterial));
const simCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

// each particle has a UV coord
const uvs = new Float32Array(COUNT * 2);
for (let row = 0; row < WIDTH; row++) {
  for (let col = 0; col < WIDTH; col++) {
    const i = row * WIDTH + col;
    uvs[i * 2 + 0] = (col + 0.5) / WIDTH;
    uvs[i * 2 + 1] = (row + 0.5) / WIDTH;
  }
}

// Dummy position attribute — Three.js uses it to determine vertex count.
// Actual positions are read from the state texture in the vertex shader.
const dummyPos = new Float32Array(COUNT * 3); // all zeros
const geometry = new THREE.BufferGeometry();
geometry.setAttribute('position', new THREE.BufferAttribute(dummyPos, 3));
geometry.setAttribute('aUv',      new THREE.BufferAttribute(uvs, 2));

const renderMaterial = new THREE.ShaderMaterial({
  vertexShader: renderVert,
  fragmentShader: renderFrag,
  transparent: true,
  depthWrite: false,
  blending: THREE.AdditiveBlending,
  uniforms: {
    uState: { value: prevTex },
    uBeat:  { value: 0 },
  },
});

export const points = new THREE.Points(geometry, renderMaterial);


// sets uniform values for time, beat, delta
export function update(renderer: THREE.WebGLRenderer, elapsed: number, delta: number, beat = 0) {
  simMaterial.uniforms.uState.value = prevTex;
  simMaterial.uniforms.uTime.value  = elapsed;
  simMaterial.uniforms.uDelta.value = Math.min(delta, 0.05);
  simMaterial.uniforms.uBeat.value  = beat;

  renderer.setRenderTarget(writeRT);
  renderer.render(simScene, simCamera);
  renderer.setRenderTarget(null);

  // swap render targets
  const tmp = readRT;
  readRT  = writeRT;
  writeRT = tmp;
  prevTex = readRT.texture;

  renderMaterial.uniforms.uState.value = prevTex;
  renderMaterial.uniforms.uBeat.value  = beat;
}
