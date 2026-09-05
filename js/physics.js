// Мир аэрохоккея. Шаг фиксированный и с подшагами: на 2900 px/s шайба за
// кадр 60 Гц пролетает 48 px — это вдвое больше её радиуса, и без подшагов
// она проходила бы сквозь биту.

const SUB_DT = 1 / 240;
const MAX_SUB = 14;
const WALL_REST = 0.94;
const PADDLE_REST = 0.95;
const POST_REST = 0.86;
const POST_R = 3;
const DAMP = 0.35;            // воздушная подушка: трения почти нет
const MAX_PADDLE_V = 4200;
const MIN_BOUNCE = 12;

export function createWorld(g, maxSpeed) {
  return {
    g,
    maxSpeed,
    puck: { x: g.field.cx, y: g.field.cy, vx: 0, vy: 0, r: g.puckR },
    paddles: [
      // 0 — верхний игрок (защищает остров), 1 — нижний
      { x: g.field.cx, y: g.field.cy - g.field.h * 0.17, vx: 0, vy: 0, r: g.paddleR,
        tx: g.field.cx, ty: g.field.cy - g.field.h * 0.17, sx: 0, sy: 0, side: -1, snap: false },
      { x: g.field.cx, y: g.field.cy + g.field.h * 0.17, vx: 0, vy: 0, r: g.paddleR,
        tx: g.field.cx, ty: g.field.cy + g.field.h * 0.17, sx: 0, sy: 0, side: 1, snap: false },
    ],
    scoring: 0,        // 0 — игра, иначе номер забившего (1|2)
    scoringT: 0,
  };
}

// Бита обязана оставаться в своей половине и в пределах бортов.
// Это инвариант симуляции, а не забота вызывающего кода: раньше клэмп жил
// только во вводе, и любой другой путь установки цели ломал игру.
export function clampPaddle(w, i) {
  const { field } = w.g;
  const p = w.paddles[i];
  p.tx = Math.min(field.right - p.r, Math.max(field.left + p.r, p.tx));
  p.ty = i === 0
    ? Math.min(field.cy - p.r, Math.max(field.top + p.r, p.ty))
    : Math.min(field.bottom - p.r, Math.max(field.cy + p.r, p.ty));
}

// После гола владение переходит тому, КОМУ забили. Правило вынесено сюда
// отдельной функцией, чтобы его можно было закрыть тестом: инлайновый
// тернарник в игровом цикле однажды уже оказался перевёрнутым.
export function nextServeTo(scorer) { return scorer === 1 ? 2 : 1; }

// toPlayer — игрок, на половину которого ложится шайба (1 — верхний, 2 — нижний).
export function serve(w, toPlayer) {
  const { field } = w.g;
  const off = field.h * 0.13;
  w.puck.x = field.cx;
  w.puck.y = toPlayer === 1 ? field.cy - off : field.cy + off;
  w.puck.vx = 0;
  w.puck.vy = 0;
  w.scoring = 0;
  w.scoringT = 0;
}

// Биты к началу розыгрыша отходят дальше от центра, чем стоят в меню:
// иначе они перекрывали бы точку вбрасывания.
export function centerPaddles(w) {
  const { field } = w.g;
  const a = w.paddles[0], b = w.paddles[1];
  a.x = a.tx = field.cx; a.y = a.ty = field.cy - field.h * 0.22;
  b.x = b.tx = field.cx; b.y = b.ty = field.cy + field.h * 0.22;
  a.vx = a.vy = b.vx = b.vy = 0;
}

function circleBounce(p, cx, cy, minD, rest) {
  const dx = p.x - cx, dy = p.y - cy;
  const d2 = dx * dx + dy * dy;
  if (d2 >= minD * minD || d2 === 0) return 0;
  const d = Math.sqrt(d2), nx = dx / d, ny = dy / d;
  p.x = cx + nx * minD; p.y = cy + ny * minD;
  const vn = p.vx * nx + p.vy * ny;
  if (vn >= 0) return 0;
  const j = -(1 + rest) * vn;
  p.vx += j * nx; p.vy += j * ny;
  return -vn;
}

function hitPaddle(p, pad, rest) {
  const minD = pad.r + p.r;
  const dx = p.x - pad.x, dy = p.y - pad.y;
  let d2 = dx * dx + dy * dy;
  if (d2 >= minD * minD) return 0;
  let nx, ny, d;
  if (d2 === 0) { nx = 0; ny = pad.side; d = 0; } else { d = Math.sqrt(d2); nx = dx / d; ny = dy / d; }
  p.x = pad.x + nx * minD;
  p.y = pad.y + ny * minD;
  const rvx = p.vx - pad.vx, rvy = p.vy - pad.vy;
  const vn = rvx * nx + rvy * ny;
  if (vn >= 0) return 0;
  const j = -(1 + rest) * vn;
  p.vx += j * nx; p.vy += j * ny;
  // лёгкое касательное трение — скользящий удар слегка подкручивает шайбу
  const tx = -ny, ty = nx;
  const vt = p.vx * tx + p.vy * ty;
  p.vx -= vt * 0.07 * tx; p.vy -= vt * 0.07 * ty;
  return -vn;
}

// Один подшаг. events — накопитель для звука/вибрации/эффектов.
function substep(w, dt, events) {
  const { field, goal, W } = w.g;
  const p = w.puck;

  // 1. биты уже переставлены снаружи; интегрируем шайбу
  const k = Math.exp(-DAMP * dt);
  p.vx *= k; p.vy *= k;
  p.x += p.vx * dt;
  p.y += p.vy * dt;

  if (w.scoring) { w.scoringT += dt; return; }

  // 2. биты
  for (let i = 0; i < 2; i++) {
    const s = hitPaddle(p, w.paddles[i], PADDLE_REST);
    if (s > MIN_BOUNCE) events.push({ type: 'paddle', power: s, x: p.x, y: p.y, player: i + 1 });
  }

  // 3. боковые борта
  if (p.x - p.r < 0) { p.x = p.r; if (p.vx < 0) { const s = -p.vx; p.vx = -p.vx * WALL_REST; if (s > MIN_BOUNCE) events.push({ type: 'wall', power: s, x: p.x, y: p.y }); } }
  else if (p.x + p.r > W) { p.x = W - p.r; if (p.vx > 0) { const s = p.vx; p.vx = -p.vx * WALL_REST; if (s > MIN_BOUNCE) events.push({ type: 'wall', power: s, x: p.x, y: p.y }); } }

  // 4. штанги — от них шайба отскакивает по-настоящему, а не «как от стенки»
  const posts = [
    [goal.x0, field.top], [goal.x1, field.top],
    [goal.x0, field.bottom], [goal.x1, field.bottom],
  ];
  for (const [px, py] of posts) {
    const s = circleBounce(p, px, py, p.r + POST_R, POST_REST);
    if (s > MIN_BOUNCE) events.push({ type: 'post', power: s, x: p.x, y: p.y });
  }

  // 5. шайбу могло зажать между битой и бортом — выталкиваем вдоль борта
  for (let i = 0; i < 2; i++) {
    const pad = w.paddles[i], minD = pad.r + p.r;
    const dx = p.x - pad.x, dy = p.y - pad.y;
    const d2 = dx * dx + dy * dy;
    if (d2 < minD * minD - 0.01) {
      const d = Math.sqrt(d2) || 0.001;
      const push = Math.min(minD, (minD - d) + 0.5);
      if (Math.abs(dx) > Math.abs(dy)) p.x += (Math.sign(dx) || 1) * push;
      else p.y += (Math.sign(dy) || 1) * push;
    }
  }

  // 6. лицевые борта и створы
  const inMouth = p.x > goal.x0 && p.x < goal.x1;
  if (p.y - p.r < field.top) {
    if (inMouth && p.y < field.top) { w.scoring = 2; w.scoringT = 0; events.push({ type: 'goal', player: 2 }); }
    else if (!inMouth) { p.y = field.top + p.r; if (p.vy < 0) { const s = -p.vy; p.vy = -p.vy * WALL_REST; if (s > MIN_BOUNCE) events.push({ type: 'wall', power: s, x: p.x, y: p.y }); } }
  } else if (p.y + p.r > field.bottom) {
    if (inMouth && p.y > field.bottom) { w.scoring = 1; w.scoringT = 0; events.push({ type: 'goal', player: 1 }); }
    else if (!inMouth) { p.y = field.bottom - p.r; if (p.vy > 0) { const s = p.vy; p.vy = -p.vy * WALL_REST; if (s > MIN_BOUNCE) events.push({ type: 'wall', power: s, x: p.x, y: p.y }); } }
  }

  // 7. страховка от выдавливания: по бокам шайба не выходит никогда,
  //    по длине — только в створе, где выход и есть гол
  if (!w.scoring) {
    p.x = Math.min(W - p.r, Math.max(p.r, p.x));
    if (!inMouth) p.y = Math.min(field.bottom - p.r, Math.max(field.top + p.r, p.y));
  }

  // 8. потолок скорости
  const sp = Math.hypot(p.vx, p.vy);
  if (sp > w.maxSpeed) { const f = w.maxSpeed / sp; p.vx *= f; p.vy *= f; }
}

// Во время вбрасывания двигаются только биты: шайба лежит на точке и ждёт.
// Иначе гол, забитый в секунды отсчёта, засчитывался бы молча — событие
// некому обработать, а шайба уже помечена как забитая и исчезает навсегда.
// При этом шайба остаётся препятствием: наехать на неё битой нельзя.
export function stepPaddles(w) {
  const q = w.puck;
  for (let i = 0; i < 2; i++) {
    clampPaddle(w, i);
    const p = w.paddles[i];
    p.x = p.tx; p.y = p.ty;
    p.vx = 0; p.vy = 0;
    p.snap = false;

    // Шайба на вбрасывании неподвижна, но она не призрак. Без этого бита
    // свободно въезжает внутрь неё, а по свистку первый же шаг физики
    // расталкивает их и выстреливает шайбу в случайную сторону — чаще всего
    // в ворота того, кто наехал. Поэтому выталкиваем наружу саму биту.
    const minD = p.r + q.r;
    const dx = p.x - q.x, dy = p.y - q.y;
    const d = Math.hypot(dx, dy);
    if (d < minD) {
      if (d > 0.001) { p.x = q.x + (dx / d) * minD; p.y = q.y + (dy / d) * minD; }
      // Ровно по центру шайбы направление не определено: отходим к своим
      // воротам — это единственная заведомо безопасная сторона.
      else { p.y = q.y + (i === 0 ? -minD : minD); }

      p.tx = p.x; p.ty = p.y;
      clampPaddle(w, i);
      p.x = p.tx; p.y = p.ty;

      // Половина могла не пустить биту туда, куда её вытолкнуло. Тогда
      // расходимся вбок — там места всегда хватает.
      if (Math.hypot(p.x - q.x, p.y - q.y) < minD) {
        const side = p.x <= q.x ? -1 : 1;
        p.tx = q.x + side * minD;
        p.ty = p.y;
        clampPaddle(w, i);
        p.x = p.tx; p.y = p.ty;
      }
    }
  }
}

// Один кадр: биты линейно доезжают до цели, шайба считается подшагами.
export function stepFrame(w, dt, events) {
  dt = Math.min(dt, 1 / 20);
  const n = Math.min(MAX_SUB, Math.max(1, Math.ceil(dt / SUB_DT)));
  const sub = dt / n;

  for (let i = 0; i < 2; i++) {
    clampPaddle(w, i);
    const p = w.paddles[i];
    // Палец опустили на новое место: бита телепортируется, но скорость
    // за этот кадр не считаем — иначе касание превращалось бы в пушечный удар.
    if (p.snap) { p.x = p.tx; p.y = p.ty; p.vx = p.vy = 0; p.snap = false; }
    p.sx = p.x; p.sy = p.y;
  }

  for (let s = 1; s <= n; s++) {
    const a = s / n;
    for (let i = 0; i < 2; i++) {
      const p = w.paddles[i];
      const nx = p.sx + (p.tx - p.sx) * a;
      const ny = p.sy + (p.ty - p.sy) * a;
      let vx = (nx - p.x) / sub, vy = (ny - p.y) / sub;
      const v = Math.hypot(vx, vy);
      if (v > MAX_PADDLE_V) { const f = MAX_PADDLE_V / v; vx *= f; vy *= f; }
      p.vx = vx; p.vy = vy;
      p.x = nx; p.y = ny;
    }
    substep(w, sub, events);
  }
}

