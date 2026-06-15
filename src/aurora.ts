import * as THREE from 'three';
import auroraVert from './shaders/aurora.vert?raw';
import auroraFrag from './shaders/aurora.frag?raw';
import { IS_MOBILE } from './perf';

export const auroraUniforms = {
  uTime:          { value: 0.0 },
  uVocalAmp:      { value: 0.0 },
  uChorusFactor:  { value: 0.0 },
  uChordTint:     { value: new THREE.Vector3(0, 0, 0) },
  uChordStrength: { value: 0.0 },
  uMenuReflect:   { value: 0.0 },
  uMenuTex:       { value: null as THREE.Texture | null },
  uResolution:    { value: new THREE.Vector2(1, 1) },
};

export const auroraMesh = new THREE.Mesh(
  new THREE.SphereGeometry(90, 32, 16),
  new THREE.ShaderMaterial({
    defines: {
      FBM_OCTAVES:  IS_MOBILE ? 2 : 3,
      AURORA_BANDS: IS_MOBILE ? 2 : 3,
      LOW_QUALITY:  IS_MOBILE ? 1 : 0,
    },
    vertexShader:   auroraVert,
    fragmentShader: auroraFrag,
    uniforms:       auroraUniforms,
    side:           THREE.BackSide,
    depthWrite:     false,
  }),
);
auroraMesh.renderOrder = -1;

const chordTintTarget  = new THREE.Vector3(0, 0, 0);
let   chorusTarget     = 0;
let   menuReflectTarget = 0;

// Advances the aurora animation and eases its values toward their targets.
export function tickAurora(elapsed: number) {
  auroraUniforms.uTime.value = elapsed;
  auroraUniforms.uChorusFactor.value +=
    (chorusTarget - auroraUniforms.uChorusFactor.value) * 0.03;
  auroraUniforms.uChordTint.value.lerp(chordTintTarget, 0.008);
  auroraUniforms.uChordStrength.value *= 0.997;
  auroraUniforms.uMenuReflect.value +=
    (menuReflectTarget - auroraUniforms.uMenuReflect.value) * 0.06;
}

// Fades the water style reflection in or out for the menu.
export function setAuroraMenuReflect(on: boolean) {
  menuReflectTarget = on ? 1 : 0;
}

// Sets the texture the aurora reflects in the menu.
export function setAuroraMenuTex(tex: THREE.Texture | null) {
  auroraUniforms.uMenuTex.value = tex;
}

// Tells the shader the current screen size in pixels.
export function setAuroraResolution(w: number, h: number) {
  auroraUniforms.uResolution.value.set(w, h);
}

// Feeds the singer loudness into the aurora so it reacts to vocals.
export function setAuroraVocalAmp(v: number) {
  auroraUniforms.uVocalAmp.value = v;
}

// Sets how strongly the aurora shifts during the chorus.
export function setAuroraChorusTarget(v: number) {
  chorusTarget = v;
}

// Tints the aurora toward a colour for the current chord and gives it a push.
export function setChordTarget(r: number, g: number, b: number) {
  chordTintTarget.set(r, g, b);
  auroraUniforms.uChordStrength.value = Math.min(
    0.35,
    auroraUniforms.uChordStrength.value + 0.20,
  );
}
