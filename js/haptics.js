// navigator.vibrate в Safari на iOS не реализован ни в одной версии.
// Единственный рабочий путь — переключатель <input type="checkbox" switch>
// (iOS 17.4+): системный тик срабатывает при клике по его лейблу.
// Отклик один и тот же, силу не изменить, частые повторы система душит —
// поэтому ограничиваем частоту и оставляем тумблер в настройках.

let label = null;
let input = null;
let enabled = true;
let last = 0;
let supported = false;

export function init() {
  label = document.getElementById('haptic-label');
  input = document.getElementById('haptic-input');
  supported = !!input && 'switch' in document.createElement('input');
  if (label) {
    // Элемент должен быть в потоке и кликабельным, иначе тик не срабатывает.
    Object.assign(label.style, {
      position: 'fixed', top: '0', left: '0', width: '1px', height: '1px',
      opacity: '0.002', pointerEvents: 'none', zIndex: '-1', overflow: 'hidden',
    });
  }
  return supported;
}

export function isSupported() { return supported; }
export function setEnabled(v) { enabled = v; }

// minGap — не чаще, иначе iOS начинает пропускать тики.
export function tap(minGap = 55) {
  if (!enabled || !supported || !label) return false;
  const t = performance.now();
  if (t - last < minGap) return false;
  last = t;
  try { label.click(); return true; } catch (e) { return false; }
}

// Гол — серия тиков: один сильный отклик система дать не может.
export function burst(n = 3, gap = 70) {
  if (!enabled || !supported) return;
  for (let i = 0; i < n; i++) setTimeout(() => { last = 0; tap(0); }, i * gap);
}
