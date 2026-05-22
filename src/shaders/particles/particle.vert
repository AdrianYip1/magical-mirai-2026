uniform float uTime;
uniform float uBeatIntensity;

attribute vec3 aRandom;

varying float vHue;

float hash(vec3 position) {
    position = fract(position * vec3(412.98234, 281.2713, 397.1893));
    position += dot(position, position.zxy + 19.19);
    return fract((position.x + position.y) * position.z);
}

float noise(vec3 position) {
    vec3 intPos  = floor(position);
    vec3 fractPos = fract(position);
    fractPos = fractPos * fractPos * (3.0 - 2.0 * fractPos);

    float c000 = hash(intPos + vec3(0,0,0));
    float c001 = hash(intPos + vec3(0,0,1));
    float c010 = hash(intPos + vec3(0,1,0));
    float c011 = hash(intPos + vec3(0,1,1));
    float c100 = hash(intPos + vec3(1,0,0));
    float c101 = hash(intPos + vec3(1,0,1));
    float c110 = hash(intPos + vec3(1,1,0));
    float c111 = hash(intPos + vec3(1,1,1));

    float x00 = mix(c000, c100, fractPos.x);
    float x01 = mix(c001, c101, fractPos.x);
    float x10 = mix(c010, c110, fractPos.x);
    float x11 = mix(c011, c111, fractPos.x);
    float y0  = mix(x00, x10, fractPos.y);
    float y1  = mix(x01, x11, fractPos.y);
    return mix(y0, y1, fractPos.z);
}

float fbm(vec3 position) {
    float result = 0.0;
    float amplitude = 0.5;
    float frequency = 1.0;
    for (int i = 0; i < 4; i++) {
        result    += amplitude * noise(position * frequency);
        amplitude *= 0.5;
        frequency *= 2.0;
    }
    return result;
}

vec3 curlNoise(vec3 position) {
    float eps = 0.01;

    float dFz_dy = (fbm(position + vec3(0,eps,0) + vec3(0.0,17.32,0.0)) - fbm(position - vec3(0,eps,0) + vec3(0.0,17.32,0.0))) / (2.0*eps);
    float dFy_dz = (fbm(position + vec3(0,0,eps) + vec3(31.41,0.0,0.0)) - fbm(position - vec3(0,0,eps) + vec3(31.41,0.0,0.0))) / (2.0*eps);
    float dFx_dz = (fbm(position + vec3(0,0,eps))                       - fbm(position - vec3(0,0,eps)))                       / (2.0*eps);
    float dFz_dx = (fbm(position + vec3(eps,0,0) + vec3(0.0,17.32,0.0)) - fbm(position - vec3(eps,0,0) + vec3(0.0,17.32,0.0))) / (2.0*eps);
    float dFy_dx = (fbm(position + vec3(eps,0,0) + vec3(31.41,0.0,0.0)) - fbm(position - vec3(eps,0,0) + vec3(31.41,0.0,0.0))) / (2.0*eps);
    float dFx_dy = (fbm(position + vec3(0,eps,0))                       - fbm(position - vec3(0,eps,0)))                       / (2.0*eps);

    return vec3(dFz_dy - dFy_dz, dFx_dz - dFz_dx, dFy_dx - dFx_dy);
}

void main() {
    vec3 pos = position;

    vHue = aRandom.z;

    vec3 flow = curlNoise(pos * 0.05 + uTime * 0.12 + aRandom * 0.3);
    pos += flow * 1.8;

    pos += normalize(pos) * uBeatIntensity * aRandom.x * 2.0;

    gl_PointSize = 1.5;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
}
