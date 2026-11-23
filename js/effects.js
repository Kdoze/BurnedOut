// Pós-processamento (luz com dithering, vinheta, dessaturação, ruído, glitch),
// tentáculos da depressão e as vozes intrusivas.
window.Effects = (function () {
  const C = window.CONFIG;
  const W = C.W, H = C.H, N = W * H;

  const lr = new Float32Array(N);
  const lg = new Float32Array(N);
  const lb = new Float32Array(N);
  const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);
  // vinheta em tabela 2x maior, para poder centralizar em qualquer ponto (no menino)
  const VW = W * 2, VH = H * 2;
  const vign = new Float32Array(VW * VH);
  for (let y = 0; y < VH; y++)
    for (let x = 0; x < VW; x++) {
      const dx = (x - W) / (W / 2), dy = (y - H) / (H / 2);
      const d = Math.sqrt(dx * dx * 0.85 + dy * dy * 1.1);
      vign[y * VW + x] = Math.max(0, Math.min(1, (d - 0.45) / 0.75));
    }
  const NOISE = new Float32Array(N * 2);
  for (let i = 0; i < NOISE.length; i++) NOISE[i] = Math.random() - 0.5;

  // canvas dos tentáculos (R = núcleo, G = borda)
  const tent = document.createElement('canvas');
  tent.width = W;
  tent.height = H;
  const tctx = tent.getContext('2d', { willReadFrequently: true });
  let tentActive = false;

  const LEVELS = 9;

  // p = { ambient:[r,g,b], lights:[{x,y,r,c,i}], desat, vignette, noise, fade, glitch, tint:[r,g,b] }
  function post(ctx, p) {
    const img = ctx.getImageData(0, 0, W, H);
    const d = img.data;
    const ar = p.ambient[0], ag = p.ambient[1], ab = p.ambient[2];
    lr.fill(ar); lg.fill(ag); lb.fill(ab);
    for (const L of p.lights) {
      if (L.i <= 0.001) continue;
      const r = L.r, r2 = r * r;
      const x0 = Math.max(0, Math.floor(L.x - r)), x1 = Math.min(W - 1, Math.ceil(L.x + r));
      const y0 = Math.max(0, Math.floor(L.y - r)), y1 = Math.min(H - 1, Math.ceil(L.y + r));
      const cr = L.c[0] * L.i, cg = L.c[1] * L.i, cb = L.c[2] * L.i;
      for (let y = y0; y <= y1; y++) {
        const dy = y - L.y;
        let i = y * W + x0;
        for (let x = x0; x <= x1; x++, i++) {
          const dx = x - L.x;
          const q = dx * dx + dy * dy;
          if (q < r2) {
            let f = 1 - q / r2;
            f *= f;
            lr[i] += cr * f; lg[i] += cg * f; lb[i] += cb * f;
          }
        }
      }
    }
    const tdata = tentActive ? tctx.getImageData(0, 0, W, H).data : null;
    const desat = p.desat || 0;
    const vs = p.vignette || 0;
    const nz = (p.noise || 0) * 255;
    const fade = p.fade || 0;
    const noff = (Math.random() * N) | 0;
    const tr = p.tint ? p.tint[0] : 1, tg = p.tint ? p.tint[1] : 1, tb = p.tint ? p.tint[2] : 1;
    const vcx = Math.round(p.vcx != null ? p.vcx : W / 2), vcy = Math.round(p.vcy != null ? p.vcy : H / 2);
    for (let y = 0; y < H; y++) {
      const brow = (y & 3) * 4;
      let i = y * W;
      const vrow = Math.max(0, Math.min(VH - 1, y + H - vcy)) * VW;
      for (let x = 0; x < W; x++, i++) {
        const o = i * 4;
        const b = BAYER[brow + (x & 3)];
        if (fade > 0 && b < fade) {
          d[o] = d[o + 1] = d[o + 2] = 0;
          continue;
        }
        if (tdata) {
          if (tdata[o] > 110) {
            d[o] = 2; d[o + 1] = 0; d[o + 2] = 5;
            continue;
          }
        }
        const v = 1 - vs * vign[vrow + Math.max(0, Math.min(VW - 1, x + W - vcx))];
        let Lr = Math.floor(Math.min(1.3, lr[i] * v) * LEVELS + b) / LEVELS;
        let Lg = Math.floor(Math.min(1.3, lg[i] * v) * LEVELS + b) / LEVELS;
        let Lb = Math.floor(Math.min(1.3, lb[i] * v) * LEVELS + b) / LEVELS;
        let r = d[o] * Lr * tr, g = d[o + 1] * Lg * tg, bl = d[o + 2] * Lb * tb;
        if (desat > 0) {
          const gr = r * 0.3 + g * 0.59 + bl * 0.11;
          r += (gr - r) * desat; g += (gr - g) * desat; bl += (gr - bl) * desat;
        }
        if (nz > 0) {
          const n = NOISE[noff + i] * nz;
          r += n; g += n; bl += n;
        }
        if (tdata && tdata[o + 1] > 90) {
          // borda roxa-escura dos tentáculos
          r = r * 0.35 + 18; g = g * 0.3 + 4; bl = bl * 0.35 + 26;
        }
        d[o] = r; d[o + 1] = g; d[o + 2] = bl;
      }
    }
    // glitch: algumas linhas deslocadas
    if (p.glitch > 0 && Math.random() < p.glitch) {
      const n = 1 + ((Math.random() * 6) | 0);
      for (let k = 0; k < n; k++) {
        const y = (Math.random() * H) | 0;
        const hgt = 1 + ((Math.random() * 6) | 0);
        const sh = ((Math.random() * 2 - 1) * 14) | 0;
        for (let yy = y; yy < Math.min(H, y + hgt); yy++) {
          const row = yy * W * 4;
          const tmp = d.slice(row, row + W * 4);
          for (let x = 0; x < W; x++) {
            const sx = Math.min(W - 1, Math.max(0, x - sh));
            d[row + x * 4] = tmp[sx * 4];
            d[row + x * 4 + 1] = tmp[sx * 4 + 1] * 0.7;
            d[row + x * 4 + 2] = tmp[sx * 4 + 2];
          }
        }
      }
    }
    ctx.putImageData(img, 0, 0);
  }

  // =====================================================================
  //  TENTÁCULOS
  // =====================================================================
  const tentacles = [];
  (function gen() {
    let seed = 7;
    const r = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
    const count = 26;
    for (let k = 0; k < count; k++) {
      const edge = k % 4; // 0 topo, 1 direita, 2 baixo, 3 esquerda
      const along = (Math.floor(k / 4) + 0.15 + r() * 0.7) / Math.ceil(count / 4);
      tentacles.push({
        edge,
        along,
        start: Math.pow(k / count, 1.15) * 0.72 + r() * 0.04,
        len: 34 + r() * 60 + (k / count) * 40,
        baseR: 7 + r() * 8,
        speed: 0.5 + r() * 1.0,
        phase: r() * 10,
        amp: 5 + r() * 9,
        bend: (r() - 0.5) * 1.2,
        reach: k % 5 === 2, // alguns vão em direção ao menino
      });
    }
  })();

  function edgePoint(t) {
    switch (t.edge) {
      case 0: return [t.along * W, -8, 0, 1];
      case 1: return [W + 8, t.along * H, -1, 0];
      case 2: return [(1 - t.along) * W, H + 8, 0, -1];
      default: return [-8, (1 - t.along) * H, 1, 0];
    }
  }

  function circle(x, y, r) {
    tctx.moveTo(x + r, y);
    tctx.arc(x, y, r, 0, Math.PI * 2);
  }

  function drawTentacles(D, time, target) {
    tctx.clearRect(0, 0, W, H);
    tentActive = D > 0.005;
    if (!tentActive) return;
    const paths = [];
    // massas escuras nos cantos
    const corner = Math.min(1, D * 1.6);
    const blobs = [];
    for (const [cx, cy] of [[0, 0], [W, 0], [0, H], [W, H]]) {
      for (let k = 0; k < 5; k++) {
        const a = time * (0.4 + k * 0.13) + k * 1.7 + cx * 0.01;
        const rr = corner * (18 + k * 9) + Math.sin(a) * 4 * corner;
        if (rr > 1) blobs.push([cx + Math.cos(a) * 6 * corner, cy + Math.sin(a * 1.3) * 6 * corner, rr]);
      }
    }
    for (const t of tentacles) {
      if (D < t.start) continue;
      const g = Math.min(1, (D - t.start) / 0.22);
      const grow = g * g * (3 - 2 * g);
      const [bx, by, nx, ny] = edgePoint(t);
      let dx = nx, dy = ny;
      if (t.reach && target) {
        const vx = target.x - bx, vy = target.y - by;
        const m = Math.hypot(vx, vy) || 1;
        dx = vx / m; dy = vy / m;
      } else {
        const ca = Math.cos(t.bend), sa = Math.sin(t.bend);
        const ox = dx;
        dx = dx * ca - dy * sa;
        dy = ox * sa + dy * ca;
      }
      const px = -dy, py = dx;
      let L = t.len * grow * (0.55 + 0.75 * D) * (0.88 + 0.12 * Math.sin(time * 0.7 + t.phase));
      if (t.reach && target) {
        const dist = Math.hypot(target.x - bx, target.y - by);
        L = Math.min(dist * (0.25 + 0.6 * D) * grow, dist - 16);
      }
      const segs = 26;
      const pts = [];
      for (let i = 0; i <= segs; i++) {
        const u = i / segs;
        const along = u * L;
        const wig = Math.sin(time * t.speed + u * 5.5 + t.phase) * t.amp * u + Math.sin(time * 2.3 * t.speed + u * 11) * 1.5 * u;
        const curl = t.bend * u * u * 22;
        const x = bx + dx * along + px * (wig + curl);
        const y = by + dy * along + py * (wig + curl);
        const r = t.baseR * Math.pow(1 - u, 0.85) * (0.5 + 0.5 * grow) + 0.6;
        pts.push([x, y, r]);
      }
      paths.push(pts);
    }
    // borda (verde) -> núcleo (vermelho)
    tctx.fillStyle = 'rgb(0,255,0)';
    tctx.beginPath();
    for (const pts of paths) for (const [x, y, r] of pts) circle(x, y, r + 1.2);
    for (const [x, y, r] of blobs) circle(x, y, r + 1.5);
    tctx.fill();
    tctx.fillStyle = 'rgb(255,0,0)';
    tctx.beginPath();
    for (const pts of paths) for (const [x, y, r] of pts) circle(x, y, r);
    for (const [x, y, r] of blobs) circle(x, y, r);
    tctx.fill();

  }

  // =====================================================================
  //  VOZES INTRUSIVAS
  // =====================================================================
  let words = [];
  let spawnT = 1.2;
  let recent = [];

  function pick(list) {
    for (let tries = 0; tries < 8; tries++) {
      const s = list[(Math.random() * list.length) | 0];
      if (!recent.includes(s)) {
        recent.push(s);
        if (recent.length > 6) recent.shift();
        return s;
      }
    }
    return list[(Math.random() * list.length) | 0];
  }

  function spawnWord(D, target) {
    const big = Math.random() < 0.04 + D * 0.14 && D > 0.18;
    const text = big ? pick(C.INTRUSIVE_BIG) : pick(C.INTRUSIVE);
    let scale = big ? (D > 0.6 && Math.random() < 0.5 ? 3 : 2) : Math.random() < D * 0.25 ? 2 : 1;
    while (scale > 1 && Font.measure(text, scale) > W - 12) scale--;
    const w = Font.measure(text, scale);
    const h = 8 * scale;
    let x, y, ok = false;
    const overlaps = (ax, ay, aw, ah) => words.some((o) => {
      const ow = Font.measure(o.text, o.scale), oh = 8 * o.scale;
      return ax < o.x + ow + 4 && ax + aw + 4 > o.x && ay < o.y + oh + 3 && ay + ah + 3 > o.y;
    });
    const hitsPlayer = (ax, ay, aw, ah) => target && target.x > ax - 20 && target.x < ax + aw + 20 && target.y > ay - 20 && target.y < ay + ah + 16;
    for (let tries = 0; tries < 16 && !ok; tries++) {
      if (big && tries < 6) {
        x = (W - w) / 2 + (Math.random() * 2 - 1) * 20;
        y = (H - h) / 2 + (Math.random() * 2 - 1) * 50;
      } else {
        x = 6 + Math.random() * Math.max(1, W - w - 12);
        y = 6 + Math.random() * Math.max(1, H - h - 12);
      }
      ok = !hitsPlayer(x, y, w, h) && ((D > 0.9 && Math.random() < 0.5) || tries > 12 || !overlaps(x, y, w, h));
    }
    if (!ok && hitsPlayer(x, y, w, h)) y = target.y > H / 2 ? 8 : H - h - 8;
    const red = Math.random() < D * 0.75;
    const color = red ? (Math.random() < 0.5 ? '#c8142c' : '#8e0c1c') : Math.random() < 0.15 ? '#9d96a8' : '#ece8f2';
    words.push({
      text,
      chars: [...text],
      x: Math.round(x),
      y: Math.round(y),
      scale,
      color,
      age: 0,
      shown: 0,
      speed: big ? 10 : 26 + Math.random() * 24,
      life: (2.6 + Math.random() * 2.5) * (1 + D * 2.2) + (D > 0.82 ? 30 : 0),
      flick: Math.random(),
    });
    Sound.whisper(D);
  }

  function updateWords(dt, D, target) {
    spawnT -= dt;
    const interval = 3.4 - 3.1 * Math.pow(D, 0.85);
    const maxWords = 2 + Math.floor(D * 19);
    if (spawnT <= 0) {
      spawnT = interval * (0.6 + Math.random() * 0.8);
      if (words.length < maxWords) spawnWord(D, target);
    }
    let voiced = 0;
    for (const w of words) {
      w.age += dt;
      const before = Math.floor(w.shown);
      w.shown = Math.min(w.chars.length, w.shown + dt * w.speed);
      const after = Math.floor(w.shown);
      if (after > before && after % 2 === 0 && voiced < 2) {
        Sound.voice(D);
        voiced++;
      }
    }
    words = words.filter((w) => w.age < w.life);
  }

  function drawWords(ctx, D, time, target) {
    // parede de texto no fim (deixa um respiro em volta do menino)
    if (D > 0.7) {
      const a = Math.min(0.4, (D - 0.7) / 0.3 * 0.4);
      const chars = [...C.INTRUSIVE_WALL];
      const period = chars.length * 8;
      for (let row = 0; row < 17; row++) {
        const dir = row % 2 ? 1 : -1;
        const off = ((time * 9 * dir + row * 37) % period + period) % period;
        const y = 2 + row * 11;
        for (let k = 0; k * 8 - off < W; k++) {
          const x = k * 8 - off;
          if (x < -8) continue;
          if (target) {
            const dx = x + 4 - target.x, dy = y + 4 - target.y;
            if (dx * dx * 0.6 + dy * dy < 34 * 34) continue;
          }
          Font.draw(ctx, chars[k % chars.length], x, y, '#4a0610', { alpha: a });
        }
      }
    }
    for (const w of words) {
      const fadeIn = Math.min(1, w.age / 0.15);
      const fadeOut = Math.min(1, (w.life - w.age) / 0.7);
      let alpha = Math.min(fadeIn, fadeOut);
      if (D > 0.45 && Math.random() < 0.04 + D * 0.06) alpha *= 0.2; // pisca
      const jitter = w.scale > 1 ? (D > 0.5 ? 2 : 1) : D > 0.3 ? 1 : (Math.sin(time * 20 + w.flick * 10) > 0.6 ? 1 : 0);
      const txt = w.chars.slice(0, Math.floor(w.shown)).join('');
      Font.draw(ctx, txt, w.x, w.y, w.color, { scale: w.scale, jitter, shadow: '#000000', alpha });
    }
  }

  function reset() {
    words = [];
    spawnT = 1.2;
  }

  return { post, drawTentacles, updateWords, drawWords, reset };
})();
