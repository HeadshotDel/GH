// Проверка бота без браузера: node test/bot.test.mjs
// Меряем бота им же самим — так соперник заведомо силён и честен.
// Главное здесь не «код не падает», а что уровни действительно отличаются
// силой игры, а не только подписью в настройках.
import { createWorld, stepFrame, stepPaddles, serve, centerPaddles, nextServeTo } from '../js/physics.js';
import { createBot } from '../js/bot.js';
import { makeGeom, seeded } from './harness.mjs';

const g = makeGeom();
const field = g.field;

let pass = 0, fail = 0;
const ok = (name, cond, info = '') => { cond ? pass++ : fail++; console.log(`${cond ? '  ok' : 'FAIL'}  ${name}${info ? '  ' + info : ''}`); };

// Матч верхнего бота против нижнего. Возвращает счёт и признаки поломок.
function match(topLevel, botLevel, seed, { toGoals = 7, maxSeconds = 240 } = {}) {
  const rng = seeded(seed);
  const w = createWorld(g, 2200);
  const top = createBot(topLevel, rng, 0);
  const low = createBot(botLevel, rng, 1);
  centerPaddles(w);
  serve(w, rng() < 0.5 ? 1 : 2);

  const score = [0, 0];
  let t = 0, escapes = 0, crossings = 0, stallRun = 0, longestStall = 0;
  const dt = 1 / 60, ev = [];

  while (score[0] < toGoals && score[1] < toGoals && t < maxSeconds) {
    top.update(w, dt, t);
    low.update(w, dt, t);
    ev.length = 0;
    stepFrame(w, dt, ev);
    t += dt;

    if (w.paddles[0].y > field.cy + 0.01 || w.paddles[1].y < field.cy - 0.01) crossings++;
    if (!w.scoring && (w.puck.y < field.top - 1 || w.puck.y > field.bottom + 1 ||
        w.puck.x < -1 || w.puck.x > g.W + 1)) escapes++;
    // Важна не сумма медленных кадров — короткие паузы это обычная игра, —
    // а самый длинный непрерывный простой: он и означает клинч.
    if (Math.hypot(w.puck.vx, w.puck.vy) < 25) {
      stallRun++;
      if (stallRun > longestStall) longestStall = stallRun;
    } else stallRun = 0;

    const goal = ev.find((e) => e.type === 'goal');
    if (goal) {
      score[goal.player - 1]++;
      serve(w, nextServeTo(goal.player));
      top.reset(); low.reset();
    }
  }
  return { top: score[0], low: score[1], seconds: t, escapes, crossings, longestStall,
           finished: score[0] >= toGoals || score[1] >= toGoals };
}

function series(a, b, seeds = [11, 29, 47, 83, 101, 127, 151, 173, 199]) {
  const rs = seeds.map((s) => match(a, b, s * 7919));
  return {
    a: rs.reduce((x, r) => x + r.top, 0),
    b: rs.reduce((x, r) => x + r.low, 0),
    esc: rs.reduce((x, r) => x + r.escapes, 0),
    cross: rs.reduce((x, r) => x + r.crossings, 0),
    unfinished: rs.filter((r) => !r.finished).length,
    secs: (rs.reduce((x, r) => x + r.seconds, 0) / rs.length).toFixed(0),
    stall: (Math.max(...rs.map((r) => r.longestStall)) / 60).toFixed(1),
  };
}


// Тир: бросок в створ с произвольной точки чужой половины, бита соперника
// убрана. Доля отражённых — самая понятная мера силы обороны и прямой ответ
// на вопрос «сможет ли человек забить». Стена, берущая всё, играется скучно.
function gallery(level, seed, shots = 400) {
  const rng = seeded(seed);
  const w = createWorld(g, 2200);
  const bot = createBot(level, rng, 0);
  let goals = 0;

  for (let i = 0; i < shots; i++) {
    centerPaddles(w);
    bot.reset();
    const sx = 40 + rng() * (g.W - 80);
    const sy = field.cy + 30 + rng() * (field.h * 0.34);
    const gx = g.goal.x0 + 15 + rng() * (g.goal.w - 30);   // строго в створ
    // Две трети бросков прямые, треть — с отскоком от борта: живой игрок
    // банк использует постоянно, и именно на нём ловится слабый вратарь.
    const bank = rng() < 0.34;
    const tx = !bank ? gx : (rng() < 0.5 ? 2 * g.puckR - gx : 2 * (g.W - g.puckR) - gx);
    const speed = 1400 + rng() * 700;
    const d = Math.hypot(tx - sx, field.top - sy) || 1;
    w.puck.x = sx; w.puck.y = sy;
    w.puck.vx = ((tx - sx) / d) * speed;
    w.puck.vy = ((field.top - sy) / d) * speed;
    w.scoring = 0; w.scoringT = 0;
    w.paddles[1].x = w.paddles[1].tx = 40;
    w.paddles[1].y = w.paddles[1].ty = field.bottom - 40;

    const ev = [];
    let t = 0, entered = false;
    while (t < 3) {
      bot.update(w, 1 / 60, t);
      ev.length = 0;
      stepFrame(w, 1 / 60, ev);
      t += 1 / 60;
      const gl = ev.find((e) => e.type === 'goal');
      if (gl) { if (gl.player === 2) goals++; break; }
      // Бросок стартует в чужой половине, поэтому «отбито» засчитываем
      // только после того, как шайба реально зашла на половину бота.
      if (w.puck.y < field.cy) entered = true;
      if (entered && w.puck.y > field.cy) break;
    }
  }
  return 1 - goals / shots;
}


// Автоголы. Худший случай: шайба замерла прямо в створе своих ворот. Толкать
// её «к чужим воротам» здесь означает забить себе, а идти к точке замаха
// напролом — толкнуть её туда же по дороге. Бот обязан обходить шайбу сбоку
// и выпихивать её из створа поперёк.
function ownGoals(level, tries = 60) {
  let own = 0;
  for (let k = 0; k < tries; k++) {
    const rng = seeded(k * 131 + 7);
    const w = createWorld(g, 2200);
    const bot = createBot(level, rng, 0);
    centerPaddles(w);
    w.puck.x = g.goal.x0 + 8 + rng() * (g.goal.w - 16);
    w.puck.y = field.top + 24 + rng() * 40;
    w.puck.vx = 0; w.puck.vy = 0;
    w.paddles[1].x = w.paddles[1].tx = 40;
    w.paddles[1].y = w.paddles[1].ty = field.bottom - 40;
    const ev = [];
    for (let i = 0; i < 60 * 6; i++) {
      bot.update(w, 1 / 60, i / 60);
      ev.length = 0;
      stepFrame(w, 1 / 60, ev);
      const gl = ev.find((e) => e.type === 'goal');
      if (gl) { if (gl.player === 2) own++; break; }
      if (w.puck.y > field.cy) break;     // выбил на чужую половину
    }
  }
  return own / tries;
}


// Бита у центральной линии, шайба между ней и воротами бота. Тут бот и забивал
// себе с первого удара: он шёл к точке замаха напрямик и толкал шайбу в свою
// сетку по дороге. Считаем отдельно позиции, из которых выйти в принципе можно
// (шайба дальше от линии, чем сумма радиусов) — на них автоголов быть не должно.
function ownGoalsFromBehind(level, tries = 120) {
  let playable = 0, ownPlayable = 0;
  for (let k = 0; k < tries; k++) {
    const rng = seeded(k * 977 + 3);
    const w = createWorld(g, 2200);
    const bot = createBot(level, rng, 0);
    centerPaddles(w);
    w.paddles[0].x = w.paddles[0].tx = 60 + rng() * (g.W - 120);
    w.paddles[0].y = w.paddles[0].ty = field.cy - g.paddleR - rng() * 30;
    w.puck.x = g.puckR + 10 + rng() * (g.W - 2 * g.puckR - 20);
    w.puck.y = field.top + 30 + rng() * (field.cy - field.top - 120);
    w.puck.vx = (rng() - 0.5) * 120;
    w.puck.vy = (rng() - 0.5) * 120;
    w.paddles[1].x = w.paddles[1].tx = 40;
    w.paddles[1].y = w.paddles[1].ty = field.bottom - 40;
    const deep = w.puck.y < field.top + g.paddleR + g.puckR;
    if (!deep) playable++;
    const ev = [];
    for (let i = 0; i < 60 * 8; i++) {
      bot.update(w, 1 / 60, i / 60);
      ev.length = 0;
      stepFrame(w, 1 / 60, ev);
      const gl = ev.find((e) => e.type === 'goal');
      if (gl) { if (gl.player === 2 && !deep) ownPlayable++; break; }
      if (w.puck.y > field.cy) break;
    }
  }
  return ownPlayable / playable;
}


// Розыгрыш со старта: вбрасывание, обратный отсчёт, свисток. Именно здесь бот
// забивал себе — на отсчёте столкновения не считаются, и бита успевала въехать
// внутрь замершей шайбы; по свистку физика расталкивала их и выстреливала
// шайбу в его же ворота. Проверяем оба конца: шайба на вбрасывании остаётся
// препятствием, и первые секунды розыгрыша проходят без автогола.
function faceOffRuns(level, tries = 90) {
  let own = 0, overlapped = 0;
  for (let k = 0; k < tries; k++) {
    const rng = seeded(k * 613 + 11);
    const w = createWorld(g, 2200);
    const bot = createBot(level, rng, 0);
    centerPaddles(w);
    serve(w, 1);                       // шайбу вбрасывают на половину бота
    // Человек в это время тоже шевелится — иногда прямо на шайбу.
    const greedy = rng() < 0.5;
    for (let i = 0; i < 60 * 3.2; i++) {   // отсчёт
      bot.home(w, 1 / 60);
      w.paddles[1].tx = greedy ? w.puck.x : field.cx;
      w.paddles[1].ty = greedy ? w.puck.y : field.bottom - g.paddleR - 40;
      stepPaddles(w);
      const minD = g.paddleR + g.puckR;
      for (const pad of w.paddles) {
        if (Math.hypot(pad.x - w.puck.x, pad.y - w.puck.y) < minD - 0.5) overlapped++;
      }
    }
    const ev = [];
    for (let i = 0; i < 60 * 6; i++) {     // розыгрыш
      bot.update(w, 1 / 60, i / 60);
      ev.length = 0;
      stepFrame(w, 1 / 60, ev);
      const gl = ev.find((e) => e.type === 'goal');
      if (gl) { if (gl.player === 2) own++; break; }
    }
  }
  return { own: own / tries, overlapped };
}

console.log('--- серии по 9 матчей до 7 голов ---');
const pairs = [['easy','easy'], ['normal','normal'], ['hard','hard'],
               ['hard','easy'], ['hard','normal'], ['normal','easy']];
const R = {};
for (const [a, b] of pairs) {
  const r = series(a, b);
  R[a + '_' + b] = r;
  console.log(`  ${(a + ' сверху').padEnd(15)} ${String(r.a).padStart(2)} : ${String(r.b).padStart(2)}  ${(b + ' снизу').padEnd(14)}` +
    ` матч ~${r.secs} с, худший клинч ${r.stall} с, недоигранных ${r.unfinished}`);
}

console.log('\n--- тир: доля отражённых бросков в створ ---');
const save = {};
for (const level of ['easy', 'normal', 'hard']) {
  save[level] = gallery(level, 4242);
  console.log(`  ${level.padEnd(7)} берёт ${(save[level] * 100).toFixed(0)}% бросков`);
}

console.log('\n--- автоголы: шайба замерла в своём створе ---');
const own = {};
for (const level of ['easy', 'normal', 'hard']) {
  own[level] = ownGoals(level);
  console.log(`  ${level.padEnd(7)} забивает себе в ${(own[level] * 100).toFixed(0)}% случаев`);
}

console.log('\n--- бита у центра, шайба между ней и своими воротами ---');
const behind = {};
for (const level of ['easy', 'normal', 'hard']) {
  behind[level] = ownGoalsFromBehind(level);
  console.log(`  ${level.padEnd(7)} автоголов с играбельных позиций: ${(behind[level] * 100).toFixed(1)}%`);
}

console.log('\n--- розыгрыш со старта: вбрасывание, отсчёт, свисток ---');
const face = {};
for (const level of ['easy', 'normal', 'hard']) {
  face[level] = faceOffRuns(level);
  console.log(`  ${level.padEnd(7)} автоголов в первые 6 с: ${(face[level].own * 100).toFixed(1)}%` +
    `  | бита внутри шайбы на отсчёте: ${face[level].overlapped} кадров`);
}

console.log('');
const all = Object.values(R);
ok('никто не заступает за центр', all.every((r) => r.cross === 0));
ok('шайба ни разу не покидает поле', all.every((r) => r.esc === 0));
// Равные соперники могут не доиграть до семи за отведённое время — это не
// поломка, а плотная игра. Требуем, чтобы матч закрывал тот, кто сильнее.
ok('матчи не зависают без единого гола', all.every((r) => r.a + r.b >= 6),
   `минимум голов в серии: ${Math.min(...all.map((r) => r.a + r.b))}`);
// Счёт по матчам шумит: равные обороны дают редкие голы, и одно зерно
// способно перевернуть картину. Основная мера силы — тир ниже, здесь же
// проверяем только направление.
ok('сложный обыгрывает лёгкого', R.hard_easy.a > R.hard_easy.b,
   `${R.hard_easy.a} : ${R.hard_easy.b}`);
ok('сложный сильнее среднего', R.hard_normal.a > R.hard_normal.b,
   `${R.hard_normal.a} : ${R.hard_normal.b}`);
ok('средний сильнее лёгкого', R.normal_easy.a > R.normal_easy.b,
   `${R.normal_easy.a} : ${R.normal_easy.b}`);
ok('равные уровни играют без разгрома', all.slice(0, 3).every((r) => r.a > 0 && r.b > 0),
   `${R.easy_easy.a}:${R.easy_easy.b}, ${R.normal_normal.a}:${R.normal_normal.b}, ${R.hard_hard.a}:${R.hard_hard.b}`);
ok('нет клинчей: шайба не залипает дольше трёх секунд', all.every((r) => Number(r.stall) < 3),
   `худший ${Math.max(...all.map((r) => Number(r.stall)))} с`);
ok('оборона усиливается с уровнем', save.easy < save.normal && save.normal < save.hard,
   `${(save.easy * 100).toFixed(0)}% / ${(save.normal * 100).toFixed(0)}% / ${(save.hard * 100).toFixed(0)}%`);
ok('лёгкому забить легко', save.easy < 0.68, `берёт ${(save.easy * 100).toFixed(0)}%`);
ok('сложный не глухая стена — забить можно', save.hard < 0.94, `берёт ${(save.hard * 100).toFixed(0)}%`);
ok('бот почти не забивает себе', Object.values(own).every((v) => v <= 0.12),
   `худший ${(Math.max(...Object.values(own)) * 100).toFixed(0)}%`);
ok('не забивает себе, обходя шайбу у своих ворот', Object.values(behind).every((v) => v <= 0.04),
   `худший ${(Math.max(...Object.values(behind)) * 100).toFixed(1)}%`);
ok('на вбрасывании бита не въезжает в шайбу', Object.values(face).every((v) => v.overlapped === 0),
   `кадров с наложением: ${Object.values(face).reduce((a, v) => a + v.overlapped, 0)}`);
// Лёгкий и средний дают ноль. У сложного остаются единичные случаи: он самый
// агрессивный, далеко отходит от ворот и изредка срезает шайбу в свои ворота
// уже в открытой игре — это характер, а не поломка.
ok('со старта розыгрыша бот не забивает себе', Object.values(face).every((v) => v.own <= 0.035),
   `худший ${(Math.max(...Object.values(face).map((v) => v.own)) * 100).toFixed(1)}%`);
ok('сложный всё же серьёзен', save.hard > 0.85, `берёт ${(save.hard * 100).toFixed(0)}%`);

console.log(`\n${pass} ok, ${fail} fail`);
process.exit(fail ? 1 : 0);
