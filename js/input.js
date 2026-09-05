// Два пальца на одном экране. Игрок определяется по половине, где палец
// коснулся первым; дальше палец может уходить куда угодно — бита останется
// зажатой в своей половине.

export function attachInput(canvas, getWorld, onFirstTouch, isPlayable, canControl = () => true) {
  const owner = [null, null]; // pointerId для верхнего и нижнего игрока
  let unlocked = false;

  function playerFor(y) {
    const w = getWorld();
    return y < w.g.field.cy ? 0 : 1;
  }

  function setTarget(i, x, y, snap) {
    const p = getWorld().paddles[i];
    p.tx = x; p.ty = y;          // границы половины наложит сама физика
    if (snap) p.snap = true;
  }

  function down(e) {
    if (!unlocked) { unlocked = true; onFirstTouch(); }
    if (!isPlayable()) return;
    const i = playerFor(e.clientY);
    if (!canControl(i)) return;             // этой битой играет бот
    if (owner[i] !== null) return;          // у игрока уже есть активный палец
    owner[i] = e.pointerId;
    setTarget(i, e.clientX, e.clientY, true);
    try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* палец уже отпущен */ }
  }

  function move(e) {
    for (let i = 0; i < 2; i++) {
      if (owner[i] === e.pointerId) { setTarget(i, e.clientX, e.clientY, false); return; }
    }
  }

  function up(e) {
    for (let i = 0; i < 2; i++) if (owner[i] === e.pointerId) owner[i] = null;
  }

  canvas.addEventListener('pointerdown', down);
  canvas.addEventListener('pointermove', move);
  canvas.addEventListener('pointerup', up);
  canvas.addEventListener('pointercancel', up);
  canvas.addEventListener('lostpointercapture', up);

  // Safari всё равно попробует тянуть страницу и показывать лупу — глушим,
  // кроме прокручиваемой панели настроек.
  document.addEventListener('touchmove', (e) => {
    if (!e.target.closest || !e.target.closest('.panel.scroll')) e.preventDefault();
  }, { passive: false });
  document.addEventListener('gesturestart', (e) => e.preventDefault());
  document.addEventListener('dblclick', (e) => e.preventDefault());

}
