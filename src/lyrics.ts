import * as THREE from 'three';
import { TextGeometry } from 'three/addons/geometries/TextGeometry.js';
import { FontLoader, Font } from 'three/addons/loaders/FontLoader.js';
import { activateWordParticles, clearParticles, scatterParticlesInBox } from './particles';
import { IWord, IPhrase, IChar } from 'textalive-app-api';

const COUNT = 256 * 256;

let loadedFont: Font | null = null;

export function initLyrics(onReady: () => void) {
  const loader = new FontLoader();
  loader.load(import.meta.env.BASE_URL + 'MPLUS1-Black.typeface.json', (font) => {
    loadedFont = font;
    onReady();
  });
}

function sampleSurface(geo: THREE.BufferGeometry, count: number): Float32Array {
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

type CharData = {
  geo:     THREE.BufferGeometry;
  indices: Uint32Array;
  hue:     number;
};

type WordData = {
  chars: Map<IChar, CharData>;
};

type PhraseData = {
  words: Map<IWord, WordData>;
};

const phraseData = new Map<IPhrase, PhraseData>();

export function setWord(word: IWord) {
  for (const [, pd] of phraseData) {
    const wd = pd.words.get(word);
    if (wd) {
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
      }
      return;
    }
  }
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function setChar(_char: IChar) {
  // reserved for future per-syllable effects
}

export function clearPhrase(phrase: IPhrase) {
  const pd = phraseData.get(phrase);
  if (!pd) return;
  for (const [, wd] of pd.words) {
    for (const [, cd] of wd.chars) {
      clearParticles(cd.indices);
    }
  }
}

export function buildLayout(phrases: IPhrase[]) {
  if (!loadedFont) return;

  phraseData.forEach(pd => pd.words.forEach(wd => wd.chars.forEach(cd => cd.geo.dispose())));
  phraseData.clear();

  const pool = new Uint32Array(COUNT);
  for (let i = 0; i < COUNT; i++) pool[i] = i;
  for (let i = COUNT - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = pool[i]; pool[i] = pool[j]; pool[j] = tmp;
  }

  const LINE_HEIGHT = 4.0;
  const SPACING     = 0.5;
  const MAX_WIDTH   = 14.0;

  let poolOffset = 0;

  for (const phrase of phrases) {
    const words       = phrase.children;
    const wordMap     = new Map<IWord, WordData>();
    const phraseChars = words.reduce((s, w) => s + Math.max(w.children.length, 1), 0);
    const perChar     = Math.max(1, Math.floor(COUNT / Math.max(phraseChars, 1)));

    // pass 1: measure word widths for line wrapping
    const wordWidths: number[] = [];
    for (const word of words) {
      const geo = new TextGeometry(word.text, { font: loadedFont!, size: 2.0, depth: 0.4, curveSegments: 4 });
      geo.computeBoundingBox();
      wordWidths.push(geo.boundingBox!.max.x - geo.boundingBox!.min.x);
      geo.dispose();
    }

    // pass 2: line wrap
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

          const hue = ci / Math.max(chars.length - 1, 1);
          charMap.set(char, { geo, indices, hue });
          charCursor += charWidth;
        }

        wordMap.set(word, { chars: charMap });
        cursor += wordWidths[j] + SPACING;
      }
      yPos -= LINE_HEIGHT;
    }

    phraseData.set(phrase, { words: wordMap });
  }
}
