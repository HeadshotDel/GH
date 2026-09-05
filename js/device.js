// Геометрия экрана и Dynamic Island.
// Остров = верхние ворота, поэтому его размеры — часть игровой механики, а не декора.

// Профили устройств: ширина×высота в CSS-пунктах -> геометрия острова.
// iPhone 15 Pro — основная цель.
const PROFILES = {
  '393x852': { w: 125, h: 36.67, top: 11 }, // 15/15 Pro, 14 Pro, 16
  '402x874': { w: 125, h: 36.67, top: 14 }, // 16 Pro
  '430x932': { w: 125, h: 36.67, top: 11 }, // 14/15 Pro Max, 15 Plus
  '440x956': { w: 125, h: 36.67, top: 14 }, // 16 Pro Max
  '393x759': { w: 125, h: 36.67, top: 11 }, // 15 Pro в Safari с панелями
};
const DEFAULT_ISLAND = { w: 125, h: 36.67, top: 11 };

function readInset(probe, side) {
  const v = parseFloat(getComputedStyle(probe)[`padding${side}`]);
  return Number.isFinite(v) ? v : 0;
}

// Возвращает null, если экран ещё не разложен. Канвас нулевого размера —
// не «пустая картинка», а мина: drawImage из него бросает InvalidStateError.
export function measure(probe) {
  const W = window.innerWidth || document.documentElement.clientWidth || 0;
  const H = window.innerHeight || document.documentElement.clientHeight || 0;
  if (W < 1 || H < 1) return null;
  const safe = {
    top: readInset(probe, 'Top'),
    bottom: readInset(probe, 'Bottom'),
    left: readInset(probe, 'Left'),
    right: readInset(probe, 'Right'),
  };

  // На устройствах с островом safe-area сверху >= 51pt. В обычном браузере
  // острова нет — рисуем симметричную «пилюлю» сами, чтобы игра выглядела так же.
  const hasIsland = safe.top >= 51;
  const prof = PROFILES[`${Math.round(W)}x${Math.round(H)}`] || DEFAULT_ISLAND;
  const iw = Math.min(prof.w, W * 0.42);
  const island = {
    w: iw,
    h: prof.h,
    top: prof.top,
    x: (W - iw) / 2,
    get bottom() { return this.top + this.h; },
    hardware: hasIsland,
  };

  // Поле симметрично: одинаковый отступ сверху и снизу. Нижний игрок при этом
  // никогда не опускает палец в зону системного свайпа «домой».
  const inset = Math.max(safe.top, safe.bottom + 18, island.bottom + 11, 44);
  const field = {
    top: inset,
    bottom: H - inset,
    left: 0,
    right: W,
    get h() { return this.bottom - this.top; },
    get w() { return this.right - this.left; },
    get cy() { return (this.top + this.bottom) / 2; },
    get cx() { return (this.left + this.right) / 2; },
  };

  // Ворота ровно по ширине острова.
  const goal = {
    w: island.w,
    x0: (W - island.w) / 2,
    x1: (W + island.w) / 2,
  };

  // Зеркальная «пилюля» снизу — точное отражение острова.
  const pill = { x: island.x, y: H - island.top - island.h, w: island.w, h: island.h };

  const puckR = Math.max(16, Math.min(26, W * 0.058));
  const paddleR = Math.max(26, Math.min(42, W * 0.092));

  return { W, H, safe, island, field, goal, pill, puckR, paddleR, dpr: Math.min(3, window.devicePixelRatio || 1) };
}

export function isLandscape() {
  return window.innerWidth > window.innerHeight;
}
