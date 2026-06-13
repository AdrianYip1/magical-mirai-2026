uniform vec3        uCameraPos;
uniform samplerCube uEnvMap;
uniform float       uBeatIntensity;
uniform float       uOpacity;
uniform float       uFill;
uniform float       uTime;

varying vec3 vNormal;
varying vec3 vWorldPos;

float fresnel(float cosTheta, float F0) {
    return F0 + (1.0 - F0) * pow(1.0 - cosTheta, 5.0);
}

void main() {
    vec3  N        = normalize(vNormal);
    vec3  V        = normalize(uCameraPos - vWorldPos);
    float cosTheta = max(0.0, dot(N, V));
    float fres     = fresnel(cosTheta, 0.08);
    float rim      = pow(1.0 - cosTheta, 1.5);

    vec3 R       = reflect(-V, N);
    vec3 envRefl = textureCube(uEnvMap, R).rgb * fres * mix(1.6, 2.0, uFill);

    vec3 glassBase = mix(vec3(0.12, 0.58, 0.68), vec3(0.38, 0.88, 0.86), uFill);

    vec3 rimGlow = vec3(0.14, 0.82, 0.78) * rim
                 * (mix(0.9, 1.5, uFill) + uBeatIntensity * mix(1.6, 2.0, uFill));

    float scan = 0.90 + 0.10 * sin(vWorldPos.y * 5.0 - uTime * 0.4);

    vec3  color = (glassBase * mix(0.06, 0.55, uFill) + envRefl + rimGlow) * scan;
    float alpha = (mix(0.22, 0.55, uFill) + rim * mix(0.42, 0.45, uFill)) * uOpacity;

    gl_FragColor = vec4(color, alpha);
}
