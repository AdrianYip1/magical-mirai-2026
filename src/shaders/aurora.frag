// FBM_OCTAVES and AURORA_BANDS injected via ShaderMaterial.defines.

uniform float uTime;
uniform float uVocalAmp;
uniform float uChorusFactor;
uniform vec3  uChordTint;
uniform float     uChordStrength;
uniform float     uMenuReflect;
uniform sampler2D uMenuTex;
uniform vec2      uResolution;
varying vec3 vWorldPos;

const vec3 MIKU_TEAL = vec3(0.13, 0.86, 0.80);
const vec3 MIKU_BLUE = vec3(0.16, 0.42, 0.96);
const vec3 MIKU_PINK = vec3(1.00, 0.33, 0.62);
const vec3 MIKU_HEM  = vec3(0.62, 1.00, 0.90);

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

    float warp = fbm(hPos * 0.5 + vec2(t * 0.12 + seed, seed * 0.7)) - 0.5;

    float wave = sin(hPos.x * 1.5 + t * 0.55 + seed * 2.3 + warp * 2.5) * 0.10
               + sin(hPos.x * 0.6 + t * 0.30 + seed * 1.1)              * 0.06
               + warp * 0.07;

    float above = dir.y - (bandY + wave);
    if (above < -0.08) return vec3(0.0);

    float body = exp(-max(0.0, above) * 1.6) * smoothstep(-0.07, 0.02, above);
    float hem  = exp(-max(0.0, above) * 9.0) * smoothstep(-0.045, 0.0, above);

    float vy   = above * 0.7 - t * 0.5 + seed;
    float rx   = hPos.x + warp * 0.35;
    float ray1 = noise(vec2(rx * 16.0 + seed * 5.0, vy));
    float ray2 = noise(vec2(rx * 38.0 + seed * 9.0, vy * 1.6));
    float rays = smoothstep(0.40, 0.78, ray1 * 0.65 + ray2 * 0.35);

    float knot = smoothstep(0.5, 1.0,
                            noise(vec2(rx * 4.0 - t * 0.8 + seed, seed * 3.0)));

    float bodyGlow = body * (0.20 + rays * 0.95 + rays * knot * 0.6);

    float h          = clamp(above / 0.6, 0.0, 1.0);
    float colorShift = sin(uTime * 0.06 + seed * 2.5) * 0.06;
    vec3  col = mix(MIKU_TEAL, MIKU_BLUE, smoothstep(0.08, 0.52 + colorShift, h));
    col       = mix(col, MIKU_PINK, smoothstep(0.55 + colorShift, 1.0, h));

    return col * bodyGlow + MIKU_HEM * hem * (0.5 + 0.9 * rays);
}

vec3 auroraSky(vec3 dir, float t) {
    float y0 = -0.04 + sin(uTime * 0.031)        * 0.06;
    float y1 =  0.11 + sin(uTime * 0.041 + 1.40) * 0.10;
    float y2 =  0.28 + sin(uTime * 0.027 + 2.60) * 0.13;

    vec2 drift0 = vec2(sin(uTime * 0.050)        * 0.10,
                       sin(uTime * 0.038 + 0.50) * 0.08);
    vec2 drift1 = vec2(uTime                     * 0.010,
                       sin(uTime * 0.028 + 1.20) * 0.06);
    vec2 drift2 = vec2(sin(uTime * 0.038 + 1.80) * 0.08,
                       uTime                     * 0.007);

    vec3 aur = auroraBand(dir, t, y0, 0.0, drift0) * 0.90;
#if AURORA_BANDS >= 2
    aur += auroraBand(dir, t, y1, 1.7, drift1) * 0.75;
#endif
#if AURORA_BANDS >= 3
    aur += auroraBand(dir, t, y2, 3.4, drift2) * 0.55;
#endif
    return aur * smoothstep(-0.05, 0.10, dir.y);
}

// Sparse twinkling stars, denser toward the zenith.
float stars(vec3 dir) {
    vec2 uv = dir.xz / (abs(dir.y) + 0.35);
    vec2 g  = floor(uv * 64.0);
    float h = hash2(g);
    float s = step(0.992, h);
    return s * (0.4 + 0.6 * sin(uTime * 1.7 + h * 120.0));
}

void main() {
    vec3  dir = normalize(vWorldPos);
    float t   = uTime * 0.09;
    vec3  col;

    if (dir.y >= 0.0) {
        col = mix(vec3(0.010, 0.030, 0.052),
                  vec3(0.000, 0.002, 0.012), smoothstep(0.0, 0.6, dir.y));
        col += vec3(0.70, 0.82, 1.00) * stars(dir)
             * smoothstep(0.06, 0.5, dir.y) * 0.6;
        col += auroraSky(dir, t);
        col += MIKU_TEAL * exp(-dir.y * 7.0) * 0.04;
    } else {
        float depth = -dir.y;

        vec2  q  = dir.xz * vec2(9.0, 3.5);
        float n1 = noise(q       + vec2( uTime * 0.18,  uTime * 0.07));
        float n2 = noise(q * 2.3 + vec2(-uTime * 0.13,  uTime * 0.21));
        float n3 = noise(q * 5.0 + vec2( uTime * 0.27, -uTime * 0.19));
        vec2  slope = vec2((n1 - 0.5) + (n3 - 0.5) * 0.5,
                           (n2 - 0.5) * 1.8 + (n3 - 0.5) * 0.6);
        float amp   = 0.035 + depth * 0.16;

        vec3 rdir = normalize(vec3(dir.x + slope.x * amp,
                                   -dir.y + abs(slope.y) * amp * 0.7,
                                   dir.z + slope.x * amp));

        vec3  refl = auroraSky(rdir, t);

        float fres = clamp(0.02 + 0.98 * pow(1.0 - depth, 5.0), 0.0, 1.0);
        float fade = 1.0 - smoothstep(0.0, 0.95, depth);

        vec3  water = mix(vec3(0.006, 0.020, 0.034),
                          vec3(0.000, 0.002, 0.010), smoothstep(0.0, 0.7, depth));

        col  = mix(water, refl, fres);
        col += vec3(0.55, 0.95, 1.00) * stars(rdir)
             * smoothstep(0.02, 0.25, depth) * fres * 0.2;
        col += MIKU_TEAL * exp(-depth * 14.0) * 0.06;

        float glint = pow(max(0.0, n1 * n2 * 1.3), 9.0);
        col += vec3(0.75, 1.0, 1.0) * glint * fres * 0.6;

        if (uMenuReflect > 0.001) {
            const float MENU_PERSP = 1.6;
            vec2  suv = gl_FragCoord.xy / uResolution;
            float b   = 0.5 - suv.y;
            float persp = 1.0 + max(0.0, b) * MENU_PERSP;
            vec2  muv = vec2(0.5 + (suv.x - 0.5) / persp, 1.0 - suv.y);
            muv += slope * 0.025 * (0.3 + depth);
            vec3 menu = texture2D(uMenuTex, clamp(muv, 0.0, 1.0)).rgb;
            col += menu * vec3(0.42, 0.58, 0.66) * uMenuReflect * fade * 0.45;
        }
    }

    float horizon = exp(-abs(dir.y) * 70.0);
    col += mix(MIKU_TEAL, vec3(0.85, 1.0, 1.0), 0.4) * horizon * 0.65;

    gl_FragColor = vec4(col, 1.0);
}
