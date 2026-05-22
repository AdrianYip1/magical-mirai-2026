uniform float uTime;
uniform float uBeatIntensity;

varying float vHue;

void main() {
    vec3 color = 0.5 + 0.5 * cos(6.28318 * (vHue + vec3(0.0, 0.333, 0.667)));
    gl_FragColor = vec4(color * 0.35, 1.0);
}
