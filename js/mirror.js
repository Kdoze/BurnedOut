// Espelho do banheiro: o reflexo do menino e, às vezes, a criatura atrás dele.
// Se ele continuar olhando por MIRROR_GRAB_AFTER segundos, ela o "pega" e ele sai atordoado.
// Fica desativado perto do drop da música, para nunca se misturar com a crise principal.
window.Mirror = (function () {
  const C = window.CONFIG;
  const W = C.W, H = C.H;

  // moldura e vidro
  const MX = 104, MY = 8, MW = 112, MH = 142;
  const GX = MX + 4, GY = MY + 4, GW = MW - 8, GH = MH - 8;

  const CAPTIONS = [
    'eu pareço tão cansado.',
    'olheiras fundas.',
    'quem é esse?',
    'não lembro quando dormi direito.',
    'evito olhar nos meus próprios olhos.',
  ];

  let active = null;
  let daze = 0;

  const hash = (n) => {
    const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
    return x - Math.floor(x);
  };

  function canHaveCreature(t) {
    return t < C.TREMBLE_AT - C.MIRROR_SAFE_GAP;
  }

  function open(t, force) {
    const creature = canHaveCreature(t) && (force || Math.random() < C.MIRROR_CREATURE_CHANCE);
    active = {
      t: 0,
      creature,
      phase: 'look',
      g: 0,
      caption: CAPTIONS[(Math.random() * CAPTIONS.length) | 0],
      blinkT: 2 + Math.random() * 2,
      blink: 0,
      seed: (Math.random() * 1000) | 0,
    };
    if (creature) Sound.mirrorDrone(true);
    Sound.confirm();
  }

  function close() {
    if (!active) return;
    Sound.mirrorDrone(false);
    active = null;
  }

  // Cancela tudo (usado quando a crise principal começa)
  function reset() {
    close();
    if (daze > 0) {
      daze = 0;
      Sound.setDaze(0);
    }
  }

  // Retorna 'exit' (saiu normalmente) ou 'grabbed' (a criatura pegou)
  function update(dt, action) {
    const a = active;
    a.t += dt;
    a.blinkT -= dt;
    if (a.blinkT <= 0) {
      a.blink = 0.13;
      a.blinkT = 2.4 + Math.random() * 3;
    }
    a.blink = Math.max(0, a.blink - dt);
    if (a.phase === 'look') {
      if (action && a.t > 0.35) {
        close();
        return 'exit';
      }
      if (a.creature && a.t >= C.MIRROR_GRAB_AFTER) {
        a.phase = 'grab';
        a.g = 0;
        Sound.mirrorDrone(false);
        Sound.screech();
      }
    } else {
      a.g += dt;
      if (a.g >= 1.35) {
        active = null;
        daze = C.MIRROR_DAZE;
        return 'grabbed';
      }
    }
    return null;
  }

  // ---------------- atordoado ----------------
  function tickDaze(dt) {
    if (daze <= 0) return;
    daze = Math.max(0, daze - dt);
    Sound.setDaze(dazeK());
  }
  function dazeK() {
    if (daze <= 0) return 0;
    const x = daze / C.MIRROR_DAZE;
    return Math.min(1, x * 1.25);
  }

  // ---------------- desenho ----------------
  function R(ctx, x, y, w, h, c) {
    ctx.fillStyle = c;
    ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
  }

  // corpo da criatura: capuz arredondado, corpo escuro "riscado", cauda pontuda e dois pingos laterais
  function drawBody(ctx, cx, top, s, alpha, time, seed) {
    const Wc = 40 * s, Hc = 124 * s;
    const prev = ctx.globalAlpha;
    ctx.globalAlpha = prev * alpha;
    ctx.fillStyle = '#060508';
    for (let y = 0; y < Hc; y++) {
      const u = y / Hc;
      let hw;
      if (u < 0.2) hw = (Wc / 2) * Math.sqrt(Math.max(0, 1 - Math.pow((0.2 - u) / 0.2, 2)));
      else if (u < 0.5) hw = (Wc / 2) * (1 + 0.04 * Math.sin(u * 30 + time * 2));
      else hw = (Wc / 2) * Math.pow(Math.max(0, 1 - (u - 0.5) / 0.5), 1.25);
      hw += (hash(y + seed) - 0.5) * 2.2;
      if (hw < 0.4) continue;
      const sway = Math.sin(time * 1.3 + u * 3) * 2.2 * u;
      ctx.fillRect(Math.round(cx + sway - hw), Math.round(top + y), Math.max(1, Math.round(hw * 2)), 1);
    }
    // pingos laterais
    for (const side of [-1, 1]) {
      const y0 = 0.42 * Hc, len = 0.3 * Hc;
      for (let y = 0; y < len; y++) {
        const v = y / len;
        const w = (1 - v) * 6 * s;
        const x = cx + side * (Wc / 2 - 2 * s + v * 3 * s) + Math.sin(time * 1.6 + side) * v * 2;
        ctx.fillRect(Math.round(x - w / 2), Math.round(top + y0 + y), Math.max(1, Math.round(w)), 1);
      }
    }
    // textura riscada (cinza escuro), como pinceladas
    const crawl = Math.floor(time * 5);
    const n = Math.floor(70 * s);
    for (let i = 0; i < n; i++) {
      const hx = hash(i * 3.1 + seed + crawl * 0.37), hy = hash(i * 7.7 + seed);
      const py = top + hy * Hc * 0.62;
      const u = (py - top) / Hc;
      const lim = u < 0.2 ? Math.sqrt(Math.max(0, 1 - Math.pow((0.2 - u) / 0.2, 2))) : 1;
      const px = cx + (hx - 0.5) * Wc * 0.85 * lim;
      ctx.fillStyle = i % 3 ? '#1b1920' : '#2c2933';
      ctx.fillRect(Math.round(px), Math.round(py), 1 + (i % 3), 1);
    }
    ctx.globalAlpha = prev;
  }

  // olho: amêndoa vertical branca com pupila preta (desenhado depois da escuridão, "brilha")
  function drawEye(ctx, cx, top, s, alpha, open, lookX, lookY) {
    const Wc = 40 * s, Hc = 124 * s;
    const ey = top + 0.27 * Hc;
    const eh = 0.22 * Hc * open;
    const ew = 0.34 * Wc;
    if (eh < 1) {
      R(ctx, cx - ew / 2, ey, ew, 1, 'rgba(200,196,190,' + 0.5 * alpha + ')');
      return;
    }
    const prev = ctx.globalAlpha;
    ctx.globalAlpha = prev * alpha;
    ctx.fillStyle = '#efece4';
    for (let y = 0; y < eh; y++) {
      const v = (y + 0.5) / eh;
      const hw = (ew / 2) * Math.pow(Math.sin(Math.PI * v), 0.75);
      ctx.fillRect(Math.round(cx - hw), Math.round(ey - eh / 2 + y), Math.max(1, Math.round(hw * 2)), 1);
    }
    // pupila
    const pr = Math.max(2, Math.round(2.8 * s));
    const px = Math.round(cx + lookX * s), py = Math.round(ey - eh * 0.1 + lookY * s);
    ctx.fillStyle = '#3a3836';
    for (let dy = -pr - 1; dy <= pr + 1; dy++) {
      const w = Math.floor(Math.sqrt(Math.max(0, (pr + 1) * (pr + 1) - dy * dy)));
      ctx.fillRect(px - w, py + dy, w * 2 + 1, 1);
    }
    ctx.fillStyle = '#050407';
    for (let dy = -pr; dy <= pr; dy++) {
      const w = Math.floor(Math.sqrt(Math.max(0, pr * pr - dy * dy)));
      ctx.fillRect(px - w, py + dy, w * 2 + 1, 1);
    }
    ctx.globalAlpha = prev;
  }

  function creatureState(a) {
    if (a.phase === 'look') {
      const k = Math.min(1, a.t / C.MIRROR_GRAB_AFTER);
      return {
        cx: 160 + 30 - k * 12,
        top: GY + 6 - k * 6,
        s: 1 + 0.25 * k,
        alpha: Math.max(0, Math.min(1, (a.t - 0.5) / 1.6)),
        open: Math.max(0, Math.min(1, (a.t - 1.3) / 0.9)),
      };
    }
    const g = Math.min(1, a.g / 0.5);
    const e = g * g;
    const s = 1.25 + e * 2.6;
    return { cx: 178 - e * 18, top: 84 - 0.27 * 124 * s, s, alpha: 1, open: 1 };
  }

  function render(ctx, t, touch) {
    const a = active;
    // parede de azulejos do banheiro
    R(ctx, 0, 0, W, H, '#cfd2d8');
    ctx.fillStyle = '#b1b5be';
    for (let x = 0; x < W; x += 8) ctx.fillRect(x, 0, 1, H);
    for (let y = 0; y < H; y += 8) ctx.fillRect(0, y, W, 1);
    // bancada e pia
    R(ctx, 0, 152, W, 28, '#dcdce2');
    R(ctx, 0, 152, W, 2, '#f0f0f4');
    R(ctx, 0, 176, W, 4, '#a7a9b2');
    R(ctx, 124, 159, 72, 15, '#9ea4ad');
    R(ctx, 127, 161, 66, 11, '#c6ccd4');
    R(ctx, 157, 152, 6, 8, '#8a8f98');
    // moldura
    R(ctx, MX, MY, MW, MH, '#8a8e98');
    R(ctx, MX + 1, MY + 1, MW - 2, MH - 2, '#c8cbd3');
    R(ctx, MX + 3, MY + 3, MW - 6, MH - 6, '#686c76');
    // reflexo do banheiro atrás dele
    ctx.save();
    ctx.beginPath();
    ctx.rect(GX, GY, GW, GH);
    ctx.clip();
    R(ctx, GX, GY, GW, GH, '#40454f');
    ctx.fillStyle = '#383c46';
    for (let x = GX; x < GX + GW; x += 10) ctx.fillRect(x, GY, 1, GH);
    for (let y = GY; y < GY + GH; y += 10) ctx.fillRect(GX, y, GW, 1);
    R(ctx, GX + GW - 30, GY + 22, 26, GH, '#2a2622'); // porta aberta, escuro do corredor
    R(ctx, GX + GW - 33, GY + 20, 3, GH, '#5a4a3a');
    R(ctx, GX + 4, GY + 40, 2, GH, '#7a8a9a'); // vidro do box
    const cs = a.creature ? creatureState(a) : null;
    if (cs && a.phase === 'look') drawBody(ctx, cs.cx, cs.top, cs.s, cs.alpha, a.t, a.seed);
    // o menino (reflexo)
    const img = a.blink > 0 ? Sprites.bustBlink : Sprites.bust;
    const bob = Math.sin(a.t * 1.8) > 0.6 ? 1 : 0;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(img, 160 - 24, GY + GH - 54 + bob, 48, 54);
    // brilho do vidro
    ctx.fillStyle = 'rgba(255,255,255,0.05)';
    for (let i = 0; i < 3; i++) ctx.fillRect(GX + 10 + i * 9, GY, 4, GH);
    ctx.restore();
    if (cs && a.phase === 'grab') drawBody(ctx, cs.cx, cs.top, cs.s, 1, a.t + a.g * 6, a.seed);

    // luz e clima
    const k = a.creature ? Math.min(1, a.t / C.MIRROR_GRAB_AFTER) : 0;
    const flick = a.creature && a.t > 2 && Math.random() < 0.08 + k * 0.15 ? 0.25 : 1;
    Effects.post(ctx, {
      ambient: [0.2 * flick, 0.22 * flick, 0.3 * flick],
      lights: [
        { x: 160, y: 40, r: 140, c: [0.95, 0.92, 0.88], i: 0.6 * flick },
        { x: 160, y: 110, r: 60, c: [0.8, 0.78, 0.8], i: 0.25 },
      ],
      desat: 0.15 + k * 0.5,
      vignette: 0.6 + k * 0.6,
      noise: 0.02 + k * 0.08,
      fade: a.t < 0.35 ? 1 - a.t / 0.35 : 0,
      glitch: k > 0.6 ? (k - 0.6) * 0.6 : 0,
    });
    if (cs) {
      const lookX = Math.sin(a.t * 0.7) * 1.2 - 2.5;
      drawEye(ctx, cs.cx, cs.top, cs.s, cs.alpha, cs.open, lookX, 0);
    }

    if (a.phase === 'look') {
      // legenda
      const lines = Font.wrap(a.caption, 36);
      let left = Math.max(0, Math.floor((a.t - 0.6) * 24));
      if (left > 0) {
        const tw = Math.max(...lines.map((l) => [...l].length)) * 8;
        const bh = lines.length * 11 + 6;
        R(ctx, (W - tw) / 2 - 6, H - bh - 4, tw + 12, bh, '#000');
        lines.forEach((ln, i) => {
          const arr = [...ln];
          const n = Math.max(0, Math.min(arr.length, left));
          left -= arr.length + 1;
          Font.draw(ctx, arr.slice(0, n).join(''), (W - arr.length * 8) / 2, H - bh + i * 11, '#d8d4e0');
        });
      }
      if (a.t > 1) {
        const hint = touch ? 'A: sair' : 'enter: sair';
        Font.draw(ctx, hint, W - Font.measure(hint) - 4, 2, '#4e4a58');
      }
    } else {
      const g = a.g;
      if (g >= 0.4 && g < 0.85) {
        ctx.fillStyle = 'rgba(150,0,10,0.45)';
        ctx.fillRect(0, 0, W, H);
        // espelho rachando
        ctx.fillStyle = '#f4f0ea';
        for (let i = 0; i < 9; i++) {
          let x = 160, y = 84;
          const ang = i * 0.7 + 0.3;
          for (let j = 0; j < 80; j++) {
            x += Math.cos(ang + Math.sin(j * 0.85 + i) * 0.5);
            y += Math.sin(ang + Math.cos(j * 0.65 + i) * 0.5);
            ctx.fillRect(Math.round(x), Math.round(y), 1, 1);
          }
        }
      }
      if (g >= 0.85) {
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, W, H);
      }
    }
  }

  return {
    open,
    close,
    reset,
    update,
    render,
    tickDaze,
    dazeK,
    get active() { return !!active; },
    get grabbing() { return !!active && active.phase === 'grab'; },
  };
})();
