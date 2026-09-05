// Настройки в localStorage. Любое обращение обёрнуто: приватный режим
// и заблокированные данные сайта не должны ронять игру.
const KEY = 'ah.settings.v1';

export const DEFAULTS = {
  theme: 'void',
  mode: 'goals',      // goals | time
  goals: 7,           // стандарт настоящего аэрохоккея
  minutes: 3,
  speed: 'normal',    // slow | normal | fast
  sound: true,
  trail: true,
  flash: true,
  shake: true,
};

export const SPEEDS = {
  slow: { max: 1550 },
  normal: { max: 2200 },
  fast: { max: 2900 },
};

let state = { ...DEFAULTS };

export function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) state = { ...DEFAULTS, ...JSON.parse(raw) };
  } catch (e) { /* приватный режим — играем с дефолтами */ }
  return state;
}

export function get() { return state; }

export function set(patch) {
  state = { ...state, ...patch };
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { /* не критично */ }
  return state;
}

// «Все эффекты» — производное значение, а не отдельный флаг: его состояние
// вычисляет ui.js по тем эффектам, что доступны на конкретном устройстве.
export const FX_KEYS = ['sound', 'trail', 'flash', 'shake'];
