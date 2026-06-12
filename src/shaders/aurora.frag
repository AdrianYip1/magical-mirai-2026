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
        mix(hash2(i),                    hash2(i + vec2(1.0, 0.0)), f.x),
        mix(hash2(i + vec2(0.0, 1.0)), hash2(i + vec2(1.0, 1.0)), f.x),
        f.y
    );
}

float fbm(vec2 p) {
    float v = 0.0, a = 0.5;
    for (int i = 0; i < FBM_OCTAVES; i++) {
        v += a * noise(p);
        p  = p * 2.0 + vec2(31.4, 17.2);
        a *= 0.5;
    }
    return v;
}

// dir:   normalised world direction
// t:     pre-scaled time
// bandY: animated base altitude of this curtain
// seed:  per-band variation constant
// drift: per-band 2-D drift in the xz plane (X = left/right, Z = front/back)
vec3 auroraBand(vec3 dir, float t, float bandY, float seed, vec2 drift) {
    vec2 hPos = dir.xz + drift;

    // Bottom hem: two sinusoids at different frequencies + small FBM nudge.
    float wave = sin(hPos.x * 2.1 + t * 1.6 + seed * 2.3) * 0.09
               + sin(hPos.x * 0.8 + t * 0.9 + seed * 1.1) * 0.05
               + fbm(hPos * 0.6 + vec2(t * 0.25 + seed, seed * 0.7)) * 0.04;

    float above = dir.y - (bandY + wave);

    // Taller curtain envelope: halved decay so each band reaches higher and
    // overlaps its neighbours — they merge when their animated Y drifts close.
    float curtain = exp(-max(0.0, above) * 1.8)
                  * smoothstep(-0.08, 0.03, above);
    if (curtain < 0.002) return vec3(0.0);

    // Vertical ray striations: anisotropic noise — narrow columns flowing sideways.
    float rays = noise(vec2(hPos.x * 22.0 + t * 1.2 + seed * 5.0,
                             above  *  4.0 + t * 0.15 + seed));
    rays = pow(max(0.0, rays - 0.18) / 0.82, 1.8);

    // Large-scale curtain folds: slower billows that give volume.
    float folds = fbm(hPos * 1.4 + vec2(t * 0.22 + seed * 1.3, seed * 0.5));
    folds = pow(max(0.0, folds - 0.08) / 0.92, 1.1);

    float intensity = rays * 0.55 + folds * 0.45;

    // Color: magenta-pink fringe → teal-green body → ice-blue top.
    // colorShift slowly breathes the boundary heights up and down.
    float colorShift = sin(uTime * 0.07 + seed * 2.5) * 0.10;
    float h   = clamp(above / 0.55, 0.0, 1.0);
    vec3  col = mix(
        vec3(0.78, 0.04, 0.46),
        vec3(0.00, 0.82, 0.58),
        smoothstep(0.0, 0.32 + colorShift, h)
    );
    col = mix(col,
        vec3(0.10, 0.42, 0.90),
        smoothstep(0.50 + colorShift, 1.0, h)
    );

    return curtain * intensity * col;
}

void main() {
    vec3  dir = normalize(vWorldPos);
    float yy  = dir.y * 0.5 + 0.5;

    // Night sky: dark navy at horizon, near-black at zenith.
    vec3 col = mix(vec3(0.006, 0.010, 0.026),
                   vec3(0.000, 0.001, 0.008), yy);

    float t = uTime * 0.09;

    // Each band's base altitude drifts independently on a slow sinusoid so they
    // drift toward each other (merging into one bright mass) and apart again.
    // Ranges chosen so all three can coincide briefly near Y ≈ 0.
    float y0 = -0.20 + sin(uTime * 0.031)           * 0.14;
    float y1 =  0.05 + sin(uTime * 0.041 + 1.40)    * 0.12;
    float y2 =  0.25 + sin(uTime * 0.027 + 2.60)    * 0.15;

    // 2-D drift: X for left/right sweep, Z for front/back flow.
    vec2 drift0 = vec2(sin(uTime * 0.050)         * 0.10,
                       sin(uTime * 0.038 + 0.50)  * 0.08);
    vec2 drift1 = vec2(uTime                      * 0.010,
                       sin(uTime * 0.028 + 1.20)  * 0.06);
    vec2 drift2 = vec2(sin(uTime * 0.038 + 1.80)  * 0.08,
                       uTime                      * 0.007);

    col += auroraBand(dir, t, y0, 0.0, drift0) * 0.90;
#if AURORA_BANDS >= 2
    col += auroraBand(dir, t, y1, 1.7, drift1) * 0.75;
#endif
#if AURORA_BANDS >= 3
    col += auroraBand(dir, t, y2, 3.4, drift2) * 0.55;
#endif

    gl_FragColor = vec4(col, 1.0);
}
