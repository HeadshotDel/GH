// Проверка физики без браузера: node test/physics.test.mjs
// Ловит регрессии, которые на глаз не видно — туннелирование быстрой шайбы,
// выход за поле при зажиме между битой и бортом, «немой» гол на вбрасывании.
// Headless-проверка физики: ворота, штанги, борта, отсутствие туннелирования.
import { createWorld, stepFrame, stepPaddles, serve, centerPaddles, nextServeTo } from '../js/physics.js';

const W = 393, H = 852, islandW = 125;
const field = { top: 59, bottom: 793, left: 0, right: W,
  get h(){return this.bottom-this.top}, get w(){return this.right-this.left},
  get cy(){return (this.top+this.bottom)/2}, get cx(){return (this.left+this.right)/2} };
const g = {
  W, H, field,
  island: { w: islandW, h: 36.67, top: 11, x: (W-islandW)/2, get bottom(){return this.top+this.h} },
  goal: { w: islandW, x0: (W-islandW)/2, x1: (W+islandW)/2 },
  pill: { x: (W-islandW)/2, y: H-11-36.67, w: islandW, h: 36.67 },
  puckR: 23, paddleR: 36, dpr: 3,
};

let pass = 0, fail = 0;
const ok = (name, cond, info='') => { cond ? pass++ : fail++; console.log(`${cond?'  ok':'FAIL'}  ${name}${info?'  '+info:''}`); };

function run(w, seconds, fps = 60) {
  const ev = [], dt = 1/fps;
  for (let i = 0; i < seconds*fps; i++) stepFrame(w, dt, ev);
  return ev;
}

// 1. Шайба, пущенная точно вверх по центру, залетает в верхние ворота.
{
  const w = createWorld(g, 2200); centerPaddles(w); serve(w, 1);
  w.puck.x = field.cx; w.puck.y = field.cy; w.puck.vx = 0; w.puck.vy = -1800;
  w.paddles[0].tx = 40; w.paddles[0].ty = field.top + 40;   // бита уведена с траектории
  w.paddles[1].tx = 40; w.paddles[1].ty = field.bottom - 40;
  const ev = run(w, 1.2);
  const goal = ev.find(e => e.type === 'goal');
  ok('гол в верхние ворота засчитан', !!goal && goal.player === 2, goal ? `игрок ${goal.player}` : 'гола нет');
}

// 2. Шайба мимо створа отскакивает от лицевого борта, гола нет.
{
  const w = createWorld(g, 2200); centerPaddles(w); serve(w, 1);
  w.puck.x = 40; w.puck.y = field.cy; w.puck.vx = 0; w.puck.vy = -1800;
  w.paddles[0].tx = 340; w.paddles[0].ty = field.top + 40;
  w.paddles[1].tx = 340; w.paddles[1].ty = field.bottom - 40;
  const ev = run(w, 1.2);
  ok('мимо створа — гола нет', !ev.some(e => e.type === 'goal'));
  ok('мимо створа — есть отскок от борта', ev.some(e => e.type === 'wall'));
  ok('шайба осталась в поле', w.puck.y > field.top && w.puck.y < field.bottom,
     `y=${w.puck.y.toFixed(1)}`);
}

// 3. Максимальная скорость: шайба не проходит сквозь биту.
//    Отскок вниз и гол в ДАЛЬНИЕ ворота — правильное поведение;
//    туннелирование — это гол в ворота ЗА битой (игрок 2).
{
  let through = 0;
  for (const speed of [2200, 2900, 3600, 5000]) {
    const w = createWorld(g, speed); centerPaddles(w); serve(w, 1);
    w.puck.x = field.cx; w.puck.y = field.cy + 200; w.puck.vx = 0; w.puck.vy = -speed;
    w.paddles[0].tx = field.cx; w.paddles[0].ty = field.cy - 120;
    w.paddles[1].tx = 40; w.paddles[1].ty = field.bottom - 40;
    const ev = [];
    const dt = 1/60;
    let hit = false, tunneled = false;
    for (let i = 0; i < 30 && !w.scoring; i++) {
      stepFrame(w, dt, ev);
      if (ev.some(e => e.type === 'paddle')) hit = true;
      const gl = ev.find(e => e.type === 'goal');
      if (gl && gl.player === 2 && !hit) tunneled = true;
    }
    if (tunneled) through++;
    ok(`бита ловит шайбу на ${speed} px/s`, hit && !tunneled, tunneled ? 'ПРОШЛА НАСКВОЗЬ' : '');
  }
  ok('туннелирования нет ни на одной скорости', through === 0);
}

// 4. Штанга: шайба у самого края створа отскакивает, а не «влипает».
{
  const w = createWorld(g, 2200); centerPaddles(w); serve(w, 1);
  w.puck.x = g.goal.x0 - 2; w.puck.y = field.cy; w.puck.vx = 0; w.puck.vy = -1600;
  w.paddles[0].tx = 340; w.paddles[0].ty = field.top + 40;
  w.paddles[1].tx = 340; w.paddles[1].ty = field.bottom - 40;
  const ev = run(w, 1.0);
  ok('удар в штангу отрабатывает', ev.some(e => e.type === 'post' || e.type === 'wall'));
  ok('после штанги шайба в поле', w.puck.x >= 0 && w.puck.x <= W && w.puck.y > field.top - 1);
}

// 5. Бита не выходит за свою половину и за борта.
{
  const w = createWorld(g, 2200); centerPaddles(w);
  w.paddles[0].tx = 1e4; w.paddles[0].ty = 1e4;   // цель уводим за экран
  w.paddles[1].tx = -1e4; w.paddles[1].ty = -1e4;
  run(w, 0.5);
  const a = w.paddles[0], b = w.paddles[1];
  ok('верхняя бита не пересекает центр', a.y <= field.cy + 0.01, `y=${a.y.toFixed(1)}`);
  ok('нижняя бита не пересекает центр', b.y >= field.cy - 0.01, `y=${b.y.toFixed(1)}`);
}

// 6. Удар битой разгоняет шайбу, но не выше потолка скорости.
{
  const w = createWorld(g, 2200); centerPaddles(w); serve(w, 1);
  w.puck.x = field.cx; w.puck.y = field.cy + 100;
  w.paddles[1].x = w.paddles[1].tx = field.cx; w.paddles[1].y = w.paddles[1].ty = field.cy + 300;
  const ev = [];
  for (let i = 0; i < 10; i++) {
    w.paddles[1].ty = field.cy + 300 - i * 26;
    stepFrame(w, 1/60, ev);
  }
  const sp = Math.hypot(w.puck.vx, w.puck.vy);
  ok('бита разгоняет шайбу', ev.some(e => e.type === 'paddle') && sp > 300, `${sp.toFixed(0)} px/s`);
  ok('потолок скорости соблюдён', sp <= 2200 + 1, `${sp.toFixed(0)} px/s`);
}

// 7. Долгий прогон со случайными движениями бит: шайба никогда не покидает поле.
{
  const w = createWorld(g, 2900); centerPaddles(w); serve(w, 1);
  w.puck.vx = 900; w.puck.vy = -1400;
  let escaped = 0, goals = 0;
  const ev = [];
  for (let i = 0; i < 60 * 90; i++) {                 // 90 секунд
    for (let p = 0; p < 2; p++) {
      const pad = w.paddles[p];
      pad.tx = 36 + Math.random() * (W - 72);
      pad.ty = p === 0
        ? field.top + 36 + Math.random() * (field.cy - field.top - 72)
        : field.cy + 36 + Math.random() * (field.bottom - field.cy - 72);
    }
    stepFrame(w, 1/60, ev);
    if (w.scoring) { goals++; serve(w, 1); continue; }
    if (w.puck.x < -1 || w.puck.x > W + 1 || w.puck.y < field.top - 1 || w.puck.y > field.bottom + 1) escaped++;
  }
  ok('за 90 с хаоса шайба ни разу не покинула поле', escaped === 0, `выходов: ${escaped}, голов: ${goals}`);
  ok('в хаосе голы всё-таки забиваются', goals > 0, `голов: ${goals}`);
}

// 8. Регрессия: во время вбрасывания шайба неприкосновенна — бита не может
//    её задеть и «забить» гол, который некому обработать.
{
  const w = createWorld(g, 2200); centerPaddles(w); serve(w, 2);
  const y0 = w.puck.y;
  for (let i = 0; i < 120; i++) {
    w.paddles[1].tx = w.puck.x; w.paddles[1].ty = w.puck.y + 10;
    stepPaddles(w);
  }
  ok('во время отсчёта шайба не двигается', Math.abs(w.puck.y - y0) < 1e-9);
  ok('во время отсчёта гол невозможен', w.scoring === 0);
  ok('во время отсчёта бита зажата в своей половине', w.paddles[1].y >= field.cy - 0.01);
}

// 9. Владение после гола: шайба достаётся пропустившему, а не забившему.
{
  ok('забил нижний — вбрасывание верхнему', nextServeTo(2) === 1);
  ok('забил верхний — вбрасывание нижнему', nextServeTo(1) === 2);

  const w = createWorld(g, 2200); centerPaddles(w);
  serve(w, nextServeTo(2));            // гол забил нижний игрок
  ok('после гола нижнего шайба в верхней половине', w.puck.y < field.cy,
     `y=${w.puck.y.toFixed(0)} при центре ${field.cy}`);

  serve(w, nextServeTo(1));            // гол забил верхний игрок
  ok('после гола верхнего шайба в нижней половине', w.puck.y > field.cy,
     `y=${w.puck.y.toFixed(0)} при центре ${field.cy}`);
}

console.log(`\n${pass} ok, ${fail} fail`);
process.exit(fail ? 1 : 0);
