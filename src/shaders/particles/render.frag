varying float vAge;
varying float vHue;

void main() {
    float alpha = 1.0 - smoothstep(0.7, 1.0, vAge);
    vec3 color = 0.5 + 0.5 * cos(6.28318 * (vHue + vec3(0.0, 0.333, 0.667)));
    gl_FragColor = vec4(color * 0.4 * alpha, alpha);
}
