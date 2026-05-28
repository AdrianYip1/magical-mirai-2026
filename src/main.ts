import './style.css';
import { Player, IPlayerApp, IWord, IPhrase, IBeat, IChar } from 'textalive-app-api';
import { canvas, animate, glassInnerUniforms, glassOuterUniforms, renderer, scene, cubeCamera, cubeLargeCamera, triggerBeat } from './renderer';
import { mountSphereSongSelect } from './sphereSelect';
import songs from './songs';
import { initLyrics, setWord, setChar, buildLayout } from './lyrics';

let fontReady = false;
let videoReady = false;

cubeCamera.update(renderer, scene);
cubeLargeCamera.update(renderer, scene);
animate();

let timerReady = false;
document.getElementById('play')!.addEventListener('click', () => {
  if (timerReady) player.requestPlay();
});

const player = new Player({
  app: { token: import.meta.env.VITE_TEXTALIVE_TOKEN ?? '' },
  mediaElement: document.createElement('audio'),
});

mountSphereSongSelect(songs, (song) => {
  canvas.style.display = 'block';
  player.createFromSongUrl(song.url, { video: song.videoIds ?? {} });
});

let currentWord:   IWord   | null = null;
let currentChar:   IChar   | null = null;
let currentPhrase: IPhrase | null = null;
let currentBeat:   IBeat   | null = null;

 initLyrics(() => {
    fontReady = true;
    if (videoReady) buildLayout(player.video!.phrases);
  });

player.addListener({
  onAppReady(_app: IPlayerApp) {},

  onVideoReady() {
    videoReady = true;
    if (fontReady) buildLayout(player.video!.phrases);
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
      if (player.findChorus(position)) triggerBeat(1.0);
    }

    const phrase = player.video.findPhrase(position);
    if (phrase !== currentPhrase) {
      currentPhrase = phrase;
    }

    const word = player.video.findWord(position);
    if (word !== currentWord) {
      currentWord = word;
      if (word) setWord(word);
    }

    const char = player.video.findChar(position);
    if (char !== currentChar) {
      currentChar = char;
      if (char) setChar(char);
    }
  }
});
