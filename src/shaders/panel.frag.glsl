uniform float uTime;
uniform float uBeatIntensity;
uniform vec3 color;
uniform sampler2D uLyricTexture;
uniform float uHasLyric;

varying vec2 vUv;

void main() {
  // Scanlines — horizontal bands drifting upward over time
  float scan = sin((vUv.y - uTime * 0.1) * 80.0) * 0.5 + 0.5;

  // Edge glow — brighten near panel borders
  float edge = smoothstep(0.45, 0.5, max(abs(vUv.x - 0.5), abs(vUv.y - 0.5)));

  // Alpha pulse
  float alpha = 0.6 + 0.2 * sin(uTime * 2.0);
  alpha += uBeatIntensity * 0.4;

  vec3 col = color;
  col += edge * vec3(0.5, 0.8, 1.0);
  col += scan * 0.08;

  // Blend in lyric texture when one is loaded
  vec4 lyric = texture2D(uLyricTexture, vUv);
  col = mix(col, lyric.rgb, lyric.a * uHasLyric);

  gl_FragColor = vec4(col, alpha);
}
