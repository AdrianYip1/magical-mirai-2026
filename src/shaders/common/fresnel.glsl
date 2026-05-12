// Fresnel approximation — bright at glancing angles, dim straight-on.
// normal and viewDir must both be normalized.
float fresnel(vec3 normal, vec3 viewDir) {
  return pow(1.0 - dot(normal, viewDir), 3.0);
}
