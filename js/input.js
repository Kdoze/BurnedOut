// Teclado + controles de toque (direcional e botão de ação).
window.Input = (function () {
  const keys = {};
  let action = false;
  const touch = { x: 0, y: 0 };
  const listeners = [];
  const isTouch = ('ontouchstart' in window) || navigator.maxTouchPoints > 0;

  const ACTION_KEYS = ['Enter', 'NumpadEnter', ' ', 'z', 'Z', 'e', 'E', 'x', 'X'];
  const DIRS = {
    ArrowUp: 'up', w: 'up', W: 'up',
    ArrowDown: 'down', s: 'down', S: 'down',
    ArrowLeft: 'left', a: 'left', A: 'left',
    ArrowRight: 'right', d: 'right', D: 'right',
  };

  function gesture(e) {
    for (const fn of listeners) fn(e);
  }

  window.addEventListener('keydown', (e) => {
    if (DIRS[e.key]) {
      keys[DIRS[e.key]] = true;
      e.preventDefault();
    }
    if (ACTION_KEYS.includes(e.key)) {
      if (!e.repeat) action = true;
      e.preventDefault();
    }
    gesture(e);
  });
  window.addEventListener('keyup', (e) => {
    if (DIRS[e.key]) keys[DIRS[e.key]] = false;
  });
  window.addEventListener('blur', () => {
    for (const k in keys) keys[k] = false;
    touch.x = touch.y = 0;
  });
  // gestos que destravam áudio (iOS exige touchend/click)
  ['touchend', 'pointerup', 'click'].forEach((ev) => window.addEventListener(ev, gesture, { passive: true }));

  // ---- direcional na tela ----
  const dpad = document.getElementById('dpad');
  const knob = document.getElementById('knob');
  const btnA = document.getElementById('btn-a');
  let dpadId = null;

  function setFromPoint(cx, cy) {
    const r = dpad.getBoundingClientRect();
    const mx = r.left + r.width / 2, my = r.top + r.height / 2;
    let dx = (cx - mx) / (r.width / 2), dy = (cy - my) / (r.height / 2);
    const m = Math.hypot(dx, dy);
    if (m < 0.22) {
      touch.x = touch.y = 0;
    } else {
      // 8 direções
      const a = Math.atan2(dy, dx);
      const s = Math.round(a / (Math.PI / 4)) * (Math.PI / 4);
      touch.x = Math.round(Math.cos(s) * 100) / 100;
      touch.y = Math.round(Math.sin(s) * 100) / 100;
    }
    const k = Math.min(1, m);
    const ang = Math.atan2(dy, dx);
    if (knob) knob.style.transform = `translate(${Math.cos(ang) * k * 28}px, ${Math.sin(ang) * k * 28}px)`;
    dpad.dataset.dir = touch.x || touch.y ? (Math.abs(touch.x) > Math.abs(touch.y) ? (touch.x > 0 ? 'right' : 'left') : (touch.y > 0 ? 'down' : 'up')) : '';
  }
  function releaseDpad() {
    dpadId = null;
    touch.x = touch.y = 0;
    if (knob) knob.style.transform = '';
    dpad.dataset.dir = '';
  }
  if (dpad) {
    dpad.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      dpadId = e.pointerId;
      try { dpad.setPointerCapture(e.pointerId); } catch (_) { /* ignore */ }
      setFromPoint(e.clientX, e.clientY);
    });
    dpad.addEventListener('pointermove', (e) => {
      if (e.pointerId === dpadId) setFromPoint(e.clientX, e.clientY);
    });
    ['pointerup', 'pointercancel', 'lostpointercapture'].forEach((ev) =>
      dpad.addEventListener(ev, (e) => { if (e.pointerId === dpadId) releaseDpad(); })
    );
  }
  if (btnA) {
    btnA.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      action = true;
      btnA.classList.add('down');
    });
    ['pointerup', 'pointercancel', 'pointerleave'].forEach((ev) => btnA.addEventListener(ev, () => btnA.classList.remove('down')));
  }

  // toque na tela do jogo = ação (avançar textos)
  const screen = document.getElementById('screen');
  const app = document.getElementById('app');
  app.addEventListener('pointerdown', (e) => {
    if (e.target === screen || e.target === app || e.target.id === 'crt') action = true;
  });

  return {
    isTouch,
    dir() {
      let x = (keys.right ? 1 : 0) - (keys.left ? 1 : 0) + touch.x;
      let y = (keys.down ? 1 : 0) - (keys.up ? 1 : 0) + touch.y;
      const m = Math.hypot(x, y);
      if (m > 1) { x /= m; y /= m; }
      return { x, y };
    },
    consumeAction() {
      const a = action;
      action = false;
      return a;
    },
    clear() {
      action = false;
    },
    onGesture(fn) {
      listeners.push(fn);
    },
    releaseAll() {
      for (const k in keys) keys[k] = false;
      releaseDpad();
    },
  };
})();
