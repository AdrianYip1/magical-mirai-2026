// FBM_OCTAVES and AURORA_BANDS injected via ShaderMaterial.defines.

uniform float uTime;
varying vec3 vWorldPos;

float hash2(vec2 p) {
    p = fract(p * vec2(127.1, 311.7));
    p += dot(p, p + 17.5);
    return fract(p.x * p.y);
}

float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(
        mix(hash2(i),                       hash2(i + vec2(1.0, 0.0)), f.x),
        mix(hash2(i + vec2(0.0, 1.0)), hash2(i + vec2(1.0, 1.0)), f.x),
        f.y
    );
}

float fbm(vec2 p) {
    float v = 0.0;
    float a = 0.5;
    for (int i = 0; i < FBM_OCTAVES; i++) {
        v += a * noise(p);
        p  = p * 2.0 + vec2(31.4, 17.2);
        a *= 0.5;
    }
    return v;
}

vec3 auroraBand(vec3 dir, float t, float bandY, float seed) {
    vec2 hPos = dir.xz;

    float wave  = fbm(hPos * 0.7 + vec2(t * 0.03 + seed, seed * 1.3)) * 0.10 - 0.05;
    float above = dir.y - (bandY + wave);

    float curtain = exp(-max(0.0, above) * 2.8)
                  * smoothstep(-0.05, 0.018, above);
    if (curtain < 0.002) return vec3(0.0);

    float coarse = noise(hPos * 5.0 + vec2(t * 0.07 + seed * 2.7, seed));
    coarse = pow(max(0.0, coarse - 0.10) / 0.90, 1.3);

    float fine = noise(hPos * 16.0 + vec2(t * 0.14 + seed, seed * 0.7));
    fine = max(0.0, fine - 0.35) / 0.65;

    float rays = coarse * 0.78 + fine * 0.22;

    float flicker = 0.80 + 0.20 * noise(vec2(uTime * 0.9 + seed * 6.3,
                                              dir.x * 2.0 + seed));

    float h   = clamp(above / 0.55, 0.0, 1.0);
    vec3  col = mix(vec3(0.55, 0.05, 0.40),   // magenta
                    vec3(0.00, 0.88, 0.72),    // Miku teal
                    smoothstep(0.0, 0.35, h));
    col       = mix(col,
                    vec3(0.12, 0.44, 0.92),    // ice blue
                    smoothstep(0.35, 1.0, h));

    return curtain * rays * flicker * col;
}

void main() {
    vec3  dir = normalize(vWorldPos);
    float yy  = dir.y * 0.5 + 0.5;

    vec3 col = mix(vec3(0.006, 0.009, 0.022),
                   vec3(0.000, 0.001, 0.006), yy);

    float t = uTime * 0.04;

    col += auroraBand(dir, t, -0.50, 0.0);

#if AURORA_BANDS >= 2
    col += auroraBand(dir, t, -0.05, 1.7) * 0.85;
#endif

#if AURORA_BANDS >= 3
    col += auroraBand(dir, t,  0.42, 3.4) * 0.58;
#endif

    gl_FragColor = vec4(col, 1.0);
}
