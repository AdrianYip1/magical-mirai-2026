precision highp float;

uniform sampler2D uState;
uniform sampler2D uTargetTex;
uniform sampler2D uAssignmentTex;
uniform float uTime;
uniform float uDelta;
uniform float uBeat;
uniform float uFadeRate;

varying vec2 vUv;

#ifdef MOBILE

// Analytical curl of F = (sin(y)*sin(z), sin(z)*sin(x), sin(x)*sin(y)).
// No noise lookups so it is far cheaper than the curl version.
vec3 curl(vec3 p) {
    p = p * 0.08 + uTime * 0.06;
    return vec3(
        cos(p.y) * sin(p.z),
        cos(p.z) * sin(p.x),
        cos(p.x) * sin(p.y)
    );
}

#else

// hash instead of permutation table 

vec3 hash3(vec3 p) {
    p = vec3(
        dot(p, vec3(127.1, 311.7,  74.7)),
        dot(p, vec3(269.5, 183.3, 246.1)),
        dot(p, vec3(113.5, 271.9, 124.6))
    );
    return normalize(fract(sin(p) * 43758.5453) * 2.0 - 1.0);
}

float noise(vec3 p) {
    vec3 i = floor(p);
    vec3 f = fract(p);
    vec3 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);

    float v000 = dot(hash3(i + vec3(0,0,0)), f - vec3(0,0,0));
    float v100 = dot(hash3(i + vec3(1,0,0)), f - vec3(1,0,0));
    float v010 = dot(hash3(i + vec3(0,1,0)), f - vec3(0,1,0));
    float v110 = dot(hash3(i + vec3(1,1,0)), f - vec3(1,1,0));
    float v001 = dot(hash3(i + vec3(0,0,1)), f - vec3(0,0,1));
    float v101 = dot(hash3(i + vec3(1,0,1)), f - vec3(1,0,1));
    float v011 = dot(hash3(i + vec3(0,1,1)), f - vec3(0,1,1));
    float v111 = dot(hash3(i + vec3(1,1,1)), f - vec3(1,1,1));

    return mix(
        mix(mix(v000, v100, u.x), mix(v010, v110, u.x), u.y),
        mix(mix(v001, v101, u.x), mix(v011, v111, u.x), u.y),
        u.z);
}

float fbm(vec3 p) {
    float v = 0.0, a = 0.5;
    for (int i = 0; i < 4; i++) { v += a * noise(p); p *= 2.0; a *= 0.5; }
    return v;
}

vec3 curl(vec3 p) {
    const float e = 0.01;
    float dFzdy = (fbm(p+vec3(0,e,0)+vec3(0,17.32,0)) - fbm(p-vec3(0,e,0)+vec3(0,17.32,0))) / (2.0*e);
    float dFydz = (fbm(p+vec3(0,0,e)+vec3(31.41,0,0)) - fbm(p-vec3(0,0,e)+vec3(31.41,0,0))) / (2.0*e);
    float dFxdz = (fbm(p+vec3(0,0,e)) - fbm(p-vec3(0,0,e))) / (2.0*e);
    float dFzdx = (fbm(p+vec3(e,0,0)+vec3(0,17.32,0)) - fbm(p-vec3(e,0,0)+vec3(0,17.32,0))) / (2.0*e);
    float dFydx = (fbm(p+vec3(e,0,0)+vec3(31.41,0,0)) - fbm(p-vec3(e,0,0)+vec3(31.41,0,0))) / (2.0*e);
    float dFxdy = (fbm(p+vec3(0,e,0)) - fbm(p-vec3(0,e,0))) / (2.0*e);
    return vec3(dFzdy - dFydz, dFxdz - dFzdx, dFydx - dFxdy);
}

#endif

vec3 respawn(vec2 seed) {
    return vec3(
        (fract(sin(seed.x * 127.1 + seed.y * 311.7) * 43758.5453) - 0.5) * 20.0,
        (fract(sin(seed.x * 269.5 + seed.y * 183.3) * 43758.5453) - 0.5) * 16.0,
        (fract(sin(seed.x * 419.2 + seed.y * 371.9) * 43758.5453) - 0.5) *  8.0
    );
}

void main() {
    vec4 state = texture2D(uState, vUv);
    vec3 pos   = state.xyz;
    float age  = state.w;

    if (age >= 1.0) {
        pos = respawn(vUv);
        age = fract(sin(vUv.x * 591.3 + vUv.y * 291.7) * 43758.5453);
        gl_FragColor = vec4(pos, age);
        return;
    }

    vec3 target   = texture2D(uTargetTex, vUv).xyz;
    vec3 toTarget = target - pos;

    vec3 flow     = curl(pos * 0.05 + uTime * 0.06);
    float speed   = 1.2 + uBeat * 3.0;

    float active       = texture2D(uAssignmentTex, vUv).r;
    float activateTime = texture2D(uAssignmentTex, vUv).g;
    float age_s        = max(0.0, uTime - activateTime);
    float fade         = active * max(0.0, 1.0 - age_s * uFadeRate);

    vec3 velocity = mix(flow, toTarget * 9.0, fade);
    pos += velocity * speed * uDelta;

    age += uDelta * mix(0.50, 0.02, fade);

    gl_FragColor = vec4(pos, age);
}
