import pkg from 'opentype.js';
import { readFileSync, writeFileSync } from 'fs';

const buffer = readFileSync('public/MPLUS1-Black.ttf');
const font = pkg.parse(buffer.buffer);
const scale = 1000 / font.unitsPerEm;

const glyphs = {};
for (let i = 0; i < font.glyphs.length; i++) {
  const glyph = font.glyphs.get(i);
  if (!glyph.unicode) continue;

  const path = glyph.getPath(0, 0, font.unitsPerEm);
  const commands = path.commands.map(cmd => {
    switch (cmd.type) {
      case 'M': return { type: 'M', x: Math.round(cmd.x * scale), y: Math.round(-cmd.y * scale) };
      case 'L': return { type: 'L', x: Math.round(cmd.x * scale), y: Math.round(-cmd.y * scale) };
      case 'C': return {
        type: 'C',
        x1: Math.round(cmd.x1 * scale), y1: Math.round(-cmd.y1 * scale),
        x2: Math.round(cmd.x2 * scale), y2: Math.round(-cmd.y2 * scale),
        x:  Math.round(cmd.x  * scale), y:  Math.round(-cmd.y  * scale),
      };
      case 'Q': return {
        type: 'Q',
        x1: Math.round(cmd.x1 * scale), y1: Math.round(-cmd.y1 * scale),
        x:  Math.round(cmd.x  * scale), y:  Math.round(-cmd.y  * scale),
      };
      case 'Z': return { type: 'Z' };
    }
  }).filter(Boolean);

  glyphs[String.fromCodePoint(glyph.unicode)] = {
    ha: Math.round(glyph.advanceWidth * scale),
    x_min: Math.round((glyph.xMin ?? 0) * scale),
    x_max: Math.round((glyph.xMax ?? 0) * scale),
    // Three.js Font parser uses lowercase: m, l, q, b (cubic), z
    o: commands.map(c => {
      if (c.type === 'M') return `m ${c.x} ${c.y}`;
      if (c.type === 'L') return `l ${c.x} ${c.y}`;
      if (c.type === 'C') return `b ${c.x1} ${c.y1} ${c.x2} ${c.y2} ${c.x} ${c.y}`;
      if (c.type === 'Q') return `q ${c.x1} ${c.y1} ${c.x} ${c.y}`;
      if (c.type === 'Z') return 'z';
    }).join(' '),
  };
}

const typeface = {
  glyphs,
  familyName: font.names.fontFamily?.en ?? 'NotoSansJP',
  ascender:  Math.round(font.ascender  * scale),
  descender: Math.round(font.descender * scale),
  underlinePosition:  font.tables.post?.underlinePosition  ?? -100,
  underlineThickness: font.tables.post?.underlineThickness ?? 50,
  boundingBox: {
    yMin: Math.round((font.tables.head?.yMin ?? 0) * scale),
    xMin: Math.round((font.tables.head?.xMin ?? 0) * scale),
    yMax: Math.round((font.tables.head?.yMax ?? 0) * scale),
    xMax: Math.round((font.tables.head?.xMax ?? 0) * scale),
  },
  resolution: 1000,
  original_font_information: font.names,
};

const outPath = 'public/MPLUS1-Black.typeface.json';
writeFileSync(outPath, JSON.stringify(typeface));
console.log(`Written to ${outPath}`);
