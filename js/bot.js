// Бот-соперник. Играет верхнюю биту — ту, что защищает Dynamic Island.
//
// Сила задаётся не читом, а человеческими ограничениями: скоростью руки,
// задержкой реакции, ошибкой прицела, готовностью отходить от ворот и
// склонностью зевать. Поэтому лёгкий бот проигрывает не потому, что ему
// велено поддаваться, а потому что не успевает — это видно и играется честно.
//
// Бот не двигает биту телепортом: он лишь смещает цель с ограниченной
// скоростью, а силу удара из этого движения считает та же физика, что и для
// человека. Медленный бот бьёт слабо просто потому, что медленно машет.

// guard — ошибка выбора места в обороне, bank — вероятность не заметить
// отскок от борта. Именно они решают, пробиваем ли бот: бита радиусом 36
// вместе с шайбой перекрывает 59 px створа при его полуширине 62, поэтому
// правильно ставший вратарь непробиваем в принципе, каким бы медленным ни был.
// Ворота открывает не медлительность, а неверно выбранное место.
export const LEVELS = {
  easy:   { speed: 760,  react: 0.26,  aim: 58, guard: 110, bank: 0.82, advance: 0.55, lapse: 0.320 },
  normal: { speed: 1150, react: 0.13,  aim: 34, guard: 61,  bank: 0.49, advance: 0.74, lapse: 0.160 },
  hard:   { speed: 1520, react: 0.085, aim: 20, guard: 59,  bank: 0.19, advance: 0.94, lapse: 0.055 },
};

// Куда шайба придёт на высоту targetY с учётом отражений от боковых бортов.
// Свернуть траекторию зеркалами дешевле, чем шагать симуляцией.
// blind — не учитывать отражения: живой игрок регулярно ловится на банке.
function predictX(p, targetY, W, r, blind) {
  if (Math.abs(p.vy) < 1) return p.x;
  const t = (targetY - p.y) / p.vy;
  if (t < 0) return p.x;
  const raw = p.x + p.vx * t;
  const span = W - 2 * r;
  if (span <= 0) return p.x;
  if (blind) return Math.min(W - r, Math.max(r, raw));
  let k = (raw - r) % (2 * span);
  if (k < 0) k += 2 * span;
  if (k > span) k = 2 * span - k;
  return r + k;
}

// side: 0 — верхняя бита (обычный режим игры с ботом), 1 — нижняя.
// Сторона параметром не ради красоты: только так бота можно измерить им же
// самим, а эталонный соперник в тестах получается сильным и честным.
// rng вынесен наружу, чтобы прогоны были воспроизводимы.
export function createBot(level, rng = Math.random, side = 0) {
  const cfg = LEVELS[level] || LEVELS.normal;
  const hist = [];
  let aim = 0, guard = 0, blind = false;
  let lastDir = 0, lapseUntil = 0, nextCheck = 0, striking = false, strikeUntil = 0;

  function reset() { hist.length = 0; striking = false; strikeUntil = 0; lapseUntil = 0; nextCheck = 0; }

  // Бот видит шайбу с задержкой — как человек, а не как программа.
  function delayed(now) {
    const want = now - cfg.react;
    for (let i = hist.length - 1; i >= 0; i--) if (hist[i].t <= want) return hist[i];
    return hist[0];
  }

  function update(w, dt, now) {
    const pad = w.paddles[side];
    const { field, W, puckR, paddleR } = w.g;
    const q = w.puck;

    // s — направление от своих ворот к центру: +1 для верхней биты, -1 для нижней.
    // Через него вся геометрия пишется один раз на обе стороны.
    const s = side === 0 ? 1 : -1;
    const ownY = side === 0 ? field.top : field.bottom;
    const foeY = side === 0 ? field.bottom : field.top;

    hist.push({ t: now, x: q.x, y: q.y, vx: q.vx, vy: q.vy });
    if (hist.length > 120) hist.shift();
    const p = delayed(now);

    if (now > nextCheck) {
      nextCheck = now + 1.1;
      if (rng() < cfg.lapse) lapseUntil = now + 0.16 + rng() * 0.24;
    }
    if (now < lapseUntil) return;    // зевок: цель не трогаем, бита стоит

    // Шайба сменила направление — новый розыгрыш, перевыбираем ошибку прицела.
    // Дёргать её каждый кадр нельзя: бита начнёт трястись.
    const dir = Math.sign(p.vy);
    if (dir !== lastDir) {
      lastDir = dir;
      aim = (rng() * 2 - 1) * cfg.aim;
      guard = (rng() * 2 - 1) * cfg.guard;   // куда встать в обороне — решение на весь розыгрыш
      blind = rng() < cfg.bank;              // и заметим ли мы отскок
    }

    const half = field.cy - field.top;
    const homeY = ownY + s * (paddleR + half * 0.04);
    // «Своя» шайба — не та, что за центральной линией, а та, до которой бита
    // физически дотягивается: центр биты доходит до линии, плюс сумма радиусов.
    // По половинам получалась мёртвая полоса у центра, где шайбу не считал
    // своей никто, и розыгрыш вставал.
    const ourHalf = (p.y - field.cy) * s < puckR * 0.9;
    const incoming = p.vy * s < -25;
    const slow = Math.hypot(p.vx, p.vy) < 70;

    // Если шайба замерла на нашей половине, идти за ней обязаны мы: соперник
    // туда не дотянется по правилам, и партия встанет намертво. Поэтому в
    // такой ситуации ограничение «далеко от ворот не отходить» снимается.
    const stalled = ourHalf && slow;
    const maxY = stalled
      ? field.cy - s * paddleR
      : ownY + s * (paddleR + half * cfg.advance);

    let tx, ty;

    if (ourHalf && !incoming) {
      // Атака: зайти за шайбу и продавить её к чужим воротам.
      const back = paddleR + puckR;
      // Целимся не в центр ворот, а в дальний от чужой биты край створа:
      // защитник вместе с шайбой перекрывает 59 px при полуширине ворот 62,
      // поэтому бросок в центр упирается в него всегда.
      const foeX = w.paddles[1 - side].x;
      const gL = w.g.goal.x0 + puckR + 4;
      const gR = w.g.goal.x1 - puckR - 4;
      const open = Math.abs(foeX - gL) > Math.abs(foeX - gR) ? gL : gR;
      const gx = open + aim;
      let ux, uy, sx, sy;
      const aimAt = (targetX) => {
        const d = Math.hypot(targetX - p.x, foeY - p.y) || 1;
        ux = (targetX - p.x) / d; uy = (foeY - p.y) / d;
        sx = p.x - ux * back * 1.1; sy = p.y - uy * back * 1.1;
      };
      aimAt(gx);

      // Шайба у борта: чтобы послать её к центру ворот, встать нужно было бы
      // за пределами поля. Бита туда не дойдёт, окажется не с той стороны и
      // вдавит шайбу в борт. Тогда бьём честно — вдоль борта на чужую сторону.
      if (sx < field.left + paddleR || sx > field.right - paddleR) aimAt(p.x);

      // Точку замаха зажимаем в достижимую зону: за лицевую линию бита не
      // заходит, но встать чуть ближе к воротам, чем хотелось, обычно можно —
      // и этого хватает, чтобы толкнуть шайбу от своих ворот, а не в них.
      sx = Math.min(field.right - paddleR, Math.max(field.left + paddleR, sx));
      sy = s > 0 ? Math.max(ownY + s * paddleR, sy) : Math.min(ownY + s * paddleR, sy);

      // «За шайбой» — значит между ней и своими воротами. Если даже после
      // зажатия бита оказывается с внешней стороны, толкать вдоль ворот
      // нельзя: это прямой автогол.
      const behind = (p.y - sy) * s > 0;
      const inMouth = p.x > w.g.goal.x0 && p.x < w.g.goal.x1;

      if (!behind && inMouth) {
        // Шайба в собственном створе, зайти за неё некуда. Выталкиваем вбок:
        // заходим с максимальным боковым выносом, тогда удар идёт почти
        // поперёк и шайба покидает створ раньше, чем доходит до линии.
        const away = p.x < field.cx ? -1 : 1;
        const sideX = p.x - away * back * 0.97;
        const sideY = ownY + s * paddleR;
        if (!striking && Math.hypot(pad.x - sideX, pad.y - sideY) < paddleR * 0.6) {
          striking = true; strikeUntil = now + 0.3;
        }
        if (striking && now > strikeUntil) striking = false;
        if (striking) { tx = p.x + away * back * 0.6; ty = sideY; }
        else { tx = sideX; ty = sideY; }
      } else if (!behind) {
        // Шайба в углу у своих ворот, но мимо створа: забить себе нельзя,
        // поэтому просто выбиваем её ударом с отскоком от бортов, чередуя
        // удар и отход — прижатая битой шайба отскочить не сможет.
        if (!striking && now > strikeUntil + 0.28) { striking = true; strikeUntil = now + 0.32; }
        if (striking && now > strikeUntil) striking = false;
        if (striking) {
          const d2 = Math.hypot(p.x - pad.x, p.y - pad.y) || 1;
          tx = p.x + ((p.x - pad.x) / d2) * back * 0.7;
          ty = p.y + ((p.y - pad.y) / d2) * back * 0.7;
        } else {
          tx = p.x + (field.cx - p.x) * 0.35;
          ty = p.y + s * back * 1.4;
        }
      } else {
        if (Math.hypot(pad.x - sx, pad.y - sy) < paddleR * 0.5) striking = true;
        if (striking) { tx = p.x + ux * back * 0.5; ty = p.y + uy * back * 0.5; }
        else { tx = sx; ty = sy; }
      }

      // Обход. Бита едет к точке замаха по прямой, и если шайба стоит на этом
      // пути, она получит толчок ровно в наши ворота. Человек в такой ситуации
      // обходит шайбу сбоку — сначала уходим по горизонтали за её радиус и
      // только потом подтягиваемся по вертикали.
      if (!striking && (pad.y - p.y) * s > 0 && Math.abs(pad.x - p.x) < back + 6) {
        const side = pad.x < p.x ? -1 : 1;
        tx = p.x + side * (back + 14);
        ty = pad.y;
      }
    } else if (incoming) {
      striking = false;
      // Оборона: встречаем шайбу там, где она пересечёт линию обороны.
      const lineY = ownY + s * (paddleR + half * 0.16);
      tx = predictX(p, lineY, W, puckR, blind) + guard;
      ty = lineY;
    } else {
      striking = false;
      // Шайба у соперника — домой, слегка следя за ней по горизонтали.
      tx = field.cx + (p.x - field.cx) * 0.4;
      ty = homeY;
    }

    ty = s > 0 ? Math.min(ty, maxY) : Math.max(ty, maxY);

    const ddx = tx - pad.x, ddy = ty - pad.y;
    const dd = Math.hypot(ddx, ddy);
    const step = cfg.speed * dt;
    if (dd > step && dd > 0) { tx = pad.x + (ddx / dd) * step; ty = pad.y + (ddy / dd) * step; }
    pad.tx = tx; pad.ty = ty;
  }

  return { update, reset };
}
