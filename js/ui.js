// Весь DOM-слой: экраны, настройки, кнопки. Стартовый и финальный экраны
// продублированы и перевёрнуты — их читают оба игрока со своих сторон.
import * as S from './settings.js';
import * as HAP from './haptics.js';
import * as A from './audio.js';

// Единственный контекст, в котором iOS отдаёт тактильный отклик, — жест
// пользователя. Подробности и замер: js/haptics.js.
const click = () => { A.sfxUi(); HAP.tap(); };

const $ = (id) => document.getElementById(id);
const show = (el, on) => { if (el) on ? el.setAttribute('data-open', '') : el.removeAttribute('data-open'); };

export function createUI(game) {
  const scr = {
    start: $('screen-start'), pause: $('screen-pause'), settings: $('screen-settings'),
    goal: $('screen-goal'), end: $('screen-end'), rotate: $('screen-rotate'),
  };
  const pauseBtns = [$('pause-bottom')];
  let settingsFrom = 'start';
  let goalTimer = 0;

  function hideAll() { Object.values(scr).forEach((s) => show(s, false)); }
  function showPauseBtns(on) { pauseBtns.forEach((b) => show(b, on)); }

  const LEVEL_NAMES = { easy: 'лёгкий', normal: 'средний', hard: 'сложный' };

  function modeLabel() {
    const s = S.get();
    const rules = s.mode === 'goals' ? `до ${s.goals} голов` : `${s.minutes} мин`;
    return s.opponent === 'bot' ? `бот · ${LEVEL_NAMES[s.botLevel]} · ${rules}` : rules;
  }
  function refreshModeLabels() {
    document.querySelectorAll('[data-mode-label]').forEach((e) => { e.textContent = modeLabel(); });
  }

  /* ---------- сегменты ---------- */
  function seg(id, key, cast = String, after) {
    const box = $(id);
    box.querySelectorAll('.seg-i').forEach((b) => {
      b.addEventListener('click', () => {
        S.set({ [key]: cast(b.dataset.v) });
        paint();
        click();
        after?.();
      });
    });
  }
  function paintSeg(id, key) {
    const v = String(S.get()[key]);
    $(id).querySelectorAll('.seg-i').forEach((b) =>
      b.setAttribute('aria-checked', String(b.dataset.v === v)));
  }

  const swIds = {
    sound: 'set-sound', trail: 'set-trail',
    flash: 'set-flash', shake: 'set-shake',
  };

  function paint() {
    paintSeg('set-theme', 'theme');
    paintSeg('set-opponent', 'opponent');
    paintSeg('set-bot-level', 'botLevel');
    paintSeg('set-mode', 'mode');
    paintSeg('set-goals', 'goals');
    paintSeg('set-minutes', 'minutes');
    paintSeg('set-speed', 'speed');
    const s = S.get();
    $('set-bot-level').hidden = s.opponent !== 'bot';
    $('set-goals').hidden = s.mode !== 'goals';
    $('set-minutes').hidden = s.mode !== 'time';
    for (const [k, id] of Object.entries(swIds)) $(id).checked = s[k];
    $('set-fx-master').checked = S.FX_KEYS.every((k) => s[k]);
    refreshModeLabels();
  }

  function wireSettings() {
    seg('set-theme', 'theme', String, () => game.retheme());
    seg('set-opponent', 'opponent');
    seg('set-bot-level', 'botLevel');
    seg('set-mode', 'mode');
    seg('set-goals', 'goals', Number);
    seg('set-minutes', 'minutes', Number);
    seg('set-speed', 'speed', String, () => game.applySettings());

    for (const [k, id] of Object.entries(swIds)) {
      $(id).addEventListener('change', (e) => {
        S.set({ [k]: e.target.checked });
        game.applySettings();
        paint();
      });
    }
    $('set-fx-master').addEventListener('change', (e) => {
      const on = e.target.checked;
      S.set(Object.fromEntries(S.FX_KEYS.map((k) => [k, on])));
      game.applySettings();
      paint();
    });

  }

  /* ---------- навигация ---------- */
  function toStart() { hideAll(); showPauseBtns(false); show(scr.start, true); refreshModeLabels(); }
  function toSettings(from) { settingsFrom = from; hideAll(); showPauseBtns(false); paint(); show(scr.settings, true); }

  scr.start.addEventListener('click', (e) => {
    const b = e.target.closest('[data-start]');
    if (!b) return;                       // мимо кнопок — ничего не запускаем
    A.unlock();          // iOS отдаёт звук только из обработчика жеста
    HAP.tap();
    S.set({ opponent: b.dataset.start });
    refreshModeLabels();
    hideAll(); showPauseBtns(true); game.newMatch();
  });
  $('open-settings').addEventListener('click', (e) => { e.stopPropagation(); click(); toSettings('start'); });

  function showPause() { hideAll(); showPauseBtns(false); show(scr.pause, true); }
  pauseBtns.forEach((b) => b.addEventListener('click', () => { click(); game.pause(); }));
  $('resume').addEventListener('click', () => { click(); hideAll(); showPauseBtns(true); game.resume(); });
  $('restart').addEventListener('click', () => { click(); hideAll(); showPauseBtns(true); game.newMatch(); });
  $('to-settings').addEventListener('click', () => { click(); toSettings('pause'); });
  $('close-settings').addEventListener('click', () => {
    click();
    if (settingsFrom === 'pause') { hideAll(); showPauseBtns(false); show(scr.pause, true); }
    else toStart();
  });
  document.querySelectorAll('.rematch').forEach((b) => b.addEventListener('click', () => {
    click(); hideAll(); showPauseBtns(true); game.newMatch();
  }));

  /* ---------- реакции на игру ---------- */
  function onGoal(player) {
    // С ботом наверху никого нет: пишем всё на половине человека, но говорим,
    // чей это гол — иначе вспышка непонятно кого поздравляет.
    const vsBot = game.vsBot;
    const el = (!vsBot && player === 1) ? $('goal-word-top') : $('goal-word-bottom');
    const other = el === $('goal-word-top') ? $('goal-word-bottom') : $('goal-word-top');
    other.textContent = '';
    el.textContent = game.suddenDeath ? 'ЗОЛОТОЙ ГОЛ' : (vsBot && player === 1 ? 'ГОЛ БОТА' : 'ГОЛ');
    show(scr.goal, true);
    requestAnimationFrame(() => el.classList.add('show'));
    clearTimeout(goalTimer);
    goalTimer = setTimeout(() => { el.classList.remove('show'); show(scr.goal, false); }, 1200);
  }

  function onEnd(winner, s1, s2) {
    showPauseBtns(false);
    const t = { top: $('end-title-top'), bottom: $('end-title-bottom') };
    const sc = { top: $('end-score-top'), bottom: $('end-score-bottom') };
    if (winner === 0) { t.top.textContent = t.bottom.textContent = 'НИЧЬЯ'; }
    else {
      t.top.textContent = winner === 1 ? 'ПОБЕДА' : 'ПОРАЖЕНИЕ';
      t.bottom.textContent = winner === 2 ? 'ПОБЕДА' : 'ПОРАЖЕНИЕ';
    }
    sc.top.textContent = `${s1} : ${s2}`;      // у каждого свой счёт первым
    sc.bottom.textContent = `${s2} : ${s1}`;
    hideAll(); show(scr.end, true);
  }

  function onSuddenDeath() {
    const el = $('goal-word-bottom');
    $('goal-word-top').textContent = 'ЗОЛОТОЙ ГОЛ';
    el.textContent = 'ЗОЛОТОЙ ГОЛ';
    show(scr.goal, true);
    requestAnimationFrame(() => { el.classList.add('show'); $('goal-word-top').classList.add('show'); });
    setTimeout(() => {
      el.classList.remove('show'); $('goal-word-top').classList.remove('show');
      show(scr.goal, false);
    }, 1500);
  }

  function onOrientation(landscape) {
    if (landscape) { show(scr.rotate, true); game.pause(); return; }
    show(scr.rotate, false);
    if (game.state === 'paused') showPause();   // вернулись в портрет — покажем, что игра на паузе
  }

  wireSettings();
  paint();
  toStart();

  return { onGoal, onEnd, onSuddenDeath, onOrientation, onPause: showPause };
}
