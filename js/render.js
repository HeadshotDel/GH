// Отрисовка. Статика стола печётся один раз в offscreen-канвасы,
// каждый кадр — только блиты и несколько примитивов.

export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d', { alpha: false });
  let g = null, theme = null;
  let base = null, over = null;
  let sPad = [null, null], sPuck = null;

  function bakeLayer(draw) {
    const c = document.createElement('canvas');
    c.width = Math.ceil(g.W * g.dpr);
    c.height = Math.ceil(g.H * g.dpr);
    const x = c.getContext('2d');
    x.scale(g.dpr, g.dpr);
    draw(x, g);
    return c;
  }

  function setup(geom, th) {
    g = geom; theme = th;
    canvas.width = Math.round(g.W * g.dpr);
    canvas.height = Math.round(g.H * g.dpr);
    canvas.style.width = g.W + 'px';
    canvas.style.height = g.H + 'px';
    ctx.setTransform(g.dpr, 0, 0, g.dpr, 0, 0);

    base = bakeLayer((x) => theme.background(x, g));
    over = bakeLayer((x) => theme.overlay(x, g));
    sPad = [
      theme.paddleSprite(g.paddleR, theme.p1, g.dpr),
      theme.paddleSprite(g.paddleR, theme.p2, g.dpr),
    ];
    sPuck = theme.puckSprite(g.puckR, g.dpr);
  }

  function blit(sp, x, y, scale = 1) {
    const s = sp.s * scale;
    ctx.drawImage(sp.canvas, x - s / 2, y - s / 2, s, s);
  }

  function drawScores(v) {
    const size = Math.round(g.W * 0.118);
    ctx.font = theme.score.font(size);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.globalAlpha = theme.score.alpha;

    const pop = (t) => 1 + Math.max(0, t) * 0.5;
    const x1 = g.W * 0.118, y1 = g.field.top + g.field.h * 0.10;
    const x2 = g.W * 0.882, y2 = g.field.bottom - g.field.h * 0.10;

    ctx.save();
    ctx.translate(x1, y1); ctx.rotate(Math.PI); ctx.scale(pop(v.pop1), pop(v.pop1));
    ctx.fillStyle = theme.p1; ctx.fillText(String(v.score1), 0, 0);
    ctx.restore();

    ctx.save();
    ctx.translate(x2, y2); ctx.scale(pop(v.pop2), pop(v.pop2));
    ctx.fillStyle = theme.p2; ctx.fillText(String(v.score2), 0, 0);
    ctx.restore();

    if (v.mode === 'time') {
      const mm = Math.max(0, Math.ceil(v.timeLeft));
      const label = `${Math.floor(mm / 60)}:${String(mm % 60).padStart(2, '0')}`;
      ctx.font = `600 ${Math.round(g.W * 0.042)}px -apple-system, system-ui, sans-serif`;
      ctx.globalAlpha = v.timeLeft <= 10 ? 0.55 + 0.45 * Math.abs(Math.sin(v.clock * 4)) : 0.42;
      ctx.fillStyle = theme.id === 'ink' ? '#111' : '#ffffff';
      ctx.save();
      ctx.translate(g.field.cx, g.field.cy - g.W * 0.045); ctx.rotate(Math.PI);
      ctx.fillText(label, 0, 0); ctx.restore();
      ctx.fillText(label, g.field.cx, g.field.cy + g.W * 0.045);
    }
    ctx.globalAlpha = 1;
  }

  function draw(w, v) {
    ctx.save();
    if (v.shake > 0) {
      const m = v.shake * g.W * 0.022;
      ctx.translate((Math.random() * 2 - 1) * m, (Math.random() * 2 - 1) * m);
    }

    ctx.drawImage(base, 0, 0, g.W, g.H);

    if (v.trail && v.trail.length) theme.trail(ctx, v.trail, g.puckR);

    drawScores(v);

    const sp = Math.hypot(w.puck.vx, w.puck.vy) / w.maxSpeed;
    const puckAlpha = w.scoring ? Math.max(0, 1 - w.scoringT * 4) : 1;
    if (puckAlpha > 0) {
      ctx.globalAlpha = puckAlpha;
      blit(sPuck, w.puck.x, w.puck.y, 1 + sp * 0.14);
      ctx.globalAlpha = 1;
    }

    blit(sPad[0], w.paddles[0].x, w.paddles[0].y);
    blit(sPad[1], w.paddles[1].x, w.paddles[1].y);

    for (const f of v.rings) {
      const k = f.t / f.life;
      theme.flashRing(ctx, f.x, f.y, g.puckR * (1 + k * 3.2), 1 - k, f.color);
    }

    if (v.countdown > 0) {
      const size = Math.round(g.W * 0.17);
      ctx.font = theme.score.font(size);
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillStyle = theme.id === 'ink' ? '#111' : '#ffffff';
      ctx.globalAlpha = 0.8;
      const off = g.W * 0.125;
      ctx.save();
      ctx.translate(g.field.cx, g.field.cy - off); ctx.rotate(Math.PI);
      ctx.fillText(String(v.countdown), 0, 0);
      ctx.restore();
      ctx.fillText(String(v.countdown), g.field.cx, g.field.cy + off);
      ctx.globalAlpha = 1;
    }

    if (v.goalFlash > 0) {
      ctx.globalAlpha = v.goalFlash * 0.30;
      ctx.fillStyle = v.goalColor;
      ctx.fillRect(0, 0, g.W, g.H);
      ctx.globalAlpha = 1;
    }

    ctx.drawImage(over, 0, 0, g.W, g.H);
    ctx.restore();
  }

  return { setup, draw, get geom() { return g; } };
}
