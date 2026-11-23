// Fonte bitmap 8x8 desenhada direto no buffer de baixa resolução.
(function () {
  const GLYPHS = window.FONT_GLYPHS;
  const CELL = 8;
  const chars = Object.keys(GLYPHS);
  const index = {};
  chars.forEach((c, i) => (index[c] = i));
  const COLS = 16;
  const rowsN = Math.ceil(chars.length / COLS);

  // Atlas branco
  const base = document.createElement('canvas');
  base.width = COLS * CELL;
  base.height = rowsN * CELL;
  const bctx = base.getContext('2d');
  const img = bctx.createImageData(base.width, base.height);
  chars.forEach((c, i) => {
    const hex = GLYPHS[c];
    const gx = (i % COLS) * CELL;
    const gy = Math.floor(i / COLS) * CELL;
    for (let r = 0; r < 8; r++) {
      const bits = parseInt(hex.substr(r * 2, 2), 16);
      for (let b = 0; b < 8; b++) {
        if (bits & (0x80 >> b)) {
          const p = ((gy + r) * base.width + gx + b) * 4;
          img.data[p] = img.data[p + 1] = img.data[p + 2] = 255;
          img.data[p + 3] = 255;
        }
      }
    }
  });
  bctx.putImageData(img, 0, 0);

  const tinted = {};
  function atlas(color) {
    if (tinted[color]) return tinted[color];
    const c = document.createElement('canvas');
    c.width = base.width;
    c.height = base.height;
    const x = c.getContext('2d');
    x.drawImage(base, 0, 0);
    x.globalCompositeOperation = 'source-in';
    x.fillStyle = color;
    x.fillRect(0, 0, c.width, c.height);
    tinted[color] = c;
    return c;
  }

  // Largura (em px) de uma string com escala s
  function measure(str, s = 1) {
    return [...str].length * CELL * s;
  }

  // Desenha texto. opts: { scale, jitter (px), shadow (cor), alpha, seed, spacing }
  function draw(ctx, str, x, y, color, opts = {}) {
    const s = opts.scale || 1;
    const jit = opts.jitter || 0;
    const sp = (opts.spacing || 0);
    const arr = [...str];
    const a = atlas(color);
    const sh = opts.shadow ? atlas(opts.shadow) : null;
    const prevA = ctx.globalAlpha;
    if (opts.alpha != null) ctx.globalAlpha = prevA * opts.alpha;
    let cx = Math.round(x);
    const cy = Math.round(y);
    for (let i = 0; i < arr.length; i++) {
      const ch = arr[i];
      let gi = index[ch];
      if (gi === undefined) gi = index['?'];
      if (ch !== ' ') {
        const sx = (gi % COLS) * CELL;
        const sy = Math.floor(gi / COLS) * CELL;
        let jx = 0, jy = 0;
        if (jit) {
          jx = Math.round((Math.random() * 2 - 1) * jit);
          jy = Math.round((Math.random() * 2 - 1) * jit);
        }
        if (sh) ctx.drawImage(sh, sx, sy, CELL, CELL, cx + jx + s, cy + jy + s, CELL * s, CELL * s);
        ctx.drawImage(a, sx, sy, CELL, CELL, cx + jx, cy + jy, CELL * s, CELL * s);
      }
      cx += CELL * s + sp;
    }
    ctx.globalAlpha = prevA;
  }

  // Quebra o texto em linhas de no máximo `maxChars` caracteres
  function wrap(str, maxChars) {
    const words = str.split(' ');
    const lines = [];
    let cur = '';
    for (const w of words) {
      const test = cur ? cur + ' ' + w : w;
      if ([...test].length > maxChars && cur) {
        lines.push(cur);
        cur = w;
      } else cur = test;
    }
    if (cur) lines.push(cur);
    return lines;
  }

  window.Font = { draw, measure, wrap, CELL };
})();
