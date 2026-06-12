uniform samplerCube uEnvMap;
uniform sampler2D uColorTex;

varying float vAge;
varying float vHue;
varying vec3 vWorldPos;
varying vec2 vTexUv;

const float GLASS_INCIDENCE = 0.15;

float fresnel(const float cosTheta, const float F0) {
    return F0 + (1.0 - F0) * pow(1.0 - cosTheta, 5.0);
}

void main() {
    vec2 uv = gl_PointCoord * 2.0 - 1.0;
    float r2 = dot(uv, uv);
    if (r2 > 1.0) discard;
    vec3 normal = vec3(uv, sqrt(1.0 - r2));

    vec3 viewDir = normalize(cameraPosition - vWorldPos);
    vec3 reflectDir = reflect(-viewDir, normal);
    vec3 reflectColour = textureCube(uEnvMap, reflectDir).rgb;

    float cosTheta = dot(normal, viewDir);
    float fres = fresnel(cosTheta, GLASS_INCIDENCE);

    vec4 cardColor = texture2D(uColorTex, vTexUv);
    vec3 finalColor;
    if (cardColor.a > 0.5) {
        finalColor = mix(cardColor.rgb * 1.2, reflectColour, fres * 0.4);
    } else {
        vec3 holoColor = 0.5 + 0.5 * cos(6.28318 * (vHue + vec3(0.0, 0.333, 0.667)));
        finalColor = mix(holoColor * 0.3, reflectColour, fres);
    }

    float age = 1.0 - smoothstep(0.7, 1.0, vAge);
    gl_FragColor = vec4(finalColor, age);
}
