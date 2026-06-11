export const IS_MOBILE      = /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent) || window.innerWidth < 768;
export const PARTICLE_WIDTH = IS_MOBILE ? 128 : 256;
export const CUBE_INTERVAL  = IS_MOBILE ? 8 : 3;
export const OUTER_SPHERE   = !IS_MOBILE;
