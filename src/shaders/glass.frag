uniform mat4 projectionMatrix;

uniform vec3 uCameraPos;
uniform samplerCube uEnvMap;
uniform sampler2D uSceneTexture;
uniform float uRadius;
uniform float uDetailLevel;
uniform float uBeatProgress;
uniform float uChorusFactor;
uniform float uTime;
uniform float uRippleTime[4];
uniform float uRippleStrength[4];
uniform vec3  uRippleDir[4];

varying vec3 vWorldPos;
varying vec3 vNormal;

const float IOR_AIR   = 1.0;
const float IOR_GLASS = 1.5;
const vec3  absorbCoeff = vec3(0.08, 0.04, 0.01);

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
    vec3 rawNormal = gl_FrontFacing ? normalize(vNormal) : -normalize(vNormal);
    vec3 viewDir   = normalize(uCameraPos - vWorldPos);
    vec3 fragDir   = normalize(vWorldPos);

    // Downbeat ripple: expanding ring perturbs the reflection normal.
    vec3 perturbedNormal = rawNormal;
    for (int i = 0; i < 4; i++) {
        float age = uTime - uRippleTime[i];
        if (age < 0.0 || age > 2.0) continue;
        float str = uRippleStrength[i];
        if (str < 0.001) continue;

        float cosA  = clamp(dot(fragDir, uRippleDir[i]), -1.0, 1.0);
        float angle = acos(cosA);
        float d     = angle - age * 1.5;

        float envelope = exp(-d * d * 18.0) * str * exp(-age * 1.6);
        float wave     = sin(d * 14.0) * envelope;

        vec3  tang = uRippleDir[i] - cosA * fragDir;
        float tLen = length(tang);
        if (tLen > 0.001) perturbedNormal += (tang / tLen) * wave * 0.35;
    }
    vec3 faceNormal = normalize(perturbedNormal);

    float cosI = dot(faceNormal, viewDir);
    bool totalInternalReflection = !gl_FrontFacing && (IOR * IOR * (1.0 - cosI * cosI) > 1.0);

    float offG = mix(0.01,  0.028, uDetailLevel);
    float offB = mix(0.04,  0.09,  uDetailLevel);

    float beatPulse = sin(uBeatProgress * 3.14159);

    vec3 refracted = vec3(0.0);
    if (!totalInternalReflection) {
        float spread = 1.0 + beatPulse * mix(0.10, 0.18, uDetailLevel);
        vec3 refDirR = refract(-viewDir, faceNormal, IOR);
        vec3 refDirG = refract(-viewDir, faceNormal, IOR * (1.0 + offG * spread));
        vec3 refDirB = refract(-viewDir, faceNormal, IOR * (1.0 + offB * spread));
        refracted.r = texture2D(uSceneTexture, exitUV(vWorldPos, refDirR)).r;
        refracted.g = texture2D(uSceneTexture, exitUV(vWorldPos, refDirG)).g;
        refracted.b = texture2D(uSceneTexture, exitUV(vWorldPos, refDirB)).b;

        float thickness = exitT(vWorldPos, refDirR);
        refracted *= exp(-absorbCoeff * thickness);
    }

    vec3  reflectDir   = reflect(-viewDir, faceNormal);
    float reflBoost    = mix(1.0, 1.6, uDetailLevel);
    vec3  reflectColour = textureCube(uEnvMap, reflectDir).rgb * reflBoost;

    float cosTheta = abs(dot(faceNormal, viewDir));
    float F0   = mix(0.15, 0.32, uDetailLevel);
    float fres = fresnel(cosTheta, F0);

    vec3  combinedColour;
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

    // Rim glow: teal on verse, shifts toward cool white during chorus.
    float rim    = pow(1.0 - cosTheta, 2.5);
    vec3  rimCol = mix(vec3(0.20, 0.80, 0.90), vec3(0.70, 0.88, 1.00), uChorusFactor);
    combinedColour += rimCol * rim * beatPulse * 2.2;

    gl_FragColor = vec4(combinedColour, alpha);
}
