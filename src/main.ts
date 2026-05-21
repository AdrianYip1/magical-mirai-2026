import './style.css';
import { Player, IPlayerApp, IPhrase, IBeat } from 'textalive-app-api';
import { canvas, canvasWrapper, animate, glassInnerUniforms, glassOuterUniforms, sphereMesh } from './renderer';
import { buildConvexGeometry, MIN_VERTS, MAX_VERTS, VERT_STEP } from './sphere';
import { initLyrics, setLyric } from './lyrics';
import { mountSongSelection } from './songSelect';

animate();

let timerReady = false;
document.getElementById('play')!.addEventListener('click', () => {
  if (timerReady) player.requestPlay();
});

const player = new Player({
  app: { token: import.meta.env.VITE_TEXTALIVE_TOKEN ?? '' },
  mediaElement: document.createElement('audio'),
});

mountSongSelection(canvasWrapper, undefined, (song) => {
  canvas.style.display = 'block';
  player.createFromSongUrl(song.url, { video: song.videoIds ?? {} });
});

let currentPhrase: IPhrase | null = null;
let currentBeat: IBeat | null = null;
let currentVerts = MIN_VERTS;

initLyrics(() => {
  if (currentPhrase) setLyric(currentPhrase.text);
});

player.addListener({
  onAppReady(_app: IPlayerApp) {},

  onVideoReady() {
    console.log('[TextAlive] video ready');
  },

  onTimerReady() {
    console.log('[TextAlive] timer ready');
    timerReady = true;
  },

  onTimeUpdate(position: number) {
    if (!player.video) return;

    const beat = player.findBeat(position);
    if (beat !== currentBeat) {
      currentBeat = beat;
      glassInnerUniforms.uBeatIntensity.value = 1.0;
      glassOuterUniforms.uBeatIntensity.value = 1.0;
      currentVerts = currentVerts >= MAX_VERTS ? MIN_VERTS : currentVerts + VERT_STEP;
      sphereMesh.geometry.dispose();
      sphereMesh.geometry = buildConvexGeometry(currentVerts);
    }

    const phrase = player.video.findPhrase(position);
    if (phrase !== currentPhrase) {
      currentPhrase = phrase;
      setLyric(phrase ? phrase.text : '');
      console.log('[lyric]', phrase?.text ?? '');
    }
  },
});
