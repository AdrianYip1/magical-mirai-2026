// True on phones and small screens.
export const IS_MOBILE = /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent) || window.innerWidth < 768;

// True on iPhone and iPad, including newer iPads that report as a Mac.
export const IS_IOS = /iPhone|iPad|iPod/i.test(navigator.userAgent) ||
  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

export const PARTICLE_WIDTH = 256;
// How often the reflection cube refreshes. iOS refreshes less often to save work.
export const CUBE_INTERVAL  = IS_IOS ? 6 : 3;
// Whether to draw the outer sphere. iOS skips it because it costs an extra pass.
export const OUTER_SPHERE = !IS_IOS;
