// Весь DOM-слой: экраны, настройки, кнопки. Стартовый и финальный экраны
// продублированы и перевёрнуты — их читают оба игрока со своих сторон.
import * as S from './settings.js';
import * as HAP from './haptics.js';
import * as A from './audio.js';

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

  function modeLabel() {
    const s = S.get();
    return s.mode === 'goals' ? `до ${s.goals} голов` : `${s.minutes} мин`;
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
        A.sfxUi();
        after?.();
      });
    });
  }
  function paintSeg(id, key) {
    const v = String(S.get()[key]);
    $(id).querySelectorAll('.seg-i').forEach((b) =>
      b.setAttribute('aria-checked', String(b.dataset.v === v)));
  }

  // Мастер-тумблер считает только те эффекты, которые на этом устройстве
  // вообще возможны: иначе без вибрации «все эффекты» не включались бы никогда.
  const fxKeys = () => S.FX_KEYS.filter((k) => k !== 'haptics' || HAP.isSupported());

  const swIds = {
    sound: 'set-sound', haptics: 'set-haptics', trail: 'set-trail',
    flash: 'set-flash', shake: 'set-shake',
  };

  function paint() {
    paintSeg('set-theme', 'theme');
    paintSeg('set-mode', 'mode');
    paintSeg('set-goals', 'goals');
    paintSeg('set-minutes', 'minutes');
    paintSeg('set-speed', 'speed');
    const s = S.get();
    $('set-goals').hidden = s.mode !== 'goals';
    $('set-minutes').hidden = s.mode !== 'time';
    for (const [k, id] of Object.entries(swIds)) $(id).checked = s[k];
    $('test-haptic').disabled = !HAP.isSupported() || !s.haptics;
    $('set-fx-master').checked = fxKeys().every((k) => s[k]);
    refreshModeLabels();
  }

  function wireSettings() {
    seg('set-theme', 'theme', String, () => game.retheme());
    seg('set-mode', 'mode');
    seg('set-goals', 'goals', Number);
    seg('set-minutes', 'minutes', Number);
    seg('set-speed', 'speed', String, () => game.applySettings());

    for (const [k, id] of Object.entries(swIds)) {
      $(id).addEventListener('change', (e) => {
        S.set({ [k]: e.target.checked });
        game.applySettings();
        paint();
        if (k === 'haptics' && e.target.checked) HAP.tapNow();
      });
    }
    $('set-fx-master').addEventListener('change', (e) => {
      const on = e.target.checked;
      S.set(Object.fromEntries(fxKeys().map((k) => [k, on])));
      game.applySettings();
      paint();
    });

    const note = $('haptic-note');
    if (!HAP.isSupported()) {
      note.textContent = 'на этом устройстве недоступна';
      $('set-haptics').disabled = true;
      $('test-haptic').disabled = true;
      S.set({ haptics: false });          // иначе тумблер горит, а отклика нет
    } else {
      note.textContent = 'короткий системный тик — сильнее iOS не даёт';
    }
    // Раньше кнопка принудительно включала вибрацию и била по API напрямую —
    // и потому «работала» даже когда игра молчала. Теперь она гаснет вместе
    // с тумблером и использует тот же fire(), что и удары по шайбе.
    $('test-haptic').addEventListener('click', () => {
      HAP.tapNow();
      setTimeout(() => HAP.tapNow(), 90);
      setTimeout(() => HAP.tapNow(), 180);
    });
  }

  /* ---------- навигация ---------- */
  function toStart() { hideAll(); showPauseBtns(false); show(scr.start, true); refreshModeLabels(); }
  function toSettings(from) { settingsFrom = from; hideAll(); showPauseBtns(false); paint(); show(scr.settings, true); }

  scr.start.addEventListener('click', (e) => {
    if (e.target.closest('#open-settings')) return;
    A.unlock();          // iOS отдаёт звук только из обработчика жеста
    hideAll(); showPauseBtns(true); game.newMatch();
  });
  $('open-settings').addEventListener('click', (e) => { e.stopPropagation(); A.sfxUi(); toSettings('start'); });

  function showPause() { hideAll(); showPauseBtns(false); show(scr.pause, true); }
  pauseBtns.forEach((b) => b.addEventListener('click', () => { A.sfxUi(); game.pause(); }));
  $('resume').addEventListener('click', () => { A.sfxUi(); hideAll(); showPauseBtns(true); game.resume(); });
  $('restart').addEventListener('click', () => { A.sfxUi(); hideAll(); showPauseBtns(true); game.newMatch(); });
  $('to-settings').addEventListener('click', () => { A.sfxUi(); toSettings('pause'); });
  $('close-settings').addEventListener('click', () => {
    A.sfxUi();
    if (settingsFrom === 'pause') { hideAll(); showPauseBtns(false); show(scr.pause, true); }
    else toStart();
  });
  document.querySelectorAll('.rematch').forEach((b) => b.addEventListener('click', () => {
    A.sfxUi(); hideAll(); showPauseBtns(true); game.newMatch();
  }));

  /* ---------- реакции на игру ---------- */
  function onGoal(player) {
    const el = player === 1 ? $('goal-word-top') : $('goal-word-bottom');
    const other = player === 1 ? $('goal-word-bottom') : $('goal-word-top');
    other.textContent = '';
    el.textContent = game.suddenDeath ? 'ЗОЛОТОЙ ГОЛ' : 'ГОЛ';
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
