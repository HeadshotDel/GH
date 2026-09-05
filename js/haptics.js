// navigator.vibrate в Safari на iOS не реализован ни в одной версии.
// Единственный рабочий путь — системный тик переключателя
// <input type="checkbox" switch> (iOS 17.4+) при клике по его лейблу.
//
// Ограничение, которое стоило отдельной отладки: iOS выдаёт этот тик только
// когда клик случается в контексте пользовательского ввода. Вызов из
// requestAnimationFrame — а игровой цикл живёт именно там — молча ничего не
// делает, из-за чего вибрация работала в настройках и не работала в игре.
// Поэтому удар по шайбе не вибрирует напрямую, а ставит запрос, который
// сбрасывается из ближайшего обработчика касания: палец во время розыгрыша
// движется постоянно, так что задержка меньше кадра.

let label = null;
let enabled = true;
let supported = false;
let last = 0;
let pending = 0;
let pendingAt = 0;

const MIN_GAP = 45;     // чаще iOS всё равно душит
const STALE = 250;      // запрос старше — уже не про этот удар, глушим
const BURST_GAP = 70;

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
export function setEnabled(v) { enabled = v; if (!v) pending = 0; }

function fire() {
  if (!supported || !label) return false;
  const t = performance.now();
  if (t - last < MIN_GAP) return false;
  last = t;
  try { label.click(); return true; } catch (e) { return false; }
}

// Заявка на отклик из игрового цикла. n — сколько тиков подряд:
// одним система сильнее ударить не даёт, гол набираем серией.
export function request(n = 1) {
  if (!enabled || !supported) return;
  pending = Math.min(3, pending + n);
  pendingAt = performance.now();
  setTimeout(flush, 50);   // подстраховка на случай, если палец сейчас неподвижен
}

// Вызывается из обработчиков касания — это и есть нужный контекст ввода.
export function flush() {
  if (!pending) return;
  if (performance.now() - pendingAt > STALE) { pending = 0; return; }
  pending--;
  fire();
  if (pending) setTimeout(flush, BURST_GAP);
}

// Проверка из настроек: там мы уже внутри обработчика нажатия, бьём напрямую.
// Намеренно тем же fire(), которым пользуется игра, — иначе кнопка снова
// проверяла бы не тот путь.
export function tapNow() { return fire(); }
