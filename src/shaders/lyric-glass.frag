uniform vec3        uCameraPos;
uniform samplerCube uEnvMap;
uniform float       uBeatIntensity;
uniform float       uOpacity;

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

    vec3 R        = reflect(-V, N);
    vec3 envRefl  = textureCube(uEnvMap, R).rgb * fres * 2.0;

    vec3 glassBase = vec3(0.65, 0.88, 1.0);
    vec3 rimGlow   = glassBase * rim * (1.5 + uBeatIntensity * 2.0);

    vec3  color = glassBase * 0.45 + envRefl + rimGlow;
    float alpha = (0.30 + rim * 0.65) * uOpacity;

    gl_FragColor = vec4(color, alpha);
}
