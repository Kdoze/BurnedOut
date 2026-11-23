// Espelhos: o reflexo do menino e, às vezes, uma criatura atrás dele.
//  - banheiro do corredor: criatura "A" (capuz, olho vertical), MIRROR_CREATURE_CHANCE
//  - suíte da minha mãe:   criatura "B" (pendurada no teto, fios, olho horizontal), MIRROR2_CREATURE_CHANCE
// Se ele continuar olhando por MIRROR_GRAB_AFTER segundos, ela o "pega" e ele sai atordoado.
// Fica desativado perto do drop da música, para nunca se misturar com a crise principal.
window.Mirror = (function () {
  const C = window.CONFIG;
  const W = C.W, H = C.H;

  // moldura e vidro
  const MX = 104, MY = 8, MW = 112, MH = 142;
  const GX = MX + 4, GY = MY + 4, GW = MW - 8, GH = MH - 8;
  const BOY_Y = GY + GH - 54; // topo do busto do menino no reflexo

  const SCENES = {
    banheiro: {
      variant: 'a',
      chance: () => C.MIRROR_CREATURE_CHANCE,
      captions: () => C.MIRROR_CAPTIONS,
      wall: '#cfd2d8', grout: '#b1b5be', back: '#40454f', backLine: '#383c46', counter: '#dcdce2',
    },
    mae: {
      variant: 'b',
      chance: () => C.MIRROR2_CREATURE_CHANCE,
      captions: () => C.MIRROR2_CAPTIONS,
      wall: '#d6cbb8', grout: '#bfb19b', back: '#4a4038', backLine: '#40372f', counter: '#e6ddcf', towel: true,
    },
  };

  // linha do tempo da captura (segundos desde que ela pega)
  const G_WRAP = 0.55, G_LUNGE = 1.0, G_FLASH = 1.12, G_BREAK = 1.62, G_DARK = 2.25;

  let active = null;
  let daze = 0;
  let recover = 0;
  let returnFade = 0;

  const hash = (n) => {
    const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
    return x - Math.floor(x);
  };

  function canHaveCreature(t) {
    return t < C.TREMBLE_AT - C.MIRROR_SAFE_GAP;
  }

  function open(t, sceneId, force) {
    const sc = SCENES[sceneId] || SCENES.banheiro;
    const creature = canHaveCreature(t) && (force || Math.random() < sc.chance());
    const caps = sc.captions();
    const caption = sc.variant === 'b' && Math.random() < 0.55 ? caps[0] : caps[(Math.random() * caps.length) | 0];
    active = {
      t: 0,
      sc,
      creature,
      phase: 'look',
      g: 0,
      fired: {},
      caption,
      blinkT: 2 + Math.random() * 2,
      blink: 0,
      seed: (Math.random() * 1000) | 0,
      shards: null,
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
    recover = 0;
    returnFade = 0;
    if (daze > 0) {
      daze = 0;
      Sound.setDaze(0);
    }
  }

  function once(a, key, fn) {
    if (!a.fired[key]) {
      a.fired[key] = true;
      fn();
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
        Sound.grabStart();
      }
      return null;
    }
    a.g += dt;
    if (a.g >= G_WRAP) once(a, 'lunge', () => Sound.screech());
    if (a.g >= G_FLASH) once(a, 'shatter', () => Sound.shatter());
    if (a.g >= G_BREAK + 0.15) once(a, 'whisper', () => Sound.whisper(1));
    if (a.g >= G_DARK) {
      active = null;
      daze = C.MIRROR_DAZE;
      recover = 1.4;
      returnFade = 0.6;
      return 'grabbed';
    }
    return null;
  }

  // ---------------- depois da captura ----------------
  function tickDaze(dt) {
    recover = Math.max(0, recover - dt);
    returnFade = Math.max(0, returnFade - dt);
    if (daze <= 0) return;
    daze = Math.max(0, daze - dt);
    Sound.setDaze(dazeK());
  }
  function dazeK() {
    if (daze <= 0) return 0;
    return Math.min(1, (daze / C.MIRROR_DAZE) * 1.25);
  }

  // ---------------- desenho: utilitários ----------------
  function R(ctx, x, y, w, h, c) {
    ctx.fillStyle = c;
    ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
  }
  function discFill(ctx, cx, cy, r) {
    for (let dy = -r; dy <= r; dy++) {
      const w = Math.floor(Math.sqrt(Math.max(0, r * r - dy * dy)));
      ctx.fillRect(Math.round(cx - w), Math.round(cy + dy), w * 2 + 1, 1);
    }
  }
  // textura riscada (pinceladas cinza-escuro), como na referência
  function scratches(ctx, cx, top, w, h, s, time, seed, domeK) {
    const crawl = Math.floor(time * 5);
    const n = Math.floor(70 * s);
    for (let i = 0; i < n; i++) {
      const hx = hash(i * 3.1 + seed + crawl * 0.37), hy = hash(i * 7.7 + seed);
      const u = hy * 0.62;
      const lim = domeK && u < 0.2 ? Math.sqrt(Math.max(0, 1 - Math.pow((0.2 - u) / 0.2, 2))) : 1;
      ctx.fillStyle = i % 3 ? '#1b1920' : '#2c2933';
      ctx.fillRect(Math.round(cx + (hx - 0.5) * w * 0.85 * lim), Math.round(top + u * h), 1 + (i % 3), 1);
    }
  }

  // ---------------- criatura A: capuz, corpo riscado, olho vertical ----------------
  function bodyA(ctx, st, time, seed) {
    const s = st.s, Wc = 40 * s, Hc = 124 * s, cx = st.cx, top = st.top;
    const prev = ctx.globalAlpha;
    ctx.globalAlpha = prev * st.alpha;
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
    for (const side of [-1, 1]) {
      const y0 = 0.42 * Hc, len = 0.3 * Hc;
      for (let y = 0; y < len; y++) {
        const v = y / len;
        const w = (1 - v) * 6 * s;
        const x = cx + side * (Wc / 2 - 2 * s + v * 3 * s) + Math.sin(time * 1.6 + side) * v * 2;
        ctx.fillRect(Math.round(x - w / 2), Math.round(top + y0 + y), Math.max(1, Math.round(w)), 1);
      }
    }
    scratches(ctx, cx, top, Wc, Hc, s, time, seed, true);
    ctx.globalAlpha = prev;
  }
  function eyeA(ctx, st, lookX, lookY, pupil) {
    const s = st.s, Wc = 40 * s, Hc = 124 * s;
    const cx = st.cx, ey = st.top + 0.27 * Hc;
    const eh = 0.22 * Hc * st.open, ew = 0.34 * Wc;
    const prev = ctx.globalAlpha;
    ctx.globalAlpha = prev * st.alpha;
    if (eh < 1) {
      R(ctx, cx - ew / 2, ey, ew, 1, 'rgba(200,196,190,0.5)');
      ctx.globalAlpha = prev;
      return;
    }
    ctx.fillStyle = '#efece4';
    for (let y = 0; y < eh; y++) {
      const v = (y + 0.5) / eh;
      const hw = (ew / 2) * Math.pow(Math.sin(Math.PI * v), 0.75);
      ctx.fillRect(Math.round(cx - hw), Math.round(ey - eh / 2 + y), Math.max(1, Math.round(hw * 2)), 1);
    }
    const pr = Math.max(2, Math.round(2.8 * s * (pupil || 1)));
    const px = Math.round(cx + lookX * s), py = Math.round(ey - eh * 0.1 + lookY * s);
    ctx.fillStyle = '#3a3836';
    discFill(ctx, px, py, pr + 1);
    ctx.fillStyle = '#050407';
    discFill(ctx, px, py, pr);
    ctx.globalAlpha = prev;
  }

  // ---------------- criatura B: pendurada no teto, fios caindo, olho horizontal ----------------
  function bodyB(ctx, st, time, seed, wrapK) {
    const s = st.s, Wc = 58 * s, dh = 30 * s, cx = st.cx, top = st.top;
    const prev = ctx.globalAlpha;
    ctx.globalAlpha = prev * st.alpha;
    ctx.fillStyle = '#060508';
    // "pescoço" preso no teto
    ctx.fillRect(Math.round(cx - Wc * 0.18), Math.round(top - 60), Math.round(Wc * 0.36), 62);
    // cabeça arredondada (de cabeça pra baixo)
    for (let y = 0; y < dh; y++) {
      const u = y / dh;
      const hw = (Wc / 2) * Math.sqrt(Math.max(0, 1 - u * u)) + (hash(y + seed) - 0.5) * 2;
      ctx.fillRect(Math.round(cx - hw), Math.round(top + y), Math.max(1, Math.round(hw * 2)), 1);
    }
    // fios
    const boyX = 160, boyY = BOY_Y + 30;
    for (let i = 0; i < 9; i++) {
      const xs = cx + (i / 8 - 0.5) * Wc * 0.92;
      const len = (34 + hash(i + seed) * 50) * s * (st.len || 1);
      const y0 = top + dh * 0.55;
      for (let y = 0; y < len; y++) {
        const v = y / len;
        const w = Math.pow(1 - v, 0.8) * 3.4 * s + 0.6;
        const sway = Math.sin(time * 1.4 + i * 1.3 + v * 3) * 3 * v;
        const bend = (boyX - xs) * (wrapK || 0) * v * v + (wrapK || 0) * (boyY - y0 - y) * 0;
        ctx.fillRect(Math.round(xs + sway + bend - w / 2), Math.round(y0 + y), Math.max(1, Math.round(w)), 1);
      }
    }
    scratches(ctx, cx, top, Wc, dh * 2.4, s, time, seed, false);
    ctx.globalAlpha = prev;
  }
  function eyeB(ctx, st, lookX, lookY, pupil) {
    const s = st.s, Wc = 58 * s, dh = 30 * s;
    const cx = st.cx, cy = st.top + dh * 0.42;
    const ew = 0.56 * Wc, eh = 0.5 * dh * st.open;
    const prev = ctx.globalAlpha;
    ctx.globalAlpha = prev * st.alpha;
    if (eh < 1) {
      R(ctx, cx - ew / 2, cy, ew, 1, 'rgba(200,196,190,0.5)');
      ctx.globalAlpha = prev;
      return;
    }
    ctx.fillStyle = '#efe9e0';
    for (let x = 0; x < ew; x++) {
      const v = (x + 0.5) / ew;
      const hh = (eh / 2) * Math.pow(Math.sin(Math.PI * v), 0.75);
      ctx.fillRect(Math.round(cx - ew / 2 + x), Math.round(cy - hh), 1, Math.max(1, Math.round(hh * 2)));
    }
    const ir = Math.max(2, Math.round(4 * s * (pupil || 1)));
    const px = Math.round(cx + lookX * s * 1.6), py = Math.round(cy + lookY * s);
    ctx.fillStyle = '#7a0a14';
    discFill(ctx, px, py, ir);
    ctx.fillStyle = '#050407';
    discFill(ctx, px, py, Math.max(1, Math.round(ir * 0.45)));
    ctx.globalAlpha = prev;
  }

  // posição/tamanho da criatura ao longo do tempo
  function creatureState(a) {
    const B = a.sc.variant === 'b';
    if (a.phase === 'look' || a.g < G_WRAP) {
      const k = Math.min(1, a.t / C.MIRROR_GRAB_AFTER);
      const base = B
        ? { cx: 160 + 6 - k * 4, top: GY - 2 + k * 12, s: 1 + 0.15 * k, len: 0.55 + 0.45 * k }
        : { cx: 160 + 30 - k * 12, top: GY + 6 - k * 6, s: 1 + 0.25 * k };
      base.alpha = Math.max(0, Math.min(1, (a.t - 0.5) / 1.6));
      base.open = Math.max(0, Math.min(1, (a.t - 1.3) / 0.9));
      return base;
    }
    // investida para fora do espelho
    const g = Math.min(1, (a.g - G_WRAP) / (G_LUNGE - G_WRAP));
    const e = g * g;
    if (B) {
      const s = 1.15 + e * 3.6;
      return { cx: 162, top: 80 - 30 * s * 0.42, s, len: 1, alpha: 1, open: 1 };
    }
    const s = 1.25 + e * 2.8;
    return { cx: 178 - e * 18, top: 84 - 0.27 * 124 * s, s, alpha: 1, open: 1 };
  }

  // tentáculos que agarram o menino (criatura A)
  function wrapTendrils(ctx, st, p, time) {
    const s = st.s, Hc = 124 * s;
    const starts = [
      [st.cx - 16 * s, st.top + 0.34 * Hc, 132, BOY_Y + 40],
      [st.cx - 12 * s, st.top + 0.5 * Hc, 150, BOY_Y + 34],
      [st.cx - 4 * s, st.top + 0.22 * Hc, 140, BOY_Y + 20],
      [st.cx + 6 * s, st.top + 0.62 * Hc, 186, BOY_Y + 44],
    ];
    ctx.fillStyle = '#060508';
    starts.forEach(([x0, y0, x1, y1], i) => {
      const n = 40;
      const upto = Math.floor(n * Math.min(1, p * 1.3 - i * 0.08));
      for (let j = 0; j <= upto; j++) {
        const u = j / n;
        const mx = (x0 + x1) / 2 + Math.sin(i * 2.1) * 20, my = Math.min(y0, y1) - 14;
        const x = (1 - u) * (1 - u) * x0 + 2 * (1 - u) * u * mx + u * u * x1 + Math.sin(time * 9 + j) * 0.6;
        const y = (1 - u) * (1 - u) * y0 + 2 * (1 - u) * u * my + u * u * y1;
        discFill(ctx, x, y, Math.max(1, Math.round((1 - u * 0.6) * 3)));
      }
    });
  }

  // aberração cromática (separa vermelho e azul)
  function rgbSplit(ctx, k) {
    k = Math.round(k);
    if (k < 1) return;
    const img = ctx.getImageData(0, 0, W, H);
    const d = img.data;
    const src = new Uint8ClampedArray(d);
    for (let y = 0; y < H; y++) {
      const row = y * W * 4;
      for (let x = 0; x < W; x++) {
        const o = row + x * 4;
        const xr = Math.min(W - 1, x + k), xb = Math.max(0, x - k);
        d[o] = src[row + xr * 4];
        d[o + 2] = src[row + xb * 4 + 2];
      }
    }
    ctx.putImageData(img, 0, 0);
  }

  function makeShards(seed) {
    const out = [];
    for (let i = 0; i < 18; i++) {
      out.push({
        x: GX + hash(i + seed) * GW,
        y: GY + hash(i * 3 + seed) * GH * 0.8,
        vx: (hash(i * 5 + seed) - 0.5) * 90,
        vy: -30 - hash(i * 7 + seed) * 60,
        r: 3 + hash(i * 11 + seed) * 7,
        rot: hash(i * 13 + seed) * 6,
        vr: (hash(i * 17 + seed) - 0.5) * 12,
      });
    }
    return out;
  }

  // ---------------- cena ----------------
  function drawRoom(ctx, a) {
    const sc = a.sc;
    R(ctx, 0, 0, W, H, sc.wall);
    ctx.fillStyle = sc.grout;
    for (let x = 0; x < W; x += 8) ctx.fillRect(x, 0, 1, H);
    for (let y = 0; y < H; y += 8) ctx.fillRect(0, y, W, 1);
    R(ctx, 0, 152, W, 28, sc.counter);
    R(ctx, 0, 152, W, 2, '#f4f2ee');
    R(ctx, 0, 176, W, 4, '#a7a29a');
    R(ctx, 124, 159, 72, 15, '#9ea4ad');
    R(ctx, 127, 161, 66, 11, '#c6ccd4');
    R(ctx, 157, 152, 6, 8, '#8a8f98');
    if (sc.towel) {
      // coisas da minha mãe na bancada
      R(ctx, 70, 146, 6, 10, '#c88aa0'); R(ctx, 71, 144, 4, 2, '#eee');
      R(ctx, 80, 149, 5, 7, '#e8d8a8');
      R(ctx, 236, 147, 10, 9, '#f2f0ec'); R(ctx, 238, 145, 6, 2, '#d8d0c8');
    }
    R(ctx, MX, MY, MW, MH, '#8a8e98');
    R(ctx, MX + 1, MY + 1, MW - 2, MH - 2, sc.towel ? '#d8c8a0' : '#c8cbd3');
    R(ctx, MX + 3, MY + 3, MW - 6, MH - 6, '#686c76');
  }

  function drawReflection(ctx, a, cs, shake) {
    const sc = a.sc;
    ctx.save();
    ctx.beginPath();
    ctx.rect(GX, GY, GW, GH);
    ctx.clip();
    R(ctx, GX, GY, GW, GH, sc.back);
    ctx.fillStyle = sc.backLine;
    for (let x = GX; x < GX + GW; x += 10) ctx.fillRect(x, GY, 1, GH);
    for (let y = GY; y < GY + GH; y += 10) ctx.fillRect(GX, y, GW, 1);
    R(ctx, GX + GW - 30, GY + 22, 26, GH, '#2a2622');
    R(ctx, GX + GW - 33, GY + 20, 3, GH, '#5a4a3a');
    if (sc.towel) {
      R(ctx, GX + 8, GY + 30, 16, 40, '#8a6a7a'); // toalha pendurada
      R(ctx, GX + 8, GY + 30, 16, 3, '#6a4a5a');
    } else R(ctx, GX + 4, GY + 40, 2, GH, '#7a8a9a');
    const grabbing = a.phase === 'grab';
    const behind = cs && (!grabbing || a.g < G_WRAP);
    if (behind) (a.sc.variant === 'b' ? bodyB(ctx, cs, a.t, a.seed, 0) : bodyA(ctx, cs, a.t, a.seed));
    // o menino (reflexo)
    let img = a.blink > 0 ? Sprites.bustBlink : Sprites.bust;
    let jx = 0;
    if (grabbing && a.g < G_WRAP) {
      img = Math.floor(a.g * 18) % 2 ? Sprites.bustBlink : Sprites.bust; // treme, pisca desesperado
      jx = Math.round((Math.random() * 2 - 1) * 2);
    }
    const bob = Math.sin(a.t * 1.8) > 0.6 ? 1 : 0;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(img, 160 - 24 + jx, BOY_Y + bob, 48, 54);
    // agarrando: os fios/tentáculos passam por cima dele
    if (grabbing && a.g < G_WRAP && cs) {
      const p = a.g / G_WRAP;
      if (a.sc.variant === 'b') bodyB(ctx, cs, a.t + a.g * 3, a.seed, p * 0.9);
      else wrapTendrils(ctx, cs, p, a.t);
    }
    ctx.fillStyle = 'rgba(255,255,255,0.05)';
    for (let i = 0; i < 3; i++) ctx.fillRect(GX + 10 + i * 9, GY, 4, GH);
    ctx.restore();
  }

  function render(ctx, t, touch) {
    const a = active;
    const B = a.sc.variant === 'b';
    const cs = a.creature ? creatureState(a) : null;
    const g = a.phase === 'grab' ? a.g : -1;

    // --- fases finais: flash, estilhaços, escuro ---
    if (g >= G_FLASH && g < G_BREAK) {
      renderBreak(ctx, a, g);
      return;
    }
    if (g >= G_BREAK) {
      renderDark(ctx, a, g);
      return;
    }

    // tremor
    const amp = g >= G_WRAP ? 6 : g >= 0 ? 2 : 0;
    ctx.save();
    if (amp) ctx.translate(Math.round((Math.random() * 2 - 1) * amp), Math.round((Math.random() * 2 - 1) * amp));
    drawRoom(ctx, a);
    drawReflection(ctx, a, cs);
    if (cs && g >= G_WRAP) (B ? bodyB(ctx, cs, a.t + g * 6, a.seed, 1) : bodyA(ctx, cs, a.t + g * 6, a.seed));
    ctx.restore();

    // luz e clima
    const k = a.creature ? Math.min(1, a.t / C.MIRROR_GRAB_AFTER) : 0;
    const flick = a.creature && a.t > 2 && Math.random() < 0.08 + k * 0.15 ? 0.25 : 1;
    const red = g >= 0 ? Math.min(1, g / G_WRAP) : 0;
    Effects.post(ctx, {
      ambient: [0.2 * flick, 0.22 * flick, 0.3 * flick],
      lights: [
        { x: 160, y: 40, r: 140, c: [0.95, 0.92, 0.88], i: 0.6 * flick },
        { x: 160, y: 110, r: 60, c: [0.8, 0.78, 0.8], i: 0.25 },
      ],
      desat: 0.15 + k * 0.5,
      vignette: 0.6 + k * 0.6 + red * 0.5,
      noise: 0.02 + k * 0.08 + red * 0.08,
      fade: a.t < 0.35 ? 1 - a.t / 0.35 : 0,
      glitch: k > 0.6 ? (k - 0.6) * 0.6 + red * 0.5 : 0,
      tint: red > 0 ? [1 + red * 0.5, 1 - red * 0.45, 1 - red * 0.4] : null,
    });
    if (cs) {
      const lookX = g >= 0 ? 0 : Math.sin(a.t * 0.7) * 1.2 - 2.5;
      const pupil = g >= 0 ? Math.max(0.45, 1 - g * 1.2) : 1;
      (B ? eyeB : eyeA)(ctx, cs, lookX, 0, pupil);
    }
    if (g >= G_WRAP) rgbSplit(ctx, 2 + ((g - G_WRAP) / (G_LUNGE - G_WRAP)) * 4);
    if (g >= G_LUNGE) {
      // flash branco e um quadro em negativo
      if (g < G_LUNGE + 0.06) R(ctx, 0, 0, W, H, '#ffffff');
      else {
        ctx.globalCompositeOperation = 'difference';
        R(ctx, 0, 0, W, H, '#ffffff');
        ctx.globalCompositeOperation = 'source-over';
      }
    }

    if (a.phase === 'look') {
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
    }
  }

  // espelho quebrando: rachaduras crescendo e cacos caindo
  function renderBreak(ctx, a, g) {
    if (!a.shards) a.shards = makeShards(a.seed);
    const p = (g - G_FLASH) / (G_BREAK - G_FLASH);
    R(ctx, 0, 0, W, H, '#140204');
    // olho enorme ao fundo, vermelho
    const B = a.sc.variant === 'b';
    const st = B ? { cx: 160, top: 90 - 30 * 4.8 * 0.42, s: 4.8, alpha: 0.85, open: 1 } : { cx: 160, top: 90 - 0.27 * 124 * 4, s: 4, alpha: 0.85, open: 1 };
    (B ? eyeB : eyeA)(ctx, st, 0, 0, 0.5);
    ctx.fillStyle = 'rgba(170,0,16,0.55)';
    ctx.fillRect(0, 0, W, H);
    // rachaduras (irregulares, com alguns galhos)
    ctx.fillStyle = '#f4f0ea';
    for (let i = 0; i < 11; i++) {
      let x = 160, y = 84;
      let ang = i * 0.57 + 0.3 + (hash(i + a.seed) - 0.5) * 0.4;
      const len = Math.floor((30 + 130 * Math.min(1, p * 1.6)) * (0.6 + hash(i * 3 + a.seed) * 0.6));
      for (let j = 0; j < len; j++) {
        if (j % 9 === 0) ang += (hash(i * 31 + j + a.seed) - 0.5) * 0.5;
        x += Math.cos(ang);
        y += Math.sin(ang);
        ctx.fillRect(Math.round(x), Math.round(y), 1, 1);
        if (j > 12 && hash(i * 97 + j + a.seed) < 0.025) {
          let bx = x, by = y;
          const bang = ang + (hash(j + i) < 0.5 ? -1 : 1) * (0.6 + hash(j * 7 + i) * 0.7);
          const bl = 5 + Math.floor(hash(j * 13 + i) * 16);
          for (let q = 0; q < bl; q++) {
            bx += Math.cos(bang + Math.sin(q * 0.7) * 0.2);
            by += Math.sin(bang + Math.sin(q * 0.7) * 0.2);
            ctx.fillRect(Math.round(bx), Math.round(by), 1, 1);
          }
        }
      }
    }
    // cacos caindo
    const tau = g - G_FLASH;
    for (const s of a.shards) {
      const x = s.x + s.vx * tau, y = s.y + s.vy * tau + 0.5 * 420 * tau * tau;
      const r = s.rot + s.vr * tau;
      ctx.fillStyle = '#d8e2ec';
      ctx.beginPath();
      ctx.moveTo(x + Math.cos(r) * s.r, y + Math.sin(r) * s.r);
      ctx.lineTo(x + Math.cos(r + 2.3) * s.r * 0.7, y + Math.sin(r + 2.3) * s.r * 0.7);
      ctx.lineTo(x + Math.cos(r + 4.1) * s.r, y + Math.sin(r + 4.1) * s.r);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(Math.round(x), Math.round(y), 1, 1);
    }
    rgbSplit(ctx, 3 * (1 - p) + 1);
  }

  // escuro: o olho aparece pequeno e fecha devagar
  function renderDark(ctx, a, g) {
    R(ctx, 0, 0, W, H, '#000');
    const k = (g - G_BREAK) / (G_DARK - G_BREAK);
    if (k > 0.15 && k < 0.9) {
      const open = k < 0.45 ? (k - 0.15) / 0.3 : Math.max(0, 1 - (k - 0.45) / 0.4);
      const B = a.sc.variant === 'b';
      const st = B ? { cx: 160, top: 86 - 30 * 0.42, s: 1, alpha: 1, open } : { cx: 160, top: 86 - 0.27 * 124, s: 1, alpha: 1, open };
      (B ? eyeB : eyeA)(ctx, st, 0, 0, 1);
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
    get recovering() { return recover > 0; },
    get returnFade() { return returnFade / 0.6; },
  };
})();
