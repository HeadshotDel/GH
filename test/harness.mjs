// Общая обвязка для тестов: геометрия iPhone 15 Pro без браузера
// и детерминированный генератор, чтобы прогоны были воспроизводимы.

import { sizes } from '../js/device.js';

export function makeGeom(W = 393, H = 852, islandW = 125) {
  const field = {
    top: 59, bottom: 793, left: 0, right: W,
    get h() { return this.bottom - this.top; },
    get w() { return this.right - this.left; },
    get cy() { return (this.top + this.bottom) / 2; },
    get cx() { return (this.left + this.right) / 2; },
  };
  return {
    W, H, field,
    island: { w: islandW, h: 36.67, top: 11, x: (W - islandW) / 2, get bottom() { return this.top + this.h; } },
    goal: { w: islandW, x0: (W - islandW) / 2, x1: (W + islandW) / 2 },
    pill: { x: (W - islandW) / 2, y: H - 11 - 36.67, w: islandW, h: 36.67 },
    ...sizes(W), dpr: 3,
  };
}

export function seeded(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
