uniform sampler2D uState;
uniform float uBeat;

attribute vec2 aUv;

varying float vAge;
varying float vHue;

void main() {
    vec4 state = texture2D(uState, aUv); // Get particle position
    vec3 pos = state.xyz;
    vAge = state.w;
    vHue = aUv.x * 7.3 + aUv.y * 3.7;

    pos += normalize(pos + vec3(0.001)) * uBeat * 1.5;

    gl_PointSize = 1.5;
    gl_Position  = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
}
