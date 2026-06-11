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

    vec3 R            = reflect(-V, N);
    vec3 reflectColor = textureCube(uEnvMap, R).rgb;

    // Ice-white rim glow — edges only. Additive blending: values must stay ≤1
    // so they don't overexpose when accumulated on top of particles.
    float rim     = pow(1.0 - cosTheta, 2.2);
    vec3  rimGlow = vec3(0.82, 0.94, 1.0) * rim * (0.9 + uBeatIntensity * 1.2);

    vec3  color = reflectColor * fres + rimGlow;
    float alpha = (fres * 0.15 + rim * 0.35) * uOpacity;

    gl_FragColor = vec4(color, alpha);
}
