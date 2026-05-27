uniform sampler2D uState;
uniform sampler2D uAssignmentTex;
uniform float uBeat;

attribute vec2 aUv;

varying float vAge;
varying float vHue;
varying vec3 vWorldPos;

void main() {
    vec4 state = texture2D(uState, aUv);
    vec3 pos = state.xyz;
    vAge = state.w;
    vHue = aUv.x * 7.3 + aUv.y * 3.7;
    vWorldPos = (modelMatrix * vec4(pos, 1.0)).xyz;

    pos += normalize(pos + vec3(0.001)) * uBeat * 0.3;

    gl_PointSize = 2.5;
    gl_Position  = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
}
