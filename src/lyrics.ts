import * as THREE from 'three';
import { TextGeometry } from 'three/addons/geometries/TextGeometry.js';
import { FontLoader, Font } from 'three/addons/loaders/FontLoader.js';
import { activateWordParticles, scatterParticlesInBox, COUNT } from './particles';
import { IWord, IPhrase, IChar } from 'textalive-app-api';
import { scene, glassInnerUniforms } from './renderer';
import lyricGlassVert from './shaders/lyric-glass.vert?raw';
import lyricGlassFrag from './shaders/lyric-glass.frag?raw';

let loadedFont: Font | null = null;

export function initLyrics(onReady: () => void) {
  const loader = new FontLoader();
  loader.load(import.meta.env.BASE_URL + 'MPLUS1-Black.typeface.json', (font) => {
    loadedFont = font;
    onReady();
  });
}

export function getFont(): Font | null { return loadedFont; }

export function sampleSurface(geo: THREE.BufferGeometry, count: number): Float32Array {
  const pos      = geo.attributes.position as THREE.BufferAttribute;
  const index    = geo.index;
  const triCount = index ? index.count / 3 : pos.count / 3;
  const out      = new Float32Array(count * 4);

  const v0 = new THREE.Vector3();
  const v1 = new THREE.Vector3();
  const v2 = new THREE.Vector3();

  for (let i = 0; i < count; i++) {
    const tri = Math.floor(Math.random() * triCount);

    const i0 = index ? index.getX(tri * 3 + 0) : tri * 3 + 0;
    const i1 = index ? index.getX(tri * 3 + 1) : tri * 3 + 1;
    const i2 = index ? index.getX(tri * 3 + 2) : tri * 3 + 2;

    v0.set(pos.getX(i0), pos.getY(i0), pos.getZ(i0));
    v1.set(pos.getX(i1), pos.getY(i1), pos.getZ(i1));
    v2.set(pos.getX(i2), pos.getY(i2), pos.getZ(i2));

    let s = Math.random();
    let t = Math.random();
    if (s + t > 1) { s = 1 - s; t = 1 - t; }
    const u = 1 - s - t;

    out[i * 4 + 0] = u * v0.x + s * v1.x + t * v2.x;
    out[i * 4 + 1] = u * v0.y + s * v1.y + t * v2.y;
    out[i * 4 + 2] = u * v0.z + s * v1.z + t * v2.z;
    out[i * 4 + 3] = 0;
  }

  return out;
}

type FadeEntry = { current: number; target: number };
const fadingMeshes = new Map<THREE.Mesh, FadeEntry>();
let animRaf = 0;

function tickFade() {
  let keepGoing = false;
  for (const [mesh, state] of fadingMeshes) {
    const diff = state.target - state.current;
    if (Math.abs(diff) < 0.004) {
      state.current = state.target;
      (mesh.material as THREE.ShaderMaterial).uniforms.uOpacity.value = state.target;
      if (state.target <= 0) {
        scene.remove(mesh);
        fadingMeshes.delete(mesh);
      }
    } else {
      state.current += diff * 0.07;
      (mesh.material as THREE.ShaderMaterial).uniforms.uOpacity.value = state.current;
      keepGoing = true;
    }
  }
  animRaf = keepGoing || fadingMeshes.size > 0 ? requestAnimationFrame(tickFade) : 0;
}

function fadeIn(mesh: THREE.Mesh) {
  if (!mesh.parent) scene.add(mesh);
  const entry = fadingMeshes.get(mesh);
  if (entry) { entry.target = 1; }
  else { fadingMeshes.set(mesh, { current: (mesh.material as THREE.ShaderMaterial).uniforms.uOpacity.value, target: 1 }); }
  if (!animRaf) animRaf = requestAnimationFrame(tickFade);
}

function fadeOut(mesh: THREE.Mesh) {
  if (!mesh.parent) return;
  const entry = fadingMeshes.get(mesh);
  if (entry) { entry.target = 0; }
  else { fadingMeshes.set(mesh, { current: (mesh.material as THREE.ShaderMaterial).uniforms.uOpacity.value, target: 0 }); }
  if (!animRaf) animRaf = requestAnimationFrame(tickFade);
}

export function clearLyricMeshes() {
  cancelAnimationFrame(animRaf);
  animRaf = 0;
  for (const mesh of fadingMeshes.keys()) scene.remove(mesh);
  fadingMeshes.clear();
  if (currentDisplayedWord) {
    for (const [, pd] of phraseData) {
      const wd = pd.words.get(currentDisplayedWord);
      if (wd) {
        for (const [, cd] of wd.chars) {
          if (cd.mesh?.parent) scene.remove(cd.mesh);
        }
        break;
      }
    }
  }
  currentDisplayedWord = null;
}

export function clearCurrentWord() {
  if (!currentDisplayedWord) return;
  for (const [, pd] of phraseData) {
    const wd = pd.words.get(currentDisplayedWord);
    if (wd) {
      for (const [, cd] of wd.chars) {
        if (cd.mesh) fadeOut(cd.mesh);
      }
      break;
    }
  }
  currentDisplayedWord = null;
}

function makeCharMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    vertexShader:   lyricGlassVert,
    fragmentShader: lyricGlassFrag,
    uniforms: {
      uCameraPos:     glassInnerUniforms.uCameraPos,
      uEnvMap:        glassInnerUniforms.uEnvMap,
      uBeatIntensity: glassInnerUniforms.uBeatIntensity,
      uOpacity:       { value: 0.0 },
    },
    transparent: true,
    depthWrite:  false,
    blending:    THREE.AdditiveBlending,
    renderOrder: 2,
  });
}

type CharData = {
  geo:     THREE.BufferGeometry;
  indices: Uint32Array;
  hue:     number;
  mesh:    THREE.Mesh | null;
};

type WordData = {
  chars: Map<IChar, CharData>;
};

type PhraseData = {
  words: Map<IWord, WordData>;
};

const phraseData = new Map<IPhrase, PhraseData>();
let currentDisplayedWord: IWord | null = null;

export function setWord(word: IWord) {
  for (const [, pd] of phraseData) {
    const wd = pd.words.get(word);
    if (wd) {
      if (currentDisplayedWord && currentDisplayedWord !== word) {
        for (const [, prevPd] of phraseData) {
          const prevWd = prevPd.words.get(currentDisplayedWord);
          if (prevWd) {
            for (const [, cd] of prevWd.chars) {
              if (cd.mesh) fadeOut(cd.mesh);
            }
            break;
          }
        }
      }
      currentDisplayedWord = word;

      for (const [, cd] of wd.chars) {
        cd.geo.computeBoundingBox();
        const bb  = cd.geo.boundingBox!;
        const pad = 0.3;
        scatterParticlesInBox(
          bb.min.x - pad, bb.max.x + pad,
          bb.min.y - pad, bb.max.y + pad,
          bb.min.z - pad, bb.max.z + pad,
        );
        const samples = sampleSurface(cd.geo, cd.indices.length);
        activateWordParticles(cd.indices, samples);

        if (cd.mesh) fadeIn(cd.mesh);
      }
      return;
    }
  }
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function setChar(_char: IChar) {}

export function clearPhrase(phrase: IPhrase) {
  const pd = phraseData.get(phrase);
  if (!pd) return;
  for (const [, wd] of pd.words) {
    for (const [, cd] of wd.chars) {
      if (cd.mesh) fadeOut(cd.mesh);
    }
  }
}

let staticGeos:   THREE.BufferGeometry[] = [];
let staticMeshes: THREE.Mesh[]           = [];
let staticGen = 0;

export function clearStaticText() {
  ++staticGen;
  for (const geo  of staticGeos)   geo.dispose();
  for (const mesh of staticMeshes) fadeOut(mesh);
  staticGeos   = [];
  staticMeshes = [];
}

export function displayStaticText(lines: string[]) {
  if (!loadedFont) return;
  clearStaticText();
  const myGen = staticGen;

  const FONT_SIZE   = 1.4;
  const DEPTH       = 0.28;
  const LINE_HEIGHT = 2.6;

  const nonEmpty = lines.filter(l => l.trim().length > 0);
  if (nonEmpty.length === 0) return;

  const pool = new Uint32Array(COUNT);
  for (let i = 0; i < COUNT; i++) pool[i] = i;
  for (let i = COUNT - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = pool[i]; pool[i] = pool[j]; pool[j] = tmp;
  }

  const perLine = Math.max(1, Math.floor(COUNT / nonEmpty.length));
  let poolOffset = 0;

  const batches: { geo: THREE.BufferGeometry; indices: Uint32Array; delay: number; mesh: THREE.Mesh }[] = [];

  const totalHeight = lines.length * LINE_HEIGHT;
  let yPos  = (totalHeight - LINE_HEIGHT) / 2;
  let delay = 0;

  for (const line of lines) {
    if (!line.trim()) {
      yPos  -= LINE_HEIGHT;
      delay += 80;
      continue;
    }

    const geo = new TextGeometry(line, {
      font: loadedFont!,
      size: FONT_SIZE,
      depth: DEPTH,
      curveSegments: 4,
    });
    geo.computeBoundingBox();
    const bb = geo.boundingBox!;
    const cx = (bb.min.x + bb.max.x) / 2;
    const cy = (bb.min.y + bb.max.y) / 2;
    geo.translate(-cx, -cy + yPos, 0);

    const indices = new Uint32Array(perLine);
    for (let k = 0; k < perLine; k++) indices[k] = pool[(poolOffset + k) % COUNT];
    poolOffset = (poolOffset + perLine) % COUNT;

    const mesh = new THREE.Mesh(geo, makeCharMaterial());
    mesh.renderOrder = 2;
    staticGeos.push(geo);
    staticMeshes.push(mesh);
    batches.push({ geo, indices, delay, mesh });

    yPos  -= LINE_HEIGHT;
    delay += 380;
  }

  for (const { geo, indices, delay: d, mesh } of batches) {
    setTimeout(() => {
      if (staticGen !== myGen) return;
      const samples = sampleSurface(geo, indices.length);
      activateWordParticles(indices, samples);
      fadeIn(mesh);
    }, d);
  }
}

export function buildLayout(phrases: IPhrase[]) {
  if (!loadedFont) return;

  clearLyricMeshes();
  phraseData.forEach(pd => pd.words.forEach(wd => wd.chars.forEach(cd => {
    if (cd.mesh) {
      scene.remove(cd.mesh);
      (cd.mesh.material as THREE.ShaderMaterial).dispose();
    }
    cd.geo.dispose();
  })));
  phraseData.clear();

  const pool = new Uint32Array(COUNT);
  for (let i = 0; i < COUNT; i++) pool[i] = i;
  for (let i = COUNT - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = pool[i]; pool[i] = pool[j]; pool[j] = tmp;
  }

  const LINE_HEIGHT  = 4.0;
  const SPACING      = 0.5;
  const CHAR_SPACING = 0.35;
  const MAX_WIDTH    = 14.0;

  let poolOffset = 0;

  for (const phrase of phrases) {
    const words       = phrase.children;
    const wordMap     = new Map<IWord, WordData>();
    const phraseChars = words.reduce((s, w) => s + Math.max(w.children.length, 1), 0);
    const perChar     = Math.max(1, Math.floor(COUNT / Math.max(phraseChars, 1)));

    const wordWidths: number[] = [];
    for (const word of words) {
      const geo = new TextGeometry(word.text, { font: loadedFont!, size: 2.0, depth: 0.4, curveSegments: 4 });
      geo.computeBoundingBox();
      const baseWidth = geo.boundingBox!.max.x - geo.boundingBox!.min.x;
      const gaps      = Math.max(0, word.children.length - 1) * CHAR_SPACING;
      wordWidths.push(baseWidth + gaps);
      geo.dispose();
    }

    const lines: number[][] = [[]];
    let lineWidth = 0;
    for (let j = 0; j < words.length; j++) {
      if (lineWidth + wordWidths[j] > MAX_WIDTH && lines[lines.length - 1].length > 0) {
        lines.push([]);
        lineWidth = 0;
      }
      lines[lines.length - 1].push(j);
      lineWidth += wordWidths[j] + SPACING;
    }

    const totalHeight = lines.length * LINE_HEIGHT;
    let yPos = (totalHeight - LINE_HEIGHT) / 2;

    for (const line of lines) {
      const lineW  = line.reduce((sum, j) => sum + wordWidths[j] + SPACING, -SPACING);
      let cursor   = -lineW / 2;

      for (const j of line) {
        const word    = words[j];
        const chars   = word.children;
        const charMap = new Map<IChar, CharData>();
        let charCursor = cursor;

        for (let ci = 0; ci < chars.length; ci++) {
          const char = chars[ci];
          const geo  = new TextGeometry(char.text, { font: loadedFont!, size: 2.0, depth: 0.4, curveSegments: 4 });
          geo.computeBoundingBox();
          const charWidth = geo.boundingBox!.max.x - geo.boundingBox!.min.x;
          const center    = new THREE.Vector3();
          geo.boundingBox!.getCenter(center);
          geo.translate(-center.x + charCursor + charWidth / 2, -center.y + yPos, -center.z);

          const indices = new Uint32Array(perChar);
          for (let k = 0; k < perChar; k++) {
            indices[k] = pool[(poolOffset + k) % COUNT];
          }
          poolOffset = (poolOffset + perChar) % COUNT;

          const hue  = ci / Math.max(chars.length - 1, 1);
          const mesh = new THREE.Mesh(geo, makeCharMaterial());
          mesh.renderOrder = 2;

          charMap.set(char, { geo, indices, hue, mesh });
          charCursor += charWidth + CHAR_SPACING;
        }

        wordMap.set(word, { chars: charMap });
        cursor += wordWidths[j] + SPACING;
      }
      yPos -= LINE_HEIGHT;
    }

    phraseData.set(phrase, { words: wordMap });
  }
}
