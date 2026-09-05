// Тактильный отклик на iOS: что удалось выяснить экспериментом.
//
// navigator.vibrate в Safari не реализован ни в одной версии. Единственный
// рабочий путь — системный тик переключателя <input type="checkbox" switch>
// (iOS 17.4+) при клике по его лейблу. Но у него есть жёсткое условие,
// которое и решило судьбу вибрации в этой игре.
//
// Замер на iPhone 15 Pro (design/haptics-test.html), семь контекстов:
//   click ................................. есть
//   touchend .............................. есть
//   setTimeout через 300 мс после жеста ... есть
//   requestAnimationFrame после жеста ..... есть
//   pointerdown ........................... НЕТ
//   setTimeout через 3 с после жеста ...... НЕТ
//   pointermove во время движения пальца .. НЕТ
//
// Вывод: тик требует «права на отклик», которое выдаёт завершённый жест
// (touchend/click) и которое живёт пару секунд. Начало касания его не даёт.
// Пока палец прижат к экрану и скользит, ни одного touchend не происходит —
// значит во время розыгрыша отклик невозможен в принципе. Поэтому удары
// по шайбе и голы не вибрируют: не «не реализовано», а не даёт система.
//
// Остаётся то, что работает честно: тик на нажатиях кнопок.

let label = null;
let supported = false;
let last = 0;
const MIN_GAP = 45;   // чаще iOS всё равно душит

export function init() {
  label = document.getElementById('haptic-label');
  const input = document.getElementById('haptic-input');
  supported = !!input && !!label && 'switch' in document.createElement('input');
  if (label) {
    // Элемент должен остаться в потоке и кликабельным: visibility:hidden
    // и display:none тик убивают.
    Object.assign(label.style, {
      position: 'fixed', top: '0', left: '0', width: '1px', height: '1px',
      opacity: '0.002', pointerEvents: 'none', zIndex: '-1', overflow: 'hidden',
    });
  }
  return supported;
}

export function isSupported() { return supported; }

// Вызывать только из обработчиков нажатия — в другом контексте система
// промолчит, и это не лечится.
export function tap() {
  if (!supported || !label) return false;
  const t = performance.now();
  if (t - last < MIN_GAP) return false;
  last = t;
  try { label.click(); return true; } catch (e) { return false; }
}
