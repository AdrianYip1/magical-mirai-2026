uniform mat4 projectionMatrix;

uniform vec3 uCameraPos;
uniform samplerCube uEnvMap;
uniform sampler2D uSceneTexture;
uniform float uRadius;
uniform float uBeatIntensity;

varying vec3 vWorldPos;
varying vec3 vNormal;

const float GLASS_INCIDENCE = 0.15;
const float IOR_AIR = 1.0;
const float IOR_GLASS = 1.5;
const vec3 absorbCoeff = vec3(0.1, 0.05, 0.02);

float fresnel(const float cosTheta, const float F0) {
    return F0 + (1.0 - F0) * pow(1.0 - cosTheta, 5.0);
}

float exitT(vec3 entryPoint, vec3 dir) {
    float b = 2.0 * dot(entryPoint, dir);
    float c = dot(entryPoint, entryPoint) - uRadius * uRadius;
    return (-b + sqrt(max(0.0, b * b - 4.0 * c))) / 2.0;
}

vec2 exitUV(vec3 entryPoint, vec3 dir) {
    vec3 exitPoint = entryPoint + exitT(entryPoint, dir) * dir;
    vec4 clip = projectionMatrix * viewMatrix * vec4(exitPoint, 1.0);
    vec2 ndc = clip.xy / clip.w;
    return ndc * 0.5 + 0.5;
}

void main() {
    float IOR = gl_FrontFacing ? (IOR_AIR / IOR_GLASS) : (IOR_GLASS / IOR_AIR);
    vec3 faceNormal = gl_FrontFacing ? normalize(vNormal) : -normalize(vNormal);
    vec3 viewDir = normalize(uCameraPos - vWorldPos);

    float cosI = dot(faceNormal, viewDir);
    bool totalInternalReflection = !gl_FrontFacing && (IOR * IOR * (1.0 - cosI * cosI) > 1.0);

    vec3 refracted = vec3(0.0);
    if (!totalInternalReflection) {
        float spread = 1.0 + uBeatIntensity * 0.1;
        vec3 refDirR = refract(-viewDir, faceNormal, IOR);
        vec3 refDirG = refract(-viewDir, faceNormal, IOR * (1.0 + 0.01 * spread));
        vec3 refDirB = refract(-viewDir, faceNormal, IOR * (1.0 + 0.04 * spread));
        refracted.r = texture2D(uSceneTexture, exitUV(vWorldPos, refDirR)).r;
        refracted.g = texture2D(uSceneTexture, exitUV(vWorldPos, refDirG)).g;
        refracted.b = texture2D(uSceneTexture, exitUV(vWorldPos, refDirB)).b;

        float thickness = exitT(vWorldPos, refDirR);
        refracted *= exp(-absorbCoeff * thickness);
    }

    vec3 reflectDir = reflect(-viewDir, faceNormal);
    vec3 reflectColour = textureCube(uEnvMap, reflectDir).rgb;

    float cosTheta = abs(dot(faceNormal, viewDir));
    float fres = fresnel(cosTheta, GLASS_INCIDENCE);

    vec3 combinedColour;
    float alpha;
    if (totalInternalReflection) {
        combinedColour = reflectColour;
        alpha = 1.0;
    } else {
        combinedColour = mix(refracted, reflectColour, fres);
        // Fade out at extreme grazing angles so the silhouette rim doesn't
        // block text near the sphere edges (non-physical but intentional).
        float edgeFade = smoothstep(0.0, 0.40, cosTheta);
        float rawAlpha = gl_FrontFacing ? fres : max(fres, 0.15);
        alpha = rawAlpha * mix(0.2, 1.0, edgeFade);
    }

    // Beat rim pulse — teal glow that fires on beat drops.
    float rim = pow(1.0 - cosTheta, 2.5);
    combinedColour += vec3(0.20, 0.80, 0.90) * rim * uBeatIntensity * 2.2;

    gl_FragColor = vec4(combinedColour, alpha);
}
