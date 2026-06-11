// FBM_OCTAVES and AURORA_BANDS injected via ShaderMaterial.defines.
//
// Northern-lights technique:
//   • Sharp lower boundary  — where the atmosphere blocks the particle stream
//   • Vertical ray shafts   — alternating bright/dark columns (the defining look)
//   • Height colour gradient — magenta fringe → Miku teal → ice blue
//   • Slow undulating wave on the bottom edge
//   • Subtle flicker from a fast independent noise layer

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

    // ── Bottom-edge undulation ─────────────────────────────────────────────
    // Low-freq wave makes the curtain hem sway slowly, like a real aurora.
    float wave  = fbm(hPos * 0.7 + vec2(t * 0.03 + seed, seed * 1.3)) * 0.10 - 0.05;
    float above = dir.y - (bandY + wave); // signed distance above curtain hem

    // ── Curtain profile ───────────────────────────────────────────────────
    // Sharp lower boundary, slow decay upward → tall curtains fill full sky.
    float curtain = exp(-max(0.0, above) * 2.8)
                  * smoothstep(-0.05, 0.018, above);
    if (curtain < 0.002) return vec3(0.0);

    // ── Vertical ray shafts ───────────────────────────────────────────────
    // Coarse columns: the broad bright/dark shafts visible from a distance.
    float coarse = noise(hPos * 5.0 + vec2(t * 0.07 + seed * 2.7, seed));
    coarse = pow(max(0.0, coarse - 0.10) / 0.90, 1.3);

    // Fine filaments inside the coarse shafts for close-up detail.
    float fine = noise(hPos * 16.0 + vec2(t * 0.14 + seed, seed * 0.7));
    fine = max(0.0, fine - 0.35) / 0.65;

    float rays = coarse * 0.78 + fine * 0.22;

    // ── Flicker ───────────────────────────────────────────────────────────
    // Independent fast noise simulates the rapid shimmer of real aurora.
    float flicker = 0.80 + 0.20 * noise(vec2(uTime * 0.9 + seed * 6.3,
                                              dir.x * 2.0 + seed));

    // ── Height-based colour gradient ──────────────────────────────────────
    // Bottom fringe: magenta  (low-altitude N₂ emission)
    // Middle:        Miku teal (main O₂ green-cyan, shifted to palette)
    // Top:           ice blue  (high-altitude O₂ + diffuse scatter)
    float h   = clamp(above / 0.55, 0.0, 1.0);  // gradient spans the taller curtain
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

    // Deep-space background — almost black, faint blue tint at horizon.
    vec3 col = mix(vec3(0.006, 0.009, 0.022),
                   vec3(0.000, 0.001, 0.006), yy);

    float t = uTime * 0.04;

    // Bands are staggered from below the horizon up to the zenith so curtains
    // fill the full field of view regardless of where the camera looks.
    col += auroraBand(dir, t, -0.50, 0.0);          // anchors the lower sky

#if AURORA_BANDS >= 2
    col += auroraBand(dir, t, -0.05, 1.7) * 0.85;   // fills the middle
#endif

#if AURORA_BANDS >= 3
    col += auroraBand(dir, t,  0.42, 3.4) * 0.58;   // crowns the upper sky
#endif

    gl_FragColor = vec4(col, 1.0);
}
