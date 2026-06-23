# Architecture

This is a quick guide of how our project is put together and where to look when you want to change something.

## What it's built with

The app runs in the browser and is drawn with [Three.js](https://threejs.org/), which does all the WebGL rendering. The code is written in [TypeScript](https://www.typescriptlang.org/), the look of the aurora, glass and particles is written in [GLSL](https://www.khronos.org/opengl/wiki/Core_Language_(GLSL)) shaders, and everything is bundled and served by [Vite](https://vite.dev/) during development and for the final build.

A few other pieces do specific jobs:

- The [TextAlive App API](https://developer.textalive.jp/) handles song playback and tells us the timing of every word in the lyrics, so the particles know when to form each line. The setup lives in [lyrics.ts](../src/lyrics.ts).
- [troika-three-text](https://github.com/protectwise/troika/tree/main/packages/troika-three-text) provides the 3D mesh the lyrics converge into.
- [opentype.js](https://opentype.js.org/) reads the font files so we can scatter points across the shape of each letter and turn the words into particles.
- The aurora background and the reflective sphere are written as small GLSL shaders, which live in [src/shaders](../src/shaders).


## How the files are laid out

### Top level
    .
    ├── public/                 # Things served as-is: fonts, the screenshots, the typeface file
    │   └── assets/             # Song card art and screenshots
    ├── scripts/                # Small helper scripts
    ├── src/                    # All the app code (see below)
    ├── index.html              # The page that loads the app
    ├── vite.config.ts          # Vite settings
    ├── tsconfig.json           # TypeScript settings
    └── ...                     # A few other config files

### Inside src

    src/
    ├── main.ts              # Sets up the scene, runs the
    │                        # animation loop, and decides which page is showing.
    ├── renderer.ts          # The shared renderer, canvas, scene and render targets
    │                        # that the rest of the code draws into.
    │
    │   # Scene background (using GLSL shaders)
    ├── shaders/             # GLSL shaders that run per vertex
    │   ├── aurora.vert      # The shape of the aurora background
    │   ├── aurora.frag      # The colours and glow of the aurora
    │   ├── glass.frag       # Physics Based Rendering (PBR) of glass including Fresnel and Internal Refraction
    │   ├── water.frag       # The water reflection on the floor
    │   ├── lyric-glass.vert # The shape of the glassy lyric panels
    │   ├── lyric-glass.frag # The glassy look of the lyric panels
    │   ├── particles/       # Shaders for the particles, which use FBM and Perlin Noise
    │   │   ├── sim.vert     # Steps the particle simulation forward
    │   │   ├── sim.frag     # Works out where each particle moves to
    │   │   ├── render.vert  # Places each particle on screen
    │   │   └── render.frag  # Draws each particle
    │   └── glsl.d.ts        # Lets the shader files be imported as text
    ├── aurora.ts            # Aurora background, moving
    ├── particles.ts         # The field of light particles the lyrics converge from
    ├── sphere.ts            # Builds the sphere shapes used in the menu
    ├── menuReflect.ts       # Renders the menu into a texture so it can be reflected
    │
    │   # Main menu
    ├── sphereSelect.ts      # The spinning sphere you pick a song from
    ├── sphereSelect.css     # Styles for that song picker
    ├── songSelect.ts        # The logic behind choosing a song
    ├── songs.ts             # The list of songs in the app
    ├── procThumb.ts         # Draws each song card by hand in code
    ├── previewAudio.ts      # Plays a short preview clip when you hover a song
    │
    │   # Lyrics
    ├── lyrics.ts            # TextAlive, loads the font, and turns
    │                        # each word into a shape of particles
    │
    │   # Settings
    ├── settings.ts          # Saves and reads your settings, like reading aids
    ├── settingsScene.ts     # The settings page and how you move in and out of it
    │
    │   # Languages
    ├── language.ts          # Keeps track of the current language
    ├── languageScene.ts     # The language picker page
    │
    │   # Helper Functions
    ├── volume.ts            # Saves and reads the volume
    ├── perf.ts              # Works out if you are on a phone or iOS to
    │                        # turn down some effects to keep it smooth
    └── style.css            # General page styles
