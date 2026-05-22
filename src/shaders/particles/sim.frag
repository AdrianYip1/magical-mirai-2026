precision highp float;

uniform sampler2D uState;
uniform float uTime;
uniform float uDelta;
uniform float uBeat;

varying vec2 vUv;

float hash(vec3 p) {
    p = fract(p * vec3(412.98234, 281.2713, 397.1893));
    p += dot(p, p.zxy + 19.19);
    return fract((p.x + p.y) * p.z);
}

float noise(vec3 p) {
    vec3 i = floor(p);
    vec3 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(
        mix(mix(hash(i), hash(i+vec3(1,0,0)), f.x), mix(hash(i+vec3(0,1,0)), hash(i+vec3(1,1,0)), f.x), f.y),
        mix(mix(hash(i+vec3(0,0,1)), hash(i+vec3(1,0,1)), f.x), mix(hash(i+vec3(0,1,1)), hash(i+vec3(1,1,1)), f.x), f.y), f.z);
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

vec3 respawn(vec2 seed) {
    return vec3(
        (fract(sin(seed.x * 127.1 + seed.y * 311.7) * 43758.5453) - 0.5) * 20.0,
        (fract(sin(seed.x * 269.5 + seed.y * 183.3) * 43758.5453) - 0.5) * 16.0,
        (fract(sin(seed.x * 419.2 + seed.y * 371.9) * 43758.5453) - 0.5) *  8.0
    );
}

void main() {
    // Every pixel reads its particle state
    vec4 state = texture2D(uState, vUv);
    vec3 pos   = state.xyz;
    float age  = state.w;

    // Respawn dead particles at a random position (through hashing)
    if (age >= 1.0) {
        pos = respawn(vUv);
        age = fract(sin(vUv.x * 591.3 + vUv.y * 291.7) * 43758.5453);
        gl_FragColor = vec4(pos, age);
        return;
    }

    // Move along the curl field
    vec3 flow  = curl(pos * 0.05 + uTime * 0.06);
    float speed = 1.2 + uBeat * 3.0;
    pos += flow * speed * uDelta;

    age += uDelta * 0.12;

    gl_FragColor = vec4(pos, age);
}
