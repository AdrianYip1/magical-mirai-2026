float fresnel(vec3 normal, vec3 viewDir) {
  return pow(1.0 - dot(normal, viewDir), 3.0);
}

uniform sampler2D uLyricTexture;

varying vec2 vUv;

void main() {
  vec4 lyric = texture2D(uLyricTexture, vUv);

  // Fresnel — placeholder normals until we have real geometry normals
  vec3 normal = vec3(0.0, 0.0, 1.0);
  vec3 viewDir = vec3(0.0, 0.0, 1.0);
  float rim = fresnel(normal, viewDir);

  vec3 glassColor = mix(lyric.rgb, vec3(0.8, 0.95, 1.0), rim);
  float alpha = lyric.a * (0.7 + rim * 0.3);

  gl_FragColor = vec4(glassColor, alpha);
}
