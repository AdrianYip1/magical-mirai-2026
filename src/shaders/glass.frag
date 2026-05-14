uniform vec3 uCameraPos;
uniform sampler2D uSceneTexture;
uniform vec2 uResolution;
uniform float uInsideSphere;
uniform samplerCube uEnvMap;

// Beat intensity set to 1 when a new bar begins?
// Will modify elements like # of panels, reflection strength, etc.
uniform float uBeatIntensity;

varying vec3 vWorldPos;
varying vec3 vNormal;

const float GLASS_INCIDENCE = 0.04;
const float REFRACTION_STRENGTH = 0.05;

// Index of refraction ratios
const float IOR_OUTSIDE = 0.667; //air to glass
const float IOR_INSIDE = 1.5 ; //glass to air

const float RED_OFFSET = 1.0;
const float GREEN_OFFSET = 1.15;
const float BLUE_OFFSET = 1.2;


float fresnel(const float cosTheta, const float F0) {
    return F0 + (1.0 - F0) * pow(1.0 - cosTheta, 5.0);
}

void main() {
    float IOR = (uInsideSphere < 0.0) ? IOR_INSIDE : IOR_OUTSIDE;
    vec3 faceNormal = (uInsideSphere < 0.0) ? -normalize(vNormal) : normalize(vNormal); // normal vector of every triangle face
    vec3 viewDir = normalize(uCameraPos - vWorldPos); // outwards towards camera

    // Refraction
    vec2 screenUV = gl_FragCoord.xy / uResolution;
    vec3 refractDir = refract(-viewDir, faceNormal, IOR);
    
    vec3 refracted = vec3(0.0);
    bool totalInternalReflection = (uInsideSphere < 0.0 && (length(refractDir) < 0.001));
    if (!totalInternalReflection) {
        vec2 offset = refractDir.xy * REFRACTION_STRENGTH;

        // Testing variation with uBeatIntensity
        float spread = 1.0 + uBeatIntensity * 0.1;

        // Simplified chromatic aberration
        float r = texture2D(uSceneTexture, screenUV + offset * RED_OFFSET * spread).r;
        float g = texture2D(uSceneTexture, screenUV + offset * GREEN_OFFSET * spread).g;
        float b = texture2D(uSceneTexture, screenUV + offset * BLUE_OFFSET * spread).b;
        refracted = vec3(r, g, b);
    }

    vec3 reflectDir = reflect(-viewDir, faceNormal);
    vec3 reflectColour = textureCube(uEnvMap, reflectDir).rgb;

    float cosTheta = abs(dot(faceNormal, viewDir));
    float F0 = GLASS_INCIDENCE;
    float fres = fresnel(cosTheta, F0);

    vec3 combinedColour = mix(refracted, reflectColour, fres);

    gl_FragColor = vec4(combinedColour, fres);

}


