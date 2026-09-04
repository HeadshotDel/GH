// Две темы. Каждая умеет: испечь спрайты (биты, шайба) и нарисовать
// статический фон стола один раз в offscreen-канвас.
// Спрайты вместо shadowBlur — иначе на 120 Гц кадр не укладывается.

function mk(cssSize, dpr) {
  const c = document.createElement('canvas');
  c.width = Math.ceil(cssSize * dpr);
  c.height = Math.ceil(cssSize * dpr);
  const ctx = c.getContext('2d');
  ctx.scale(dpr, dpr);
  return { canvas: c, ctx, s: cssSize, c: cssSize / 2 };
}

function noiseTile(alpha) {
  const n = 128;
  const c = document.createElement('canvas');
  c.width = c.height = n;
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(n, n);
  for (let i = 0; i < n * n; i++) {
    const v = 118 + Math.random() * 74;
    img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v;
    img.data[i * 4 + 3] = alpha;
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

function halftoneTile(color, step, r) {
  const c = document.createElement('canvas');
  c.width = c.height = step;
  const ctx = c.getContext('2d');
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(step / 2, step / 2, r, 0, Math.PI * 2);
  ctx.fill();
  return c;
}

// Горловина ворот: от «пилюли» до кромки поля. Рисуется ПОД шайбой,
// чтобы было видно, как шайба въезжает в створ.
function goalThroat(ctx, g, dir, fill) {
  const isl = g.island;
  const r = isl.h / 2;
  const edge = dir < 0 ? g.field.top : g.field.bottom;
  const y0 = dir < 0 ? isl.top + isl.h - r : edge;
  const y1 = dir < 0 ? edge : g.pill.y + r;
  if (y1 > y0) { ctx.fillStyle = fill; ctx.fillRect(isl.x, y0, isl.w, y1 - y0); }
}

// «Пилюля» рисуется ПОВЕРХ шайбы: сверху её место занимает настоящий
// Dynamic Island, снизу — его точное зеркало. Шайба уезжает под неё
// и пропадает — гол выглядит так, будто ворота её проглотили.
function goalPill(ctx, g, dir, fill) {
  const isl = g.island;
  const y = dir < 0 ? isl.top : g.pill.y;
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.roundRect(isl.x, y, isl.w, isl.h, isl.h / 2);
  ctx.fill();
}

/* ============================ VOID ============================ */
const VOID = {
  id: 'void',
  name: 'Void',
  bodyClass: 'theme-void',
  bg: '#04050a',
  p1: '#ff2d8a',
  p2: '#00e0ff',
  puckColor: '#ffffff',
  score: { font: (s) => `200 ${s}px -apple-system, system-ui, sans-serif`, alpha: 0.88 },

  background(ctx, g) {
    const { W, H, field, goal } = g;
    ctx.fillStyle = '#04050a';
    ctx.fillRect(0, 0, W, H);

    const grad = ctx.createLinearGradient(0, field.top, 0, field.bottom);
    grad.addColorStop(0, '#0a0f1c');
    grad.addColorStop(0.5, '#05070e');
    grad.addColorStop(1, '#0a0f1c');
    ctx.fillStyle = grad;
    ctx.fillRect(0, field.top, W, field.h);

    // сетка-разметка
    ctx.strokeStyle = 'rgba(255,255,255,0.028)';
    ctx.lineWidth = 1;
    const step = W / 10;
    ctx.beginPath();
    for (let x = step; x < W; x += step) { ctx.moveTo(x, field.top); ctx.lineTo(x, field.bottom); }
    for (let y = field.top + step; y < field.bottom; y += step) { ctx.moveTo(0, y); ctx.lineTo(W, y); }
    ctx.stroke();

    // центр
    ctx.strokeStyle = 'rgba(255,255,255,0.13)';
    ctx.beginPath(); ctx.moveTo(0, field.cy); ctx.lineTo(W, field.cy); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.10)';
    ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.arc(field.cx, field.cy, W * 0.183, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    ctx.beginPath(); ctx.arc(field.cx, field.cy, 4, 0, Math.PI * 2); ctx.fill();

    // подсветка створов
    const depth = 54;
    const t = ctx.createLinearGradient(0, field.top + depth, 0, field.top);
    t.addColorStop(0, 'rgba(255,45,138,0)'); t.addColorStop(1, 'rgba(255,45,138,0.5)');
    ctx.fillStyle = t; ctx.fillRect(goal.x0, field.top, goal.w, depth);
    const b = ctx.createLinearGradient(0, field.bottom - depth, 0, field.bottom);
    b.addColorStop(0, 'rgba(0,224,255,0)'); b.addColorStop(1, 'rgba(0,224,255,0.5)');
    ctx.fillStyle = b; ctx.fillRect(goal.x0, field.bottom - depth, goal.w, depth);

    // неоновые борта (разорваны створами)
    const rail = (y, color) => {
      ctx.strokeStyle = color; ctx.lineWidth = 2.4; ctx.globalAlpha = 0.75;
      ctx.beginPath();
      ctx.moveTo(0, y); ctx.lineTo(goal.x0, y);
      ctx.moveTo(goal.x1, y); ctx.lineTo(W, y);
      ctx.stroke();
      ctx.globalAlpha = 0.22; ctx.lineWidth = 8;
      ctx.stroke();
      ctx.globalAlpha = 1;
    };
    rail(field.top, VOID.p1);
    rail(field.bottom, VOID.p2);

    goalThroat(ctx, g, -1, '#000');
    goalThroat(ctx, g, 1, '#000');
  },

  overlay(ctx, g) {
    goalPill(ctx, g, -1, '#000');
    goalPill(ctx, g, 1, '#000');
    ctx.lineWidth = 2; ctx.globalAlpha = 0.55;
    ctx.strokeStyle = VOID.p1;
    ctx.beginPath(); ctx.roundRect(g.island.x, g.island.top, g.island.w, g.island.h, g.island.h / 2); ctx.stroke();
    ctx.strokeStyle = VOID.p2;
    ctx.beginPath(); ctx.roundRect(g.pill.x, g.pill.y, g.pill.w, g.pill.h, g.pill.h / 2); ctx.stroke();
    ctx.globalAlpha = 1;
  },

  paddleSprite(R, color, dpr) {
    const S = R * 2.5, sp = mk(S, dpr), ctx = sp.ctx, c = sp.c;
    let gr = ctx.createRadialGradient(c, c, R * 0.72, c, c, c);
    gr.addColorStop(0, color + '00');
    gr.addColorStop(0.36, color + '77');
    gr.addColorStop(1, color + '00');
    ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(c, c, c, 0, Math.PI * 2); ctx.fill();

    gr = ctx.createRadialGradient(c, c, R * 0.15, c, c, R);
    gr.addColorStop(0, color + '00');
    gr.addColorStop(1, color + '55');
    ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(c, c, R, 0, Math.PI * 2); ctx.fill();

    ctx.strokeStyle = color; ctx.lineWidth = 3.2;
    ctx.beginPath(); ctx.arc(c, c, R - 1.6, 0, Math.PI * 2); ctx.stroke();
    ctx.globalAlpha = 0.4; ctx.lineWidth = 1.3;
    ctx.beginPath(); ctx.arc(c, c, R * 0.6, 0, Math.PI * 2); ctx.stroke();
    ctx.globalAlpha = 1;
    return sp;
  },

  puckSprite(r, dpr) {
    const S = r * 3.4, sp = mk(S, dpr), ctx = sp.ctx, c = sp.c;
    const gr = ctx.createRadialGradient(c, c, r * 0.5, c, c, c);
    gr.addColorStop(0, 'rgba(255,255,255,0.85)');
    gr.addColorStop(0.34, 'rgba(210,240,255,0.35)');
    gr.addColorStop(1, 'rgba(160,220,255,0)');
    ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(c, c, c, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(c, c, r, 0, Math.PI * 2); ctx.fill();
    return sp;
  },

  // Сплошная сужающаяся полоса, а не отдельные точки: на 2000 px/s соседние
  // позиции шайбы разнесены на 30+ px, и кружки распадались бы в «бусы».
  trail(ctx, pts, r) {
    if (pts.length < 2) return;
    // Аддитивное смешивание: круглые торцы соседних сегментов перекрываются,
    // и при обычном alpha на стыках проступали бы полосы.
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = '#cfe9ff';
    for (let i = 1; i < pts.length; i++) {
      const a = (pts[i - 1].a + pts[i].a) / 2;
      ctx.globalAlpha = a * a * 0.16;
      ctx.lineWidth = r * 2 * (0.16 + 0.72 * a);
      ctx.beginPath();
      ctx.moveTo(pts[i - 1].x, pts[i - 1].y);
      ctx.lineTo(pts[i].x, pts[i].y);
      ctx.stroke();
    }
    ctx.restore();
  },

  flashRing(ctx, x, y, r, a, color) {
    ctx.globalAlpha = a; ctx.strokeStyle = color; ctx.lineWidth = 3 * (1 - a) + 1.5;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.stroke();
    ctx.globalAlpha = 1;
  },
};

/* ============================ INK ============================ */
const INK = {
  id: 'ink',
  name: 'Ink',
  bodyClass: 'theme-ink',
  bg: '#efe9dc',
  p1: '#f4511e',
  p2: '#1f3fd8',
  puckColor: '#111111',
  score: { font: (s) => `800 ${s}px -apple-system, system-ui, sans-serif`, alpha: 1 },
  _noise: null, _ht1: null, _ht2: null,

  background(ctx, g) {
    const { W, H, field, goal } = g;
    if (!INK._noise) {
      INK._noise = noiseTile(30);
      INK._ht1 = halftoneTile(INK.p1, 5, 1.7);
      INK._ht2 = halftoneTile(INK.p2, 5, 1.7);
    }
    ctx.fillStyle = '#efe9dc'; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#f7f2e7'; ctx.fillRect(0, field.top, W, field.h);

    // Борта: лицевые разорваны створом, иначе ворота читаются глухой стенкой.
    ctx.strokeStyle = '#111'; ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(3, field.top); ctx.lineTo(3, field.bottom);
    ctx.moveTo(W - 3, field.top); ctx.lineTo(W - 3, field.bottom);
    ctx.moveTo(0, field.top + 3); ctx.lineTo(goal.x0, field.top + 3);
    ctx.moveTo(goal.x1, field.top + 3); ctx.lineTo(W, field.top + 3);
    ctx.moveTo(0, field.bottom - 3); ctx.lineTo(goal.x0, field.bottom - 3);
    ctx.moveTo(goal.x1, field.bottom - 3); ctx.lineTo(W, field.bottom - 3);
    ctx.stroke();
    ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(0, field.cy); ctx.lineTo(W, field.cy); ctx.stroke();
    ctx.beginPath(); ctx.arc(field.cx, field.cy, W * 0.183, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = '#111';
    ctx.beginPath(); ctx.arc(field.cx, field.cy, 6, 0, Math.PI * 2); ctx.fill();

    // штанги
    ctx.fillStyle = '#111';
    for (const x of [goal.x0 - 7, goal.x1]) {
      ctx.fillRect(x, field.top - 3, 7, 15);
      ctx.fillRect(x, field.bottom - 12, 7, 15);
    }

    // полутоновые «сетки» ворот
    ctx.globalAlpha = 0.55;
    ctx.fillStyle = ctx.createPattern(INK._ht1, 'repeat');
    ctx.fillRect(goal.x0, field.top + 10, goal.w, 26);
    ctx.fillStyle = ctx.createPattern(INK._ht2, 'repeat');
    ctx.fillRect(goal.x0, field.bottom - 36, goal.w, 26);
    ctx.globalAlpha = 1;

    goalThroat(ctx, g, -1, '#111');
    goalThroat(ctx, g, 1, '#111');

    ctx.globalAlpha = 0.5;
    ctx.fillStyle = ctx.createPattern(INK._noise, 'repeat');
    ctx.fillRect(0, 0, W, H);
    ctx.globalAlpha = 1;
  },

  overlay(ctx, g) {
    goalPill(ctx, g, -1, '#111');
    goalPill(ctx, g, 1, '#111');
  },

  paddleSprite(R, color, dpr) {
    const other = color === INK.p1 ? INK.p2 : INK.p1;
    const S = R * 2.4, sp = mk(S, dpr), ctx = sp.ctx, c = sp.c;
    ctx.globalAlpha = 0.28; ctx.fillStyle = other;
    ctx.beginPath(); ctx.arc(c + 3, c + 3, R, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1;
    ctx.fillStyle = color;
    ctx.beginPath(); ctx.arc(c, c, R, 0, Math.PI * 2); ctx.fill();
    ctx.save();
    ctx.beginPath(); ctx.arc(c, c, R, 0, Math.PI * 2); ctx.clip();
    ctx.globalAlpha = 0.22;
    ctx.fillStyle = ctx.createPattern(color === INK.p1 ? INK._ht2 : INK._ht1, 'repeat');
    ctx.fillRect(0, 0, S, S);
    ctx.restore();
    ctx.strokeStyle = '#111'; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.arc(c, c, R - 2, 0, Math.PI * 2); ctx.stroke();
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(c, c, R * 0.58, 0, Math.PI * 2); ctx.stroke();
    return sp;
  },

  puckSprite(r, dpr) {
    const S = r * 2.6, sp = mk(S, dpr), ctx = sp.ctx, c = sp.c;
    ctx.fillStyle = '#111'; ctx.beginPath(); ctx.arc(c, c, r, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#f7f2e7';
    ctx.beginPath(); ctx.arc(c - r * 0.24, c - r * 0.28, r * 0.22, 0, Math.PI * 2); ctx.fill();
    return sp;
  },

  // В Ink россыпь колец — часть печатной эстетики, оставляем точками.
  trail(ctx, pts, r) {
    ctx.strokeStyle = '#111'; ctx.lineWidth = 2.4;
    for (const t of pts) {
      ctx.globalAlpha = t.a * 0.8;
      ctx.beginPath(); ctx.arc(t.x, t.y, r * (0.3 + 0.55 * t.a), 0, Math.PI * 2); ctx.stroke();
    }
    ctx.globalAlpha = 1;
  },

  flashRing(ctx, x, y, r, a, color) {
    ctx.globalAlpha = a; ctx.strokeStyle = '#111'; ctx.lineWidth = 3.5 * a + 1;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.stroke();
    ctx.globalAlpha = 1;
  },
};

export const THEMES = { void: VOID, ink: INK };
export function getTheme(id) { return THEMES[id] || VOID; }
