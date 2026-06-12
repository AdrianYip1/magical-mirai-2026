export const IS_MOBILE = /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent) || window.innerWidth < 768;

// iPadOS reports 'MacIntel' with touch points — catch it alongside iPhone/iPod.
export const IS_IOS = /iPhone|iPad|iPod/i.test(navigator.userAgent) ||
  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

export const PARTICLE_WIDTH = 256;
export const CUBE_INTERVAL  = IS_IOS ? 6 : 3;   // iOS Safari: halve cube-camera updates
export const OUTER_SPHERE   = !IS_IOS;            // outer sphere costs a full extra cube pass
