uniform mat4 projectionMatrix;

uniform vec3 uCameraPos;
uniform samplerCube uEnvMap;
uniform sampler2D uSceneTexture;
uniform float uRadius;
uniform float uBeatIntensity;
uniform float uDetailLevel; // 0 = low (original look), 1 = high (enhanced)

varying vec3 vWorldPos;
varying vec3 vNormal;

const float IOR_AIR = 1.0;
const float IOR_GLASS = 1.5;
const vec3 absorbCoeff = vec3(0.08, 0.04, 0.01);

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

    // Chromatic offsets: original (low) vs enhanced (high)
    float offG = mix(0.01,  0.028, uDetailLevel);
    float offB = mix(0.04,  0.09,  uDetailLevel);

    vec3 refracted = vec3(0.0);
    if (!totalInternalReflection) {
        float spread = 1.0 + uBeatIntensity * mix(0.10, 0.18, uDetailLevel);
        vec3 refDirR = refract(-viewDir, faceNormal, IOR);
        vec3 refDirG = refract(-viewDir, faceNormal, IOR * (1.0 + offG * spread));
        vec3 refDirB = refract(-viewDir, faceNormal, IOR * (1.0 + offB * spread));
        refracted.r = texture2D(uSceneTexture, exitUV(vWorldPos, refDirR)).r;
        refracted.g = texture2D(uSceneTexture, exitUV(vWorldPos, refDirG)).g;
        refracted.b = texture2D(uSceneTexture, exitUV(vWorldPos, refDirB)).b;

        float thickness = exitT(vWorldPos, refDirR);
        refracted *= exp(-absorbCoeff * thickness);
    }

    vec3 reflectDir = reflect(-viewDir, faceNormal);
    float reflBoost = mix(1.0, 1.6, uDetailLevel);
    vec3 reflectColour = textureCube(uEnvMap, reflectDir).rgb * reflBoost;

    float cosTheta = abs(dot(faceNormal, viewDir));
    float F0 = mix(0.15, 0.32, uDetailLevel);
    float fres = fresnel(cosTheta, F0);

    vec3 combinedColour;
    float alpha;
    if (totalInternalReflection) {
        combinedColour = reflectColour;
        alpha = 1.0;
    } else {
        combinedColour = mix(refracted, reflectColour, fres);
        float edgeThresh = mix(0.40, 0.35, uDetailLevel);
        float edgeFade   = smoothstep(0.0, edgeThresh, cosTheta);
        float alphaBase  = mix(0.0, 0.42, uDetailLevel);
        float backBase   = mix(0.15, 0.35, uDetailLevel);
        float edgeFloor  = mix(0.2, 0.45, uDetailLevel);
        float rawAlpha   = gl_FrontFacing ? max(fres, alphaBase) : max(fres, backBase);
        alpha = rawAlpha * mix(edgeFloor, 1.0, edgeFade);
    }

    // Beat rim pulse — teal glow that fires on beat drops.
    float rim = pow(1.0 - cosTheta, 2.5);
    combinedColour += vec3(0.20, 0.80, 0.90) * rim * uBeatIntensity * 2.2;

    gl_FragColor = vec4(combinedColour, alpha);
}
