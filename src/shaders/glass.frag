uniform vec3 uCameraPos;
uniform sampler2D uSceneTexture;
uniform vec2 uResolution;

// Beat intensity set to 1 when a new bar begins?
// Will modify slements like # of panels, reflection strength, etc.
uniform float uBeatIntensity;

varying vec3 vNormal;
varying vec3 vWorldPos;

const float GLASS_INCIDENCE = 0.04;
const float REFRACTION_STRENGTH = 0.05;

const float RED_OFFSET = 1.0;
const float GREEN_OFFSET = 1.15;
const float BLUE_OFFSET = 1.2;


float fresnel(const float cosTheta, const float F0) {
    return F0 + (1.0 - F0) * pow(1.0 - cosTheta, 5.0);
}

void main() {
    vec3 normal = normalize(vNormal);
    vec3 viewDir = normalize(uCameraPos - vWorldPos); // outwards towards camera

    // Refraction
    vec2 screenUV = gl_FragCoord.xy / uResolution;
    vec2 offset = normal.xy * REFRACTION_STRENGTH;

    // Testing variation with uBeatIntensity
    float spread = 1.0 + uBeatIntensity * 0.1;

    // Simplified chromatic aberration
    float r = texture2D(uSceneTexture, screenUV + offset * RED_OFFSET * spread).r;
    float g = texture2D(uSceneTexture, screenUV + offset * GREEN_OFFSET * spread).g;
    float b = texture2D(uSceneTexture, screenUV + offset * BLUE_OFFSET * spread).b;
    vec3 refracted = vec3(r, g, b);

    vec3 reflectColour = vec3(0.9);

    float cosTheta = max(dot(normal, viewDir), 0.0);
    float F0 = GLASS_INCIDENCE;
    float fres = fresnel(cosTheta, F0);

    vec3 combinedColour = mix(refracted, reflectColour, fres);

    // Basically invisible view is perpendicular to normal vector
    gl_FragColor = vec4(combinedColour, fres); 

}


