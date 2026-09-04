import * as S from './settings.js';
import * as HAP from './haptics.js';
import { createGame } from './game.js';
import { createUI } from './ui.js';
import { isLandscape } from './device.js';

S.load();
HAP.init();

const canvas = document.getElementById('game');
const probe = document.getElementById('safe-probe');

const hooks = {};
const game = createGame(canvas, probe, hooks);
const ui = createUI(game);

hooks.onGoal = (p) => ui.onGoal(p);
hooks.onEnd = (w, a, b) => ui.onEnd(w, a, b);
hooks.onSuddenDeath = () => ui.onSuddenDeath();
hooks.onResize = (ls) => ui.onOrientation(ls);
hooks.onPause = () => ui.onPause();

game.init();
ui.onOrientation(isLandscape());

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => { /* офлайн просто не включится */ });
  });
}
