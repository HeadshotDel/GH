// Состояния матча, игровой цикл, эффекты.
import * as S from './settings.js';
import { measure, isLandscape } from './device.js';
import { getTheme } from './themes.js';
import { createRenderer } from './render.js';
import * as P from './physics.js';
import * as A from './audio.js';
import * as HAP from './haptics.js';
import { attachInput } from './input.js';

export function createGame(canvas, probe, hooks) {
  const renderer = createRenderer(canvas);
  let g = null, theme = null, world = null;
  let state = 'menu';            // menu | countdown | play | goal | paused | end
  let score = [0, 0];
  let target = 7, mode = 'goals', timeLeft = 0, suddenDeath = false;
  let cd = 0, cdShown = -1, goalT = 0, lastGoalBy = 0;
  let raf = 0, last = 0, clock = 0;
  let wakeLock = null;

  const fx = { trail: [], rings: [], shake: 0, goalFlash: 0, goalColor: '#fff', pop: [0, 0] };

  /* ---------- геометрия ---------- */
  function buildGeometry() {
    const next = measure(probe);
    if (!next) return false;        // экран ещё не разложен — соберём на следующем кадре
    const prev = world;
    g = next;
    theme = getTheme(S.get().theme);
    document.body.className = theme.bodyClass;
    world = P.createWorld(g, S.SPEEDS[S.get().speed].max);
    renderer.setup(g, theme);
    if (prev) {                        // перенос позиций при смене размера
      const sx = g.W / prev.g.W, sy = g.H / prev.g.H;
      world.puck.x = prev.puck.x * sx; world.puck.y = prev.puck.y * sy;
      world.puck.vx = prev.puck.vx * sx; world.puck.vy = prev.puck.vy * sy;
      for (let i = 0; i < 2; i++) {
        const a = world.paddles[i], b = prev.paddles[i];
        a.x = a.tx = b.x * sx; a.y = a.ty = b.y * sy;
      }
    }
    fx.trail.length = 0;
    // Рисуем сразу: смена размера очищает канвас, и до следующего кадра
    // экран остался бы пустым (на iOS это заметно, когда прячется панель Safari).
    renderer.draw(world, view());
    return true;
  }

  /* ---------- настройки ---------- */
  function applySettings() {
    const s = S.get();
    A.setEnabled(s.sound);
    HAP.setEnabled(s.haptics);
    if (world) world.maxSpeed = S.SPEEDS[s.speed].max;   // скорость применима сразу
    const want = getTheme(s.theme);
    document.body.className = want.bodyClass;
    if (g && theme !== want) {
      theme = want;
      renderer.setup(g, theme);
      renderer.draw(world, view());
    }
    // mode/goals/minutes намеренно не трогаем: они вступают в силу
    // со следующего матча, иначе текущий доигрывался бы по другим правилам.
  }

  function retheme() { buildGeometry(); applySettings(); }

  /* ---------- матч ---------- */
  function newMatch() {
    if (!world && !buildGeometry()) return;   // без геометрии играть не во что
    const s = S.get();
    mode = s.mode; target = s.goals;
    score = [0, 0];
    suddenDeath = false;
    timeLeft = s.minutes * 60;
    P.centerPaddles(world);
    P.serve(world, Math.random() < 0.5 ? 1 : 2);
    fx.trail.length = 0; fx.rings.length = 0;
    fx.shake = 0; fx.goalFlash = 0;
    cd = 3.2; cdShown = -1;
    setState('countdown');
    requestWakeLock();
  }

  function setState(s) { state = s; }

  function pause() {
    if (state !== 'play' && state !== 'countdown' && state !== 'goal') return;
    setState('paused');
    hooks.onPause?.();
  }
  function resume() { if (state === 'paused') { cd = Math.max(cd, 1.6); cdShown = -1; setState('countdown'); } }

  function finish() {
    releaseWakeLock();
    const w = score[0] === score[1] ? 0 : (score[0] > score[1] ? 1 : 2);
    setState('end');
    if (S.get().sound) A.sfxWin();
    HAP.burst(4, 90);
    hooks.onEnd?.(w, score[0], score[1]);
  }

  /* ---------- эффекты ---------- */
  function ring(x, y, color) {
    if (!S.get().flash) return;
    if (fx.rings.length > 14) fx.rings.shift();
    fx.rings.push({ x, y, t: 0, life: 0.34, color });
  }

  function handleEvents(events) {
    const s = S.get();
    for (const e of events) {
      if (e.type === 'paddle') {
        A.sfxPaddle(e.power);
        HAP.tap();
        ring(e.x, e.y, e.player === 1 ? theme.p1 : theme.p2);
      } else if (e.type === 'wall') {
        if (e.power > 180) A.sfxWall(e.power);
        if (e.power > 700) HAP.tap(90);
        if (e.power > 400) ring(e.x, e.y, theme.id === 'ink' ? '#111' : '#ffffff');
      } else if (e.type === 'post') {
        A.sfxPost(e.power);
        HAP.tap(70);
        ring(e.x, e.y, theme.id === 'ink' ? '#111' : '#ffffff');
      } else if (e.type === 'goal') {
        onGoal(e.player);
      }
    }
  }

  function onGoal(player) {
    score[player - 1]++;
    lastGoalBy = player;
    goalT = 0;
    fx.pop[player - 1] = 1;
    fx.goalColor = player === 1 ? theme.p1 : theme.p2;
    if (S.get().flash) fx.goalFlash = 1;
    if (S.get().shake) fx.shake = 1;
    A.sfxGoal();
    HAP.burst(3, 70);
    setState('goal');
    hooks.onGoal?.(player, score[0], score[1]);
  }

  function matchOver() {
    if (suddenDeath) return true;
    if (mode === 'goals') return score[0] >= target || score[1] >= target;
    return false;
  }

  /* ---------- цикл ---------- */
  function update(dt) {
    clock += dt;
    // затухание эффектов
    fx.shake = Math.max(0, fx.shake - dt * 2.2);
    fx.goalFlash = Math.max(0, fx.goalFlash - dt * 2.6);
    fx.pop[0] = Math.max(0, fx.pop[0] - dt * 2.4);
    fx.pop[1] = Math.max(0, fx.pop[1] - dt * 2.4);
    for (let i = fx.rings.length - 1; i >= 0; i--) {
      fx.rings[i].t += dt;
      if (fx.rings[i].t >= fx.rings[i].life) fx.rings.splice(i, 1);
    }
    for (let i = fx.trail.length - 1; i >= 0; i--) {
      fx.trail[i].a -= dt * 3.4;
      if (fx.trail[i].a <= 0) fx.trail.splice(i, 1);
    }

    if (state === 'countdown') {
      cd -= dt;
      const n = Math.ceil(cd);
      if (n !== cdShown && n >= 1 && n <= 3) { cdShown = n; A.sfxTick(false); }
      if (cd <= 0) { A.sfxTick(true); setState('play'); }
      P.stepPaddles(world);                // биты уже слушаются пальцев, шайба ждёт
      return;
    }

    if (state === 'play') {
      const ev = [];
      P.stepFrame(world, dt, ev);
      handleEvents(ev);
      if (S.get().trail) {
        const sp = Math.hypot(world.puck.vx, world.puck.vy);
        if (sp > 160) fx.trail.push({ x: world.puck.x, y: world.puck.y, a: 1 });
        if (fx.trail.length > 22) fx.trail.shift();
      }
      if (mode === 'time' && !suddenDeath) {
        timeLeft -= dt;
        if (timeLeft <= 0) {
          timeLeft = 0;
          if (score[0] === score[1]) { suddenDeath = true; hooks.onSuddenDeath?.(); }
          else finish();
        }
      }
      return;
    }

    if (state === 'goal') {
      goalT += dt;
      const ev = [];
      P.stepFrame(world, dt, ev);          // шайба доезжает в створ и гаснет
      if (goalT > 1.35) {
        if (matchOver()) finish();
        else { P.serve(world, P.nextServeTo(lastGoalBy)); cd = 1.8; cdShown = -1; setState('countdown'); }
      }
    }
  }

  function view() {
    return {
      score1: score[0], score2: score[1],
      pop1: fx.pop[0], pop2: fx.pop[1],
      mode, timeLeft, clock,
      trail: fx.trail, rings: fx.rings,
      shake: fx.shake, goalFlash: fx.goalFlash, goalColor: fx.goalColor,
      countdown: state === 'countdown' ? Math.ceil(cd) : 0,
    };
  }

  function frame(now) {
    raf = requestAnimationFrame(frame);
    // Геометрию могло не получиться собрать при запуске (вкладка была свёрнута,
    // экран ещё не разложен). Пробуем каждый кадр, пока не выйдет.
    if (!world && !buildGeometry()) return;
    if (!world) return;
    const dt = last ? Math.min(0.05, (now - last) / 1000) : 0;
    last = now;
    if (dt > 0) update(dt);
    renderer.draw(world, view());
  }

  /* ---------- экран не должен гаснуть ---------- */
  async function requestWakeLock() {
    try { if ('wakeLock' in navigator) wakeLock = await navigator.wakeLock.request('screen'); } catch (e) { /* не критично */ }
  }
  function releaseWakeLock() { try { wakeLock?.release(); } catch (e) {} wakeLock = null; }

  /* ---------- запуск ---------- */
  function init() {
    buildGeometry();
    applySettings();
    // 'goal' тоже считается игровым: иначе палец, опущенный во время паузы
    // после гола, не «подхватится» — событие pointerdown уже не повторится.
    attachInput(canvas, () => world, () => A.unlock(), () => state === 'play' || state === 'countdown' || state === 'goal');

    let rt = 0;
    const onResize = () => { clearTimeout(rt); rt = setTimeout(() => { buildGeometry(); applySettings(); hooks.onResize?.(isLandscape()); }, 140); };
    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', onResize);
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) pause();
      else if (wakeLock === null && state === 'play') requestWakeLock();
    });

    raf = requestAnimationFrame(frame);
  }

  return {
    init, newMatch, pause, resume, applySettings, retheme,
    get state() { return state; },
    get score() { return score; },
    get suddenDeath() { return suddenDeath; },
  };
}
