// Aparição: ao entrar ou sair de um cômodo há APPARITION_CHANCE (3%) de a criatura do espelho
// do banheiro aparecer, sempre longe do menino, por ~1 segundo, e sumir esmaecendo.
// Em volta dela o ambiente fica mais escuro e distorcido (a depressão se manifestando).
window.Apparition = (function () {
  const C = window.CONFIG;
  const T = C.TILE, W = C.W, H = C.H;

  // Sprite em escala do mundo (15x38): capuz, corpo riscado, dois pingos e cauda pontuda.
  // k = preto, g/G = riscos cinza-escuro. O olho é desenhado à parte, "brilhando".
  const ROWS = [
    '.....kkkkk.....',
    '...kkkgkkkkk...',
    '..kkgkkkkkGkk..',
    '.kkkkkkkkkkkkk.',
    '.kkGkkkkkkkgkk.',
    'kkkkkkkkkkkkkkk',
    'kkgkkkkkkkkkkGk',
    'kkkkkkkkkkkkkkk',
    'kkkkkkkkkkkkkkk',
    'kGkkkkkkkkkkgkk',
    'kkkkkkkkkkkkkkk',
    'kkkkkkkkkkkkkkk',
    'kkgkkkkkkkkkkkk',
    'kkkkkkkkkkkkGkk',
    'kkkkkkkkkkkkkkk',
    'kkkkkgkkkkkkkkk',
    'kkkkkkkkkkkgkkk',
    'kkkkkkkkkkkkkkk',
    'kk.kkkkkkkkk.kk',
    'kk.kkkkgkkkk.kk',
    'kk..kkkkkkk..kk',
    'kk..kkkkkkk..kk',
    '.k..kkkkkkk..k.',
    '.k..kkkkkkk..k.',
    '.k...kkkkk...k.',
    '.k...kkkkk...k.',
    '.....kkkkk...k.',
    '.....kkkkk.....',
    '.....kkgkk.....',
    '......kkk......',
    '......kkk......',
    '......kkk......',
    '......kkk......',
    '.......kk......',
    '.......kk......',
    '.......k.......',
    '.......k.......',
    '.......k.......',
  ];
  const PAL = { k: '#050407', g: '#1c1a22', G: '#2b2832' };
  // olho em amêndoa vertical: [linha, x inicial, x final]
  const EYE = [[4, 7, 7], [5, 6, 8], [6, 6, 8], [7, 5, 9], [8, 5, 9], [9, 6, 8], [10, 6, 8], [11, 7, 7]];

  const body = document.createElement('canvas');
  body.width = ROWS[0].length;
  body.height = ROWS.length;
  {
    const x = body.getContext('2d');
    ROWS.forEach((r, y) => {
      for (let i = 0; i < r.length; i++) {
        if (PAL[r[i]]) {
          x.fillStyle = PAL[r[i]];
          x.fillRect(i, y, 1, 1);
        }
      }
    });
  }

  const HOLD = 1.25; // ~1 s visível depois do corte de entrada do cômodo
  const FADE = 0.8;
  let cur = null;

  function trySpawn(room, player, songT, force) {
    if (cur || songT >= C.TREMBLE_AT - 3) return;
    if (!force && Math.random() >= C.APPARITION_CHANCE) return;
    const R = World.ROOMS[room];
    if (!R) return;
    const cam = World.camera(room, player.x, player.y, W, H);
    const cands = [];
    for (const [tx, ty] of R.floors) {
      const x = tx * T + 8, y = ty * T + 13; // pés
      if (World.blocked(x - 4, y - 6, x + 4, y)) continue;
      const sx = x - cam.x, sy = y - cam.y;
      if (sx < 12 || sx > W - 12 || sy < 42 || sy > H - 4) continue; // inteira na tela
      cands.push({ x, y, d: Math.hypot(x - player.x, y - player.y) });
    }
    if (!cands.length) return;
    const dmax = Math.max(...cands.map((c) => c.d));
    if (dmax < 40) return; // cômodo pequeno demais para ficar longe
    const far = cands.filter((c) => c.d >= Math.max(40, dmax * 0.7));
    const c = far[(Math.random() * far.length) | 0];
    cur = { x: c.x, y: c.y, room, t: 0 };
    Sound.presence();
  }

  function update(dt, room) {
    if (!cur) return;
    if (room !== cur.room) { cur = null; return; }
    cur.t += dt;
    if (cur.t > HOLD + FADE) cur = null;
  }

  function alpha() {
    if (!cur) return 0;
    if (cur.t < 0.12) return cur.t / 0.12;
    if (cur.t < HOLD) return 1;
    return Math.max(0, 1 - (cur.t - HOLD) / FADE);
  }

  function drawBody(ctx, cam, time) {
    const a = alpha();
    if (a <= 0) return;
    const bob = Math.sin(time * 2.2) > 0.4 ? -1 : 0;
    const prev = ctx.globalAlpha;
    ctx.globalAlpha = prev * a;
    ctx.drawImage(body, Math.round(cur.x - 7 - cam.x), Math.round(cur.y - ROWS.length - cam.y + bob));
    ctx.globalAlpha = prev;
  }

  // olho "brilhando" (desenhado depois da escuridão); a pupila olha para o menino
  function drawEye(ctx, cam, player, time, k) {
    const a = alpha() * k;
    if (a <= 0.02) return;
    const bob = Math.sin(time * 2.2) > 0.4 ? -1 : 0;
    const ox = Math.round(cur.x - 7 - cam.x), oy = Math.round(cur.y - ROWS.length - cam.y + bob);
    const prev = ctx.globalAlpha;
    ctx.globalAlpha = prev * a;
    ctx.fillStyle = '#efece4';
    for (const [r, x0, x1] of EYE) ctx.fillRect(ox + x0, oy + r, x1 - x0 + 1, 1);
    const px = player.x < cur.x ? 6 : 7;
    ctx.fillStyle = '#050407';
    ctx.fillRect(ox + px, oy + 7, 2, 2);
    ctx.globalAlpha = prev;
  }

  // escuridão + distorção em volta dela (parâmetros para o Effects.post)
  function postParams(cam, time) {
    const a = alpha();
    if (a <= 0) return null;
    const x = cur.x - cam.x, y = cur.y - 20 - cam.y;
    return {
      light: { x, y, r: 52, c: [1, 1, 1], i: -0.42 * a },
      swirl: { x, y, r: 34, amp: 3 * a, t: time },
    };
  }

  return {
    trySpawn,
    update,
    drawBody,
    drawEye,
    postParams,
    clear() { cur = null; },
    get active() { return !!cur; },
  };
})();
