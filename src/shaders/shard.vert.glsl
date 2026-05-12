// Per-shard data passed from CPU once at shatter time
attribute vec3 aOrigin;       // world position when shard was created
attribute vec3 aVelocity;     // initial velocity (m/s equivalent)
attribute vec3 aAngularVel;   // rotation speed per axis
attribute vec4 aUvCrop;       // xy = offset, zw = scale within lyric texture

uniform float uTime;          // seconds since shatter started
uniform float uProgress;      // 0 = scattered, 1 = reformed (for reform lerp)

varying vec2 vUv;

void main() {
  // Physics in the vertex shader — no CPU update per frame
  vec3 pos = aOrigin + aVelocity * uTime - vec3(0.0, 0.5 * 9.8 * uTime * uTime, 0.0);

  // UV crop: map the shard's local [0,1] UV into its slice of the lyric texture
  vUv = aUvCrop.xy + uv * aUvCrop.zw;

  gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
}
