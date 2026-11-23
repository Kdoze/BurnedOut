// A casa: mapa em tiles (baseado na planta), móveis, colisão, luzes e câmera por cômodo.
window.World = (function () {
  const C = window.CONFIG;
  const T = C.TILE;

  // '#' parede   ' ' fora da casa   '.' piso frio   ',' piso de madeira   'D' porta
  const MAP = [
    '            #########          ',
    '            #.......#########  ',
    '#############.......#.......#  ',
    '#...........#.......#.......#  ',
    '#...........#.......#.......#  ',
    '#...........#.......#.......#  ',
    '########DD###.......#.......#  ',
    '#...#...............#.......#  ',
    '#...#...............#.......#  ',
    '#...#...............#.......#  ',
    '#...#...............#.......#  ',
    '#...#...............D.......#  ',
    '#...........###D##D############',
    '#...........#....#........#...#',
    '#...........#....#........D...#',
    '#...........#....#........#...#',
    '#...........#....#........#...#',
    '#...........#....#........#...#',
    '###.........#....#........#...#',
    '  #.........#....#........#...#',
    '  #############################',
  ];
  const COLS = MAP[0].length;
  const ROWS = MAP.length;
  const PAD = 7; // margem (em tiles) dos canvases pré-renderizados
  const OX = PAD * T;
  const OY = PAD * T;

  const ROOM_SEEDS = {
    sala: [5, 10],
    varanda: [5, 4],
    meu_quarto: [24, 6],
    banheiro: [14, 15],
    quarto_mae: [20, 13],
    banheiro_mae: [28, 15],
  };

  // Janelas (tiles de parede)
  const WINDOWS = [
    [15, 0], [16, 0], [17, 0],
    [23, 1], [24, 1], // atrás da cômoda do meu quarto
    [4, 20], [5, 20],
    [14, 20],
    [21, 20], [22, 20], // atrás do guarda-roupa, atrás da cama da minha mãe
  ];
  const winSet = new Set(WINDOWS.map(([x, y]) => x + ',' + y));

  function tileAt(x, y) {
    if (y < 0 || y >= ROWS || x < 0 || x >= COLS) return ' ';
    return MAP[y][x];
  }
  const isFloor = (c) => c === '.' || c === ',';
  const isSolidTile = (c) => c === '#' || c === ' ';

  // ---------- cômodos (flood fill) ----------
  const roomGrid = [];
  for (let y = 0; y < ROWS; y++) roomGrid.push(new Array(COLS).fill(null));
  const ROOMS = {};
  for (const id in ROOM_SEEDS) {
    const [sx, sy] = ROOM_SEEDS[id];
    const floors = [];
    const stack = [[sx, sy]];
    while (stack.length) {
      const [x, y] = stack.pop();
      if (!isFloor(tileAt(x, y)) || roomGrid[y][x]) continue;
      roomGrid[y][x] = id;
      floors.push([x, y]);
      stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
    }
    let x0 = 99, y0 = 99, x1 = -1, y1 = -1;
    for (const [x, y] of floors) {
      x0 = Math.min(x0, x); y0 = Math.min(y0, y);
      x1 = Math.max(x1, x); y1 = Math.max(y1, y);
    }
    // limites incluindo as paredes
    const vis = new Set();
    for (const [x, y] of floors) {
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const c = tileAt(x + dx, y + dy);
          if (c !== ' ') vis.add(x + dx + ',' + (y + dy));
        }
    }
    ROOMS[id] = {
      id,
      floors,
      visible: vis,
      bx: (x0 - 1) * T,
      by: (y0 - 1) * T,
      bw: (x1 - x0 + 3) * T,
      bh: (y1 - y0 + 3) * T,
      camOffsetY: 0,
    };
  }
  ROOMS.varanda.camOffsetY = -2.2 * T; // mostra mais da cidade lá fora

  function roomAt(px, py) {
    const tx = Math.floor(px / T);
    const ty = Math.floor(py / T);
    if (ty < 0 || ty >= ROWS || tx < 0 || tx >= COLS) return null;
    return roomGrid[ty][tx];
  }

  // ---------- móveis ----------
  // (x, y, w, h) em tiles. solid = bloqueia. desc = texto ao interagir.
  const F = [];
  function add(type, x, y, w, h, o) {
    F.push(Object.assign({ type, x, y, w, h, solid: true }, o || {}));
  }
  // Varanda
  add('railing', 1, 2, 11, 1, { solid: false, decor: true, desc: 'a cidade continua acordada lá fora.' });
  add('tanque', 1, 3, 1, 1.5, { desc: 'roupas esquecidas no varal.' });
  add('planter', 4.4, 5.15, 2.2, 0.85, { desc: 'as plantas precisam de água.' });
  add('balconyTable', 8.7, 3.15, 2.3, 1.75, { desc: 'duas cadeiras vazias.' });
  add('pot', 11.1, 3.1, 0.85, 0.85);
  // Cozinha / jantar (lado esquerdo)
  add('washer', 1, 7, 1, 1, { desc: 'a máquina de lavar, parada.' });
  add('counter', 1, 8, 1, 1);
  add('microwave', 1, 9, 1, 1, { desc: 'o relógio do micro-ondas pisca 00:00.' });
  add('stove', 1, 10, 1, 1, { desc: 'o fogão está frio.' });
  add('counter', 1, 11, 1, 1);
  add('board', 1, 12, 1, 1);
  add('sink', 1, 13, 1, 1, { desc: "um copo d'água pela metade." });
  add('counter', 1, 14, 1, 1);
  add('fridge', 1, 15, 1, 2, { desc: 'a geladeira zumbe baixinho. não estou com fome.' });
  add('counter', 1, 17, 1, 1);
  // mesa de 4 lugares, na horizontal, encostada na parede do banheiro
  add('chairDown', 9.85, 14.85, 0.8, 0.9);
  add('chairDown', 10.95, 14.85, 0.8, 0.9);
  add('dining4', 9.5, 15.75, 2.5, 1.5, { desc: 'quatro lugares. nenhum ocupado.' });
  add('chairUp', 9.85, 17.25, 0.8, 0.9);
  add('chairUp', 10.95, 17.25, 0.8, 0.9);
  add('lowShelf', 5.8, 19.25, 2, 0.75, { desc: 'porta-retratos de outros dias.' });
  // Sala de estar (onde era o quarto de cima, sem a parede): o sofá separa da cozinha/jantar,
  // e a TV fica na parede que faz fronteira com o meu quarto.
  add('rug', 14.5, 6.5, 4, 4, { solid: false, decor: true });
  add('sofa', 12, 7, 2, 3.25, { desc: 'ninguém sentado aqui hoje.' });
  add('coffee', 15.6, 7.6, 1.6, 1.8);
  add('tvrack', 19, 7, 1, 3, { desc: 'a tv está desligada. a casa inteira em silêncio.' });
  add('lamp', 13.1, 6.1, 0.8, 0.8, { desc: 'a única luz acesa da sala.' });
  add('shelfItems', 13, 1, 2.5, 0.85, { desc: 'livros que ninguém abre faz tempo.' });
  add('pot', 19.05, 1.1, 0.85, 0.85);
  add('window', 15, 0, 3, 1, { solid: false, decor: true, desc: 'lá fora, a noite está quieta.' });
  // Suíte
  // Meu quarto (o mais à direita): guarda-roupa à esquerda, cômoda com a janela atrás,
  // cama à direita, cadeira e mesa com computador embaixo, porta no canto inferior esquerdo.
  add('wardrobe', 21, 2, 1.5, 6.5, { front: 'right', color: '#6e4d38', desc: 'roupas amontoadas. faz dias que não arrumo nada.' });
  add('dresser', 23, 2, 1.75, 0.9, { action: 'phone', phone: true }); // o celular fica em cima (ver js/phone.js)
  add('window', 23, 1, 2, 1, { solid: false, decor: true, desc: 'lá fora, a noite está quieta.' });
  add('bed', 25, 2, 3, 7, { blanket: '#3c4560', messy: true, desc: 'a cama desarrumada. não consigo dormir.' });
  add('officeChair', 24.7, 9.35, 1.1, 0.85, { desc: 'a cadeira ainda quente.' });
  add('pcDesk', 23, 10.3, 5, 1.7, { desc: 'o computador ligado. a tela me encara de volta.' });
  // Banheiro
  add('showerFloor', 13, 17.6, 4, 2.4, { solid: false, decor: true, desc: 'o chuveiro pinga devagar.' });
  add('bathSink', 13, 13, 1, 1.6, { action: 'mirror', mirror: 'banheiro' }); // olhar no espelho (ver js/mirror.js)
  add('toilet', 13.05, 15.3, 0.95, 1.1);
  add('glass', 13, 17.45, 1.9, 0.2);
  // Quarto da minha mãe (o de baixo, ao lado do banheiro): os guarda-roupas cercam a cama,
  // a janela fica atrás do guarda-roupa de baixo (atrás da cabeceira), TV na parede de cima.
  add('tvWall', 20.5, 13, 2, 0.375, { solid: false, decor: true, desc: 'a tv do quarto da minha mãe. desligada.' });
  // (entre a cama e os guarda-roupas dos lados há um corredorzinho para chegar na cama)
  add('wardrobe', 18, 14.625, 1, 5.375, { front: 'right', color: '#ddd5c8', desc: 'o guarda-roupa da minha mãe.' });
  add('bed', 20, 15, 3, 3.5625, { flipY: true, made: true, blanket: '#9a6a7a', desc: 'a cama da minha mãe, arrumada. o quarto está vazio.' });
  add('wardrobe', 19, 18.5625, 5.25, 1.4375, { front: 'up', color: '#ddd5c8', desc: 'atrás desse guarda-roupa tem uma janela. mal dá pra ver a noite.' });
  add('wardrobe', 24.25, 16, 1.75, 4, { front: 'left', color: '#ddd5c8', desc: 'mais roupas dela. tudo dobrado.' });
  // Suíte da minha mãe
  add('showerFloor', 27, 18.1875, 3, 1.8125, { solid: false, decor: true, desc: 'não gosto de ficar no banheiro da minha mãe.' });
  add('sinkV', 29.25, 13.0625, 0.75, 2.75, { action: 'mirror', mirror: 'mae' });
  add('toilet', 29.125, 16.5625, 0.875, 1, { flipX: true, desc: 'tudo aqui é tão arrumado. tão dela.' });
  add('glass', 27.875, 18.0625, 2.125, 0.1875);

  // ---------- luzes (em pixels do mundo) ----------
  const MOON = [0.42, 0.52, 0.95];
  const WARM = [1.0, 0.72, 0.42];
  const LIGHTS = {
    sala: [
      { x: 13.5 * T, y: 6.5 * T, r: 80, c: WARM, i: 0.75, kind: 'lamp' },
      { x: 16.5 * T, y: 1.6 * T, r: 60, c: MOON, i: 0.4 },
      { x: 5 * T, y: 19.4 * T, r: 52, c: MOON, i: 0.4 },
      { x: 9 * T, y: 7.2 * T, r: 50, c: MOON, i: 0.32 },
      { x: 1.6 * T, y: 9.5 * T, r: 10, c: [0.4, 1.0, 0.6], i: 0.5, kind: 'tiny' },
    ],
    varanda: [
      { x: 3 * T, y: 3 * T, r: 58, c: [0.55, 0.5, 0.85], i: 0.45 },
      { x: 7 * T, y: 3 * T, r: 58, c: [0.55, 0.5, 0.85], i: 0.45 },
      { x: 11 * T, y: 3 * T, r: 58, c: [0.55, 0.5, 0.85], i: 0.45 },
    ],
    meu_quarto: [
      { x: 24 * T, y: 2.4 * T, r: 62, c: MOON, i: 0.42 },
      { x: 25.4 * T, y: 11.0 * T, r: 66, c: [0.5, 0.72, 1.0], i: 0.62, kind: 'screen' },
    ],
    banheiro: [{ x: 14.5 * T, y: 19.5 * T, r: 48, c: MOON, i: 0.4 }],
    quarto_mae: [{ x: 21.5 * T, y: 18.4 * T, r: 64, c: MOON, i: 0.34 }],
    banheiro_mae: [{ x: 28 * T, y: 14.6 * T, r: 44, c: [0.62, 0.66, 0.9], i: 0.26 }],
  };

  // ---------- colisão ----------
  function blocked(x0, y0, x1, y1) {
    const tx0 = Math.floor(x0 / T), tx1 = Math.floor((x1 - 0.001) / T);
    const ty0 = Math.floor(y0 / T), ty1 = Math.floor((y1 - 0.001) / T);
    for (let ty = ty0; ty <= ty1; ty++)
      for (let tx = tx0; tx <= tx1; tx++) if (isSolidTile(tileAt(tx, ty))) return true;
    for (const f of F) {
      if (!f.solid) continue;
      const fx = f.x * T, fy = f.y * T, fw = f.w * T, fh = f.h * T;
      if (x1 > fx && x0 < fx + fw && y1 > fy && y0 < fy + fh) return true;
    }
    return false;
  }

  function furnitureAt(px, py) {
    let best = null;
    for (const f of F) {
      if (!f.desc && !f.action) continue;
      const fx = f.x * T, fy = f.y * T, fw = f.w * T, fh = f.h * T;
      if (px >= fx && px < fx + fw && py >= fy && py < fy + fh) {
        if (!best || !f.decor) best = f;
      }
    }
    return best;
  }

  // ---------- câmera ----------
  function camera(roomId, px, py, W, H) {
    const r = ROOMS[roomId];
    let cx, cy;
    if (r.bw <= W) cx = r.bx + r.bw / 2 - W / 2;
    else cx = Math.max(r.bx, Math.min(r.bx + r.bw - W, px - W / 2));
    if (r.bh <= H) cy = r.by + r.bh / 2 - H / 2;
    else cy = Math.max(r.by, Math.min(r.by + r.bh - H, py - 8 - H / 2));
    cy += r.camOffsetY;
    return { x: Math.round(cx), y: Math.round(cy) };
  }

  // =====================================================================
  //  PRÉ-RENDERIZAÇÃO
  // =====================================================================
  function rnd(seed) {
    let s = seed >>> 0;
    return function () {
      s = (s * 1664525 + 1013904223) >>> 0;
      return s / 4294967296;
    };
  }
  function R(ctx, x, y, w, h, c) {
    ctx.fillStyle = c;
    ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
  }
  // clareia (k>0) ou escurece (k<0) uma cor #rrggbb
  function shade(hex, k) {
    const n = parseInt(hex.slice(1), 16);
    const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => Math.max(0, Math.min(255, Math.round(k > 0 ? v + (255 - v) * k : v * (1 + k)))));
    return '#' + ch.map((v) => v.toString(16).padStart(2, '0')).join('');
  }
  function disc(ctx, cx, cy, r, c) {
    ctx.fillStyle = c;
    for (let dy = -r; dy <= r; dy++) {
      const w = Math.floor(Math.sqrt(r * r - dy * dy + r * 0.8));
      ctx.fillRect(Math.round(cx - w), Math.round(cy + dy), w * 2 + 1, 1);
    }
  }

  function floorStyle(x, y) {
    const room = roomGrid[y] && roomGrid[y][x];
    const ch = tileAt(x, y);
    if (ch === ',') return 'wood';
    if (room === 'banheiro') return 'bath';
    if (room === 'banheiro_mae') return 'bath2';
    if (room === 'varanda') return 'balcony';
    return 'ceramic';
  }

  function drawFloorTile(ctx, x, y, style, rand) {
    const px = OX + x * T, py = OY + y * T;
    if (style === 'ceramic') {
      R(ctx, px, py, T, T, '#b6b2bb');
      R(ctx, px, py, T, 1, '#a19dab');
      R(ctx, px, py, 1, T, '#a19dab');
      R(ctx, px + 1, py + 1, T - 1, 1, '#c3bfc7');
      for (let i = 0; i < 3; i++) R(ctx, px + 2 + rand() * 12, py + 2 + rand() * 12, 1, 1, '#aaa6b1');
    } else if (style === 'bath2') {
      R(ctx, px, py, T, T, '#d3c9b8');
      for (let k = 0; k < T; k += 8) {
        R(ctx, px + k, py, 1, T, '#b9ab95');
        R(ctx, px, py + k, T, 1, '#b9ab95');
      }
    } else if (style === 'bath') {
      R(ctx, px, py, T, T, '#cfd2d8');
      for (let k = 0; k < T; k += 8) {
        R(ctx, px + k, py, 1, T, '#b1b5be');
        R(ctx, px, py + k, T, 1, '#b1b5be');
      }
    } else if (style === 'balcony') {
      R(ctx, px, py, T, T, '#a3948c');
      R(ctx, px, py, T, 1, '#8c7d76');
      R(ctx, px, py, 1, T, '#8c7d76');
      R(ctx, px + 8, py, 1, T, '#97887f');
      R(ctx, px, py + 8, T, 1, '#97887f');
    } else {
      // madeira: tábuas horizontais
      const cols = ['#9a6841', '#8f5f3a', '#a6734a', '#946440'];
      for (let k = 0; k < 4; k++) {
        const c = cols[(x * 3 + y * 4 + k * 7) % 4];
        R(ctx, px, py + k * 4, T, 4, c);
        R(ctx, px, py + k * 4 + 3, T, 1, '#6e4529');
        const seam = Math.floor(((x * 7 + (y * 4 + k) * 11) % 16));
        R(ctx, px + seam, py + k * 4, 1, 3, '#6e4529');
        if (rand() < 0.5) R(ctx, px + rand() * 14, py + k * 4 + 1, 2, 1, '#b07d52');
      }
    }
  }

  function drawWallTile(ctx, x, y) {
    const px = OX + x * T, py = OY + y * T;
    R(ctx, px, py, T, T, '#3a3241');
    // bordas internas
    const f = (dx, dy) => isFloor(tileAt(x + dx, y + dy)) || tileAt(x + dx, y + dy) === 'D';
    if (f(0, 1)) { R(ctx, px, py + T - 3, T, 3, '#5a4f63'); R(ctx, px, py + T - 1, T, 1, '#2a2430'); }
    if (f(0, -1)) R(ctx, px, py, T, 1, '#52485b');
    if (f(1, 0)) R(ctx, px + T - 1, py, 1, T, '#52485b');
    if (f(-1, 0)) R(ctx, px, py, 1, T, '#52485b');
    R(ctx, px + 3, py + 3, 1, 1, '#443b4c');
    R(ctx, px + 10, py + 9, 1, 1, '#443b4c');
    if (winSet.has(x + ',' + y)) {
      const horiz = isSolidTile(tileAt(x - 1, y)) || winSet.has(x - 1 + ',' + y) || winSet.has(x + 1 + ',' + y);
      if (horiz) {
        R(ctx, px, py + 5, T, 6, '#cfd0d8');
        R(ctx, px, py + 6, T, 4, '#5f7fae');
        R(ctx, px, py + 7, T, 1, '#87a5d0');
        R(ctx, px + 7, py + 5, 2, 6, '#cfd0d8');
      } else {
        R(ctx, px + 5, py, 6, T, '#cfd0d8');
        R(ctx, px + 6, py, 4, T, '#5f7fae');
      }
    }
  }

  function drawDoorTile(ctx, x, y) {
    const px = OX + x * T, py = OY + y * T;
    const horizWall = isSolidTile(tileAt(x - 1, y)) || tileAt(x - 1, y) === 'D';
    // soleira
    const below = floorStyle(x, y + 1);
    drawFloorTile(ctx, x, y, isFloor(tileAt(x, y + 1)) ? below : 'ceramic', rnd(x * 99 + y));
    if (y === 6 && (x === 8 || x === 9)) {
      // porta de vidro da varanda (de correr)
      R(ctx, px, py + 6, T, 4, '#9aa0aa');
      R(ctx, px, py + 7, T, 2, '#c9ced6');
      if (x === 8) { R(ctx, px, py + 2, 8, 12, '#6c88b4'); R(ctx, px, py + 2, 8, 1, '#d0d4dc'); R(ctx, px, py + 13, 8, 1, '#d0d4dc'); R(ctx, px + 1, py + 3, 1, 9, '#a9c2e6'); }
      return;
    }
    if (horizWall) {
      R(ctx, px, py + 5, T, 6, '#b9b0a3');
      R(ctx, px, py + 5, T, 1, '#d6cfc4');
      R(ctx, px, py + 10, T, 1, '#8e8579');
    } else {
      R(ctx, px + 5, py, 6, T, '#b9b0a3');
      R(ctx, px + 5, py, 1, T, '#d6cfc4');
      R(ctx, px + 10, py, 1, T, '#8e8579');
    }
  }

  function wallShadows(ctx, x, y) {
    const px = OX + x * T, py = OY + y * T;
    ctx.fillStyle = 'rgba(10,6,20,0.30)';
    if (tileAt(x, y - 1) === '#') ctx.fillRect(px, py, T, 3);
    ctx.fillStyle = 'rgba(10,6,20,0.16)';
    if (tileAt(x - 1, y) === '#') ctx.fillRect(px, py, 2, T);
    if (tileAt(x + 1, y) === '#') ctx.fillRect(px + T - 1, py, 1, T);
  }

  // ---- desenho dos móveis ----
  function drawFurniture(ctx, f) {
    if (f.flipX || f.flipY) {
      const x = OX + f.x * T, y = OY + f.y * T, w = f.w * T, h = f.h * T;
      ctx.save();
      ctx.translate(f.flipX ? Math.round(2 * x + w) : 0, f.flipY ? Math.round(2 * y + h) : 0);
      ctx.scale(f.flipX ? -1 : 1, f.flipY ? -1 : 1);
      drawFurnitureInner(ctx, f);
      ctx.restore();
      return;
    }
    drawFurnitureInner(ctx, f);
  }

  function drawFurnitureInner(ctx, f) {
    const x = OX + f.x * T, y = OY + f.y * T, w = f.w * T, h = f.h * T;
    const sh = 'rgba(8,4,16,0.35)';
    switch (f.type) {
      case 'railing': {
        // parapeito de vidro + corrimão
        R(ctx, x - T, y + 11, w + 2 * T, 5, '#4a4352');
        R(ctx, x - T, y + 11, w + 2 * T, 1, '#6a6274');
        ctx.fillStyle = 'rgba(150,175,215,0.25)';
        ctx.fillRect(x - T, y + 2, w + 2 * T, 9);
        R(ctx, x - T, y + 1, w + 2 * T, 2, '#9a98a6');
        for (let i = -T; i < w + T; i += 22) R(ctx, x + i, y + 1, 2, 11, '#7d7a88');
        break;
      }
      case 'tanque':
        R(ctx, x + 1, y + 1, w - 1, h - 1, sh);
        R(ctx, x, y, w - 1, h - 1, '#d9dade');
        R(ctx, x + 2, y + 3, w - 5, h - 7, '#9ea4ad');
        R(ctx, x + 3, y + 4, w - 7, h - 10, '#b9bec6');
        R(ctx, x + 1, y + 1, 3, 2, '#8a8f98');
        break;
      case 'planter': {
        R(ctx, x, y + 2, w, h - 2, '#5a4636');
        R(ctx, x, y + 2, w, 1, '#73594a');
        const r = rnd(7);
        for (let i = 0; i < 14; i++) {
          const lx = x + 2 + r() * (w - 6), ly = y - 3 + r() * 8;
          R(ctx, lx, ly, 3, 2, i % 3 ? '#3f6b3a' : '#5a8a4a');
          R(ctx, lx + 1, ly - 1, 1, 1, '#6fa45a');
        }
        R(ctx, x + w * 0.3, y - 1, 2, 2, '#d07a8a');
        R(ctx, x + w * 0.7, y, 2, 2, '#e0c060');
        break;
      }
      case 'balconyTable': {
        const cx = x + w * 0.55, cy = y + h / 2;
        disc(ctx, cx - 9, cy + 2, 5, sh);
        disc(ctx, cx - 10, cy, 5, '#a8825a'); // cadeira de vime
        disc(ctx, cx - 10, cy, 3, '#c49a6a');
        disc(ctx, cx + 11, cy - 4, 5, '#a8825a');
        disc(ctx, cx + 11, cy - 4, 3, '#c49a6a');
        disc(ctx, cx + 1, cy + 2, 7, sh);
        disc(ctx, cx, cy, 7, '#e3e0da');
        disc(ctx, cx, cy, 5, '#d2cec6');
        R(ctx, cx - 2, cy - 2, 3, 3, '#7a9ac8');
        break;
      }
      case 'pot':
        disc(ctx, x + w / 2 + 1, y + h / 2 + 2, 6, sh);
        disc(ctx, x + w / 2, y + h / 2, 6, '#8a5a3a');
        disc(ctx, x + w / 2, y + h / 2, 5, '#3f6b3a');
        R(ctx, x + w / 2 - 3, y + h / 2 - 3, 2, 2, '#5f9a4e');
        R(ctx, x + w / 2 + 1, y + h / 2, 2, 2, '#5f9a4e');
        break;
      case 'rug': {
        R(ctx, x, y, w, h, '#77737f');
        R(ctx, x + 2, y + 2, w - 4, h - 4, '#8b8794');
        for (let j = 0; j < h - 6; j += 4)
          for (let i = (j / 4) % 2 ? 2 : 0; i < w - 6; i += 4) R(ctx, x + 3 + i, y + 3 + j, 2, 2, '#9894a1');
        break;
      }
      case 'carpet':
        R(ctx, x, y, w, h, f.light ? '#b9b0a6' : '#8e8a93');
        R(ctx, x + 1, y + 1, w - 2, h - 2, f.light ? '#c8bfb4' : '#9a96a0');
        for (let j = 3; j < h - 2; j += 3) for (let i = 3 + (j % 2); i < w - 2; i += 4) R(ctx, x + i, y + j, 1, 1, f.light ? '#b3aaa0' : '#87838e');
        break;
      case 'rug2':
        R(ctx, x, y, w, h, '#8e8a93');
        R(ctx, x + 2, y + 2, w - 4, h - 4, '#a19da7');
        break;
      case 'counter':
      case 'board':
      case 'microwave':
      case 'sink':
      case 'stove':
        R(ctx, x, y, w, h, '#34333b');
        R(ctx, x + w - 3, y, 3, h, '#25242b');
        R(ctx, x + w - 3, y, 1, h, '#4a4955');
        R(ctx, x, y + h - 1, w, 1, '#25242b');
        R(ctx, x + 3, y + 4, 1, 1, '#4b4a56');
        R(ctx, x + 8, y + 10, 1, 1, '#4b4a56');
        if (f.type === 'board') {
          R(ctx, x + 2, y + 3, 9, 10, '#a87a4a');
          R(ctx, x + 3, y + 4, 7, 1, '#c09060');
          R(ctx, x + 4, y + 8, 6, 1, '#d0d0d8');
          R(ctx, x + 9, y + 7, 2, 3, '#2a2a2a');
        } else if (f.type === 'microwave') {
          R(ctx, x + 1, y + 2, 10, 12, '#1e1e24');
          R(ctx, x + 2, y + 3, 8, 10, '#2c2c34');
          R(ctx, x + 8, y + 5, 2, 1, '#4fe08a');
        } else if (f.type === 'sink') {
          R(ctx, x + 2, y + 2, 9, 12, '#9aa1aa');
          R(ctx, x + 3, y + 3, 7, 10, '#c3c9d0');
          R(ctx, x + 6, y + 7, 2, 2, '#7a818a');
          R(ctx, x + 1, y + 7, 3, 2, '#b8bec6');
          R(ctx, x + 5, y + 10, 3, 3, '#cfe0ef');
        } else if (f.type === 'stove') {
          R(ctx, x + 1, y + 1, 11, 14, '#141418');
          for (const [ox, oy] of [[3, 3], [8, 3], [3, 9], [8, 9]]) {
            R(ctx, x + ox - 1, y + oy - 1, 4, 4, '#3d3d45');
            R(ctx, x + ox, y + oy, 2, 2, '#141418');
          }
        }
        break;
      case 'washer':
        R(ctx, x, y, w - 1, h - 1, '#e2e2e8');
        R(ctx, x, y + h - 2, w - 1, 1, '#a9a9b4');
        R(ctx, x + w - 2, y, 1, h - 1, '#b8b8c2');
        disc(ctx, x + 7, y + 8, 4, '#b2b6c0');
        disc(ctx, x + 7, y + 8, 3, '#d6dae2');
        R(ctx, x + 2, y + 1, 6, 1, '#9a9aa6');
        break;
      case 'fridge':
        R(ctx, x + 1, y + 1, w, h, sh);
        R(ctx, x, y, w - 1, h - 1, '#e6e6ec');
        R(ctx, x + w - 3, y, 2, h - 1, '#c2c2cc');
        R(ctx, x, y + 11, w - 1, 1, '#b5b5c0');
        R(ctx, x + w - 5, y + 4, 1, 5, '#8f8f9c');
        R(ctx, x + w - 5, y + 14, 1, 8, '#8f8f9c');
        R(ctx, x + 3, y + 18, 3, 3, '#e0a040');
        break;
      case 'sofa':
        R(ctx, x + 1, y + 1, w, h, sh);
        R(ctx, x, y, w, h, '#bdb6aa'); // estrutura
        R(ctx, x, y, 7, h, '#aaa397'); // encosto (lado esquerdo)
        R(ctx, x + 1, y + 1, 5, h - 2, '#c7c0b4');
        R(ctx, x, y, w, 4, '#aaa397'); // braço
        R(ctx, x, y + h - 4, w, 4, '#aaa397');
        R(ctx, x + 7, y + 4, w - 8, h - 8, '#d9d3c8'); // assento
        R(ctx, x + 7, y + 4 + (h - 8) / 2, w - 8, 1, '#bdb6aa');
        R(ctx, x + 6, y + 6, 6, 8, '#6e4f3c'); // almofadas
        R(ctx, x + 7, y + 7, 4, 2, '#8a6650');
        R(ctx, x + 6, y + h - 15, 6, 8, '#6e4f3c');
        R(ctx, x + 7, y + h - 14, 4, 2, '#8a6650');
        break;
      case 'coffee': {
        const cx = x + 6, cy = y + 6;
        disc(ctx, cx + 1, cy + 2, 6, sh);
        disc(ctx, cx, cy, 6, '#e6e3dc');
        disc(ctx, cx, cy, 4, '#d6d2ca');
        disc(ctx, cx + 9, cy + 11, 5, sh);
        disc(ctx, cx + 8, cy + 10, 5, '#a87a50');
        disc(ctx, cx + 8, cy + 10, 3, '#bf8f62');
        disc(ctx, cx - 1, cy + 18, 4, '#e6e3dc');
        R(ctx, cx - 2, cy - 2, 3, 3, '#4f7a46');
        R(ctx, cx - 1, cy - 3, 1, 1, '#6fa45a');
        R(ctx, cx + 7, cy + 9, 3, 2, '#d8d0c0');
        break;
      }
      case 'tvrack':
        R(ctx, x + 1, y + 1, w, h, sh);
        R(ctx, x, y, w, h, '#5a4030');
        R(ctx, x, y, 1, h, '#74533e');
        R(ctx, x + 1, y + h / 2, w - 2, 1, '#3f2c20');
        // TV fininha vista de cima
        R(ctx, x + w - 6, y + 4, 4, h - 8, '#0c0c10');
        R(ctx, x + w - 6, y + 4, 1, h - 8, '#2c2c36');
        R(ctx, x + 3, y + h / 2 - 3, 3, 6, '#222228');
        break;
      case 'lamp':
        disc(ctx, x + 7, y + 8, 6, sh);
        disc(ctx, x + 6, y + 6, 6, '#e8d6a6');
        disc(ctx, x + 6, y + 6, 4, '#f6e8c0');
        R(ctx, x + 5, y + 5, 2, 2, '#fff6dc');
        break;
      case 'chairDown':
        R(ctx, x + 1, y + 1, w, h, sh);
        R(ctx, x, y, w, h, '#33528c');
        R(ctx, x, y, w, 4, '#24406e');
        R(ctx, x + 1, y + 5, w - 2, h - 6, '#4566a6');
        break;
      case 'chairUp':
        R(ctx, x + 1, y + 1, w, h, sh);
        R(ctx, x, y, w, h, '#33528c');
        R(ctx, x, y + h - 4, w, 4, '#24406e');
        R(ctx, x + 1, y + 1, w - 2, h - 6, '#4566a6');
        break;
      case 'dining4': {
        // mesa retangular na horizontal, 4 lugares
        R(ctx, x + 2, y + 2, w, h, sh);
        R(ctx, x, y, w, h, '#8d5e37');
        R(ctx, x, y, w, 1, '#a8774c');
        for (let i = 7; i < w; i += 8) R(ctx, x + i, y, 1, h, '#7a4f2d');
        R(ctx, x, y + h - 1, w, 1, '#6e4527');
        for (const [px, py] of [[7, 4], [w - 13, 4], [7, h - 5], [w - 13, h - 5]]) {
          disc(ctx, x + px, y + py, 3, '#e8e6e2');
          R(ctx, x + px - 1, y + py - 1, 2, 2, '#c8c6c2');
        }
        disc(ctx, x + w / 2 + 6, y + h / 2, 4, '#3f6b3a');
        for (const [ox, oy] of [[-2, -2], [2, -2], [0, 1], [3, 2], [-2, 2]]) R(ctx, x + w / 2 + 6 + ox, y + h / 2 + oy, 2, 2, '#eee8da');
        break;
      }
      case 'chairRight':
        R(ctx, x + 1, y + 1, w, h, sh);
        R(ctx, x, y, w, h, '#33528c');
        R(ctx, x, y, 4, h, '#24406e');
        R(ctx, x + 5, y + 1, w - 6, h - 2, '#4566a6');
        break;
      case 'dining': {
        R(ctx, x + 2, y + 2, w, h, sh);
        R(ctx, x, y, w, h, '#8d5e37');
        R(ctx, x, y, w, 1, '#a8774c');
        for (let j = 6; j < h; j += 7) R(ctx, x, y + j, w, 1, '#7a4f2d');
        R(ctx, x + w - 1, y, 1, h, '#6e4527');
        // pratos
        const plates = [[6, 5], [w - 7, 5], [5, 22], [w - 6, 22], [6, h - 6], [w - 7, h - 6], [5, 40], [w - 6, 40]];
        for (const [px, py] of plates) {
          disc(ctx, x + px, y + py, 3, '#e8e6e2');
          R(ctx, x + px - 1, y + py - 1, 2, 2, '#c8c6c2');
        }
        // vaso de flores
        disc(ctx, x + w / 2, y + h / 2, 5, '#3f6b3a');
        for (const [ox, oy] of [[-3, -2], [2, -3], [0, 1], [3, 2], [-2, 3]]) R(ctx, x + w / 2 + ox, y + h / 2 + oy, 2, 2, '#eee8da');
        break;
      }
      case 'benchV':
        R(ctx, x, y, w, h, '#b9b1a4');
        R(ctx, x + 2, y + 1, w - 3, h - 2, '#d3ccc0');
        for (let j = 20; j < h; j += 20) R(ctx, x + 2, y + j, w - 3, 1, '#b9b1a4');
        break;
      case 'benchH':
        R(ctx, x, y, w, h, '#b9b1a4');
        R(ctx, x + 1, y + 1, w - 2, h - 3, '#d3ccc0');
        R(ctx, x + w / 2, y + 1, 1, h - 3, '#b9b1a4');
        break;
      case 'lowShelf': {
        R(ctx, x, y, w, h, '#5c4232');
        R(ctx, x, y, w, 1, '#7a5a44');
        const cs = ['#a33', '#36a', '#ca5', '#5a5', '#eee', '#a6a'];
        for (let i = 0; i < 6; i++) R(ctx, x + 3 + i * 4, y + 2, 3, h - 4, cs[i]);
        break;
      }
      case 'bed': {
        R(ctx, x + 2, y + 2, w, h, sh);
        R(ctx, x, y, w, h, '#5a3a26');
        R(ctx, x, y, w, 4, '#6e4a32'); // cabeceira
        R(ctx, x + 2, y + 5, w - 4, h - 7, '#e2dcd2'); // lençol
        if (w >= 40) {
          const pw = Math.floor((w - 12) / 2);
          R(ctx, x + 4, y + 6, pw, 8, '#f2eee8'); // travesseiros
          R(ctx, x + 8 + pw, y + 7, pw, 8, '#eae5dd');
          R(ctx, x + 4, y + 13, pw, 1, '#cfc8bc');
          R(ctx, x + 8 + pw, y + 14, pw, 1, '#cfc8bc');
        } else {
          R(ctx, x + 4, y + 6, w - 8, 7, '#f2eee8'); // travesseiro
          R(ctx, x + 4, y + 12, w - 8, 1, '#cfc8bc');
          if (f.pillowAccent) R(ctx, x + 6, y + 7, 6, 4, f.pillowAccent);
        }
        R(ctx, x + 2, y + 20, w - 4, h - 22, f.blanket); // cobertor
        R(ctx, x + 2, y + 20, w - 4, 2, '#e2dcd2');
        if (f.messy) {
          // cobertor jogado, metade caída
          R(ctx, x + 2, y + 18, 14, 4, f.blanket);
          R(ctx, x + w - 14, y + 20, 12, 12, '#e2dcd2');
          for (let j = 28; j < h - 6; j += 9) R(ctx, x + 5 + ((j * 7) % 13), y + j, 14, 1, 'rgba(0,0,0,0.28)');
          for (let j = 33; j < h - 6; j += 11) R(ctx, x + 3 + ((j * 5) % 17), y + j, 10, 1, 'rgba(255,255,255,0.10)');
          R(ctx, x - 2, y + h - 30, 3, 22, f.blanket); // pontinha caindo da cama
        } else if (!f.made) {
          R(ctx, x + 6, y + 28, 10, 1, 'rgba(0,0,0,0.25)');
          R(ctx, x + 14, y + 36, 12, 1, 'rgba(0,0,0,0.25)');
          R(ctx, x + 4, y + 45, 9, 1, 'rgba(255,255,255,0.12)');
        }
        R(ctx, x + w - 6, y + 24, 4, h - 30, 'rgba(0,0,0,0.16)');
        break;
      }
      case 'bedH': {
        R(ctx, x + 2, y + 2, w, h, sh);
        R(ctx, x, y, w, h, '#5a3a26');
        R(ctx, x + w - 4, y, 4, h, '#6e4a32'); // cabeceira à direita
        R(ctx, x + 2, y + 2, w - 7, h - 4, '#e2dcd2');
        const ph = h > 40 ? (h - 10) / 2 : h - 8;
        for (let k = 0; k < (h > 40 ? 2 : 1); k++) {
          R(ctx, x + w - 14, y + 4 + k * (ph + 2), 9, ph, '#f2eee8');
          R(ctx, x + w - 12, y + 6 + k * (ph + 2), 5, ph - 4, f.pillowAccent);
        }
        R(ctx, x + 2, y + 2, w - 26, h - 4, f.blanket);
        R(ctx, x + w - 26, y + 2, 2, h - 4, '#e9e4dc');
        R(ctx, x + 2, y + 2, w - 26, 1, 'rgba(255,255,255,0.18)');
        if (f.tray) {
          R(ctx, x + 24, y + 14, 12, 10, '#b88a5a');
          disc(ctx, x + 28, y + 18, 2, '#f0f0f0');
          R(ctx, x + 32, y + 20, 2, 2, '#c04040');
        }
        break;
      }
      case 'desk': {
        R(ctx, x + 1, y + 1, w, h, sh);
        R(ctx, x, y, w, h, '#7a5333');
        R(ctx, x, y + h - 2, w, 2, '#5e3f26');
        if (f.lamp) {
          disc(ctx, x + w - 6, y + 5, 4, f.lampOff ? '#8a7f6a' : '#e8cf8a');
          disc(ctx, x + w - 6, y + 5, 2, f.lampOff ? '#a39880' : '#fff2c4');
        }
        if (f.notebook) {
          R(ctx, x + 3, y + 3, 10, 7, '#6f7480'); // notebook fechado
          R(ctx, x + 3, y + 3, 10, 1, '#8b909b');
        }
        if (f.laptop) {
          R(ctx, x + 8, y + 2, 14, 3, '#1c2836');
          R(ctx, x + 9, y + 2, 12, 2, '#7fb0e8');
          R(ctx, x + 8, y + 5, 14, 7, '#8b909b');
          R(ctx, x + 9, y + 6, 12, 4, '#6f7480');
        }
        break;
      }
      case 'dresser': {
        R(ctx, x + 1, y + 1, w, h, sh);
        R(ctx, x, y, w, h, '#6a4630');
        R(ctx, x, y, w, 1, '#8a6046');
        R(ctx, x, y + h - 2, w, 2, '#4e3222');
        R(ctx, x + 3, y + 3, 6, 5, '#d8d0c0'); // porta-retrato
        R(ctx, x + 4, y + 4, 4, 3, '#5a6a8a');
        R(ctx, x + 11, y + 3, 2, 4, '#9ad0c8'); // perfume
        if (f.phone) {
          R(ctx, x + 16, y + 3, 6, 9, '#0e0e12'); // celular
          R(ctx, x + 17, y + 4, 4, 7, '#1c2230');
          R(ctx, x + 17, y + 4, 4, 1, '#3a4660');
        } else disc(ctx, x + 22, y + 6, 2, '#a89a80');
        break;
      }
      case 'pcDesk': {
        R(ctx, x + 2, y + 2, w, h, sh);
        R(ctx, x, y, w, h, '#5c4130');
        R(ctx, x, y, w, 1, '#7a5840');
        R(ctx, x, y + h - 2, w, 2, '#3e2a1e');
        for (let i = 9; i < w; i += 17) R(ctx, x + i, y + 1, 1, h - 3, '#53392a');
        // monitor encostado na parede (tela virada para a cadeira)
        const mx = x + 26, my = y + h - 9;
        R(ctx, mx, my, 30, 5, '#141418');
        R(ctx, mx, my, 30, 1, '#9fd0ff');
        R(ctx, mx + 1, my + 1, 28, 1, '#4f7fb8');
        R(ctx, mx + 12, my + 5, 6, 2, '#26262c');
        // teclado e mouse
        R(ctx, mx + 2, y + 5, 24, 6, '#3a3a44');
        for (let i = 0; i < 11; i++) for (let j = 0; j < 2; j++) R(ctx, mx + 3 + i * 2, y + 6 + j * 2, 1, 1, '#6a6a78');
        R(ctx, mx + 29, y + 7, 3, 4, '#2c2c34');
        R(ctx, mx + 30, y + 7, 1, 1, '#d04060');
        // gabinete com led
        R(ctx, x + w - 12, y + 3, 10, h - 6, '#1c1c22');
        R(ctx, x + w - 12, y + 3, 10, 1, '#34343e');
        R(ctx, x + w - 4, y + 6, 1, 2, '#5ab0ff');
        // caneca
        disc(ctx, x + 18, y + 9, 2, '#d8d0c8');
        R(ctx, x + 18, y + 9, 1, 1, '#4a2e1e');
        break;
      }
      case 'officeChair':
        disc(ctx, x + 8, y + 9, 6, sh);
        disc(ctx, x + 7, y + 7, 6, '#2a2a32');
        disc(ctx, x + 7, y + 7, 4, '#3a3a46');
        R(ctx, x + 2, y + 1, 10, 3, '#22222a');
        break;
      case 'wardrobe': {
        // visto de cima: tampo com veio de madeira, portas, puxadores na frente e sombra no chão
        const front = f.front || (f.vertical ? 'right' : 'down');
        const base = f.color || '#d6cfc3';
        const lum = parseInt(base.slice(1, 3), 16) + parseInt(base.slice(3, 5), 16) + parseInt(base.slice(5, 7), 16);
        const isLight = lum > 450;
        const dark = shade(base, isLight ? -0.22 : -0.3), mid = shade(base, isLight ? -0.06 : -0.12), light = shade(base, 0.12);
        const handle = isLight ? '#8c8780' : '#c9c6c0';
        const vert = front === 'left' || front === 'right';
        // sombra no chão, do lado da frente
        ctx.fillStyle = 'rgba(8,4,16,0.32)';
        if (front === 'right') ctx.fillRect(x + w, y + 1, 2, h);
        if (front === 'left') ctx.fillRect(x - 2, y + 1, 2, h);
        if (front === 'down') ctx.fillRect(x + 1, y + h, w, 2);
        if (front === 'up') ctx.fillRect(x + 1, y - 2, w, 2);
        R(ctx, x, y, w, h, dark);
        R(ctx, x + 1, y + 1, w - 2, h - 2, base);
        // veio da madeira (ao longo do móvel)
        const L = vert ? h : w, Dp = vert ? w : h;
        for (let k = 0; k < 3; k++) {
          const off = 2 + Math.round(((k + 1) * (Dp - 4)) / 4);
          for (let i = 2; i < L - 2; i += 7 + k) {
            const len = 3 + ((i * 7 + k * 5) % 5);
            if (vert) R(ctx, x + off, y + i, 1, Math.min(len, L - 2 - i), mid);
            else R(ctx, x + i, y + off, Math.min(len, L - 2 - i), 1, mid);
          }
        }
        // borda da frente (as portas) mais clara
        if (front === 'right') R(ctx, x + w - 3, y + 1, 2, h - 2, light);
        if (front === 'left') R(ctx, x + 1, y + 1, 2, h - 2, light);
        if (front === 'down') R(ctx, x + 1, y + h - 3, w - 2, 2, light);
        if (front === 'up') R(ctx, x + 1, y + 1, w - 2, 2, light);
        // divisões das portas + puxadores
        const doors = Math.max(2, Math.round(L / 15));
        const step = L / doors;
        for (let d = 1; d < doors; d++) {
          const p = Math.round(d * step);
          if (vert) R(ctx, x + 1, y + p, w - 2, 1, dark);
          else R(ctx, x + p, y + 1, 1, h - 2, dark);
          if (d % 2 === 1) {
            // par de puxadores encontrando no meio das portas
            const hc = handle;
            if (front === 'right') { R(ctx, x + w - 4, y + p - 3, 1, 2, hc); R(ctx, x + w - 4, y + p + 2, 1, 2, hc); }
            if (front === 'left') { R(ctx, x + 3, y + p - 3, 1, 2, hc); R(ctx, x + 3, y + p + 2, 1, 2, hc); }
            if (front === 'down') { R(ctx, x + p - 3, y + h - 4, 2, 1, hc); R(ctx, x + p + 2, y + h - 4, 2, 1, hc); }
            if (front === 'up') { R(ctx, x + p - 3, y + 3, 2, 1, hc); R(ctx, x + p + 2, y + 3, 2, 1, hc); }
          }
        }
        // moldura do tampo
        R(ctx, x + 1, y + 1, w - 2, 1, light);
        break;
      }
      case 'shelfItems': {
        R(ctx, x, y, w, h, '#4e3a2c');
        R(ctx, x, y, w, 1, '#6a4f3c');
        const cs = ['#3a5a8a', '#8a3a3a', '#c9b060', '#6a6a72', '#2f6a4a', '#d8d0c0', '#7a4a8a'];
        const r = rnd(3);
        for (let i = 2; i < w - 4; i += 3 + Math.floor(r() * 2)) R(ctx, x + i, y + 2, 2 + Math.floor(r() * 2), h - 4, cs[Math.floor(r() * cs.length)]);
        R(ctx, x + w - 10, y + 3, 7, 6, '#e8e8e8'); // tênis
        R(ctx, x + w - 10, y + 8, 7, 1, '#7a7a82');
        break;
      }
      case 'window':
        break;
      case 'nightstand':
        R(ctx, x + 1, y + 1, w, h, sh);
        R(ctx, x, y, w - 1, h - 1, '#6e4a32');
        R(ctx, x, y, w - 1, 1, '#8a6046');
        disc(ctx, x + 7, y + 7, 4, '#d9cdb0');
        disc(ctx, x + 7, y + 7, 2, '#efe4c8');
        break;
      case 'showerFloor':
        R(ctx, x, y, w, h, '#b9bfc8');
        for (let k = 0; k < w; k += 6) R(ctx, x + k, y, 1, h, '#a3a9b3');
        for (let k = 0; k < h; k += 6) R(ctx, x, y + k, w, 1, '#a3a9b3');
        disc(ctx, x + w * 0.45, y + h * 0.5, 2, '#7d838e');
        R(ctx, x + 2, y + h - 14, 4, 12, '#d8dbe0'); // nicho
        R(ctx, x + 3, y + h - 12, 2, 3, '#e080a0');
        R(ctx, x + w - 4, y + 4, 2, 2, '#8d939e'); // chuveiro
        break;
      case 'glass':
        R(ctx, x, y, w, h + 1, '#c9dcef');
        R(ctx, x, y, w, 1, '#eef6ff');
        break;
      case 'bathSink':
        R(ctx, x + 1, y + 1, w, h, sh);
        R(ctx, x, y, w, h, '#d8d8de');
        R(ctx, x, y, 3, h, '#a7a9b2');
        disc(ctx, x + 9, y + h / 2, 4, '#9ea4ad');
        disc(ctx, x + 9, y + h / 2, 3, '#c6ccd4');
        R(ctx, x + 3, y + h / 2 - 1, 3, 2, '#8a8f98');
        break;
      case 'tvWall':
        R(ctx, x, y, w, h, '#0c0c10');
        R(ctx, x, y, w, 1, '#2e2e38');
        R(ctx, x + 2, y + h - 2, w - 4, 1, '#1a1a22');
        R(ctx, x + w / 2 - 3, y + h, 6, 1, 'rgba(0,0,0,0.4)');
        break;
      case 'sinkV': {
        R(ctx, x - 1, y + 1, w, h, sh);
        R(ctx, x, y, w, h, '#dedad2');
        R(ctx, x, y, 1, h, '#f2efe8');
        R(ctx, x + w - 3, y, 3, h, '#9fb0c4'); // espelho na parede
        R(ctx, x + w - 2, y + 2, 1, h - 6, '#cfe0f0');
        disc(ctx, x + 5, y + h / 2, 3, '#a8a49c');
        disc(ctx, x + 5, y + h / 2, 2, '#c8c6c0');
        R(ctx, x + 7, y + h / 2 - 1, 2, 2, '#8a8f98');
        R(ctx, x + 2, y + 4, 2, 4, '#c88aa0'); // perfume
        R(ctx, x + 2, y + h - 8, 3, 3, '#e8d8a8'); // creme
        break;
      }
      case 'toilet':
        R(ctx, x + 1, y + 1, w, h, sh);
        R(ctx, x, y + 1, 5, h - 2, '#dfe0e5'); // caixa
        R(ctx, x, y + 1, 5, 1, '#f2f3f6');
        disc(ctx, x + 10, y + h / 2, 5, '#e6e7ec');
        disc(ctx, x + 10, y + h / 2, 3, '#b8c0ca');
        break;
      default:
        break;
    }
  }

  // Cidade vista da varanda (lá embaixo). Coordenadas em pixels do mundo.
  const STREET_Y = 0.3 * T; // rua lá embaixo
  const CITY_X0 = -3 * T, CITY_X1 = 15 * T, CITY_Y0 = -6 * T;
  const buildings = [];
  const cityLights = [];
  (function () {
    const r = rnd(42);
    for (let i = 0; i < 34; i++) {
      const bw = Math.round(16 + r() * 34), bh = Math.round(12 + r() * 22);
      const bx = Math.round(CITY_X0 + r() * (CITY_X1 - CITY_X0)), by = Math.round(CITY_Y0 + r() * (STREET_Y - 14 - CITY_Y0));
      if (by + bh > STREET_Y - 10) continue;
      if (bx < 150 + CITY_X0 + 9 && bx + bw > 150 + CITY_X0) continue; // rua vertical
      const b = { x: bx, y: by, w: bw, h: bh, c: r() < 0.5 ? '#0e1019' : '#13151f' };
      buildings.push(b);
      const n = 2 + Math.floor(r() * 5);
      for (let k = 0; k < n; k++) {
        cityLights.push({
          x: bx + 2 + Math.floor(r() * (bw - 4)),
          y: by + 2 + Math.floor(r() * (bh - 4)),
          c: r() < 0.7 ? '#e8c47a' : r() < 0.6 ? '#9ab8ec' : '#f0f0e0',
          p: r() * 10,
          s: r() < 0.2 ? 0.3 + r() * 0.6 : 0,
        });
      }
    }
  })();

  function drawCity(ctx) {
    const x0 = OX + CITY_X0, x1 = OX + CITY_X1;
    const y0 = OY + CITY_Y0 - 2 * T, y1 = OY + 2 * T + 6;
    const sy = OY + STREET_Y;
    R(ctx, x0, y0, x1 - x0, y1 - y0, '#07080f');
    // ruas
    R(ctx, x0, sy - 6, x1 - x0, 13, '#10121b');
    R(ctx, x0, sy - 7, x1 - x0, 1, '#191b26');
    R(ctx, x0, sy + 7, x1 - x0, 1, '#191b26');
    R(ctx, x0 + 150, y0, 9, sy - y0, '#0f111a');
    for (let i = x0; i < x1; i += 10) R(ctx, i, sy, 4, 1, '#24262f');
    for (const b of buildings) {
      R(ctx, OX + b.x, OY + b.y, b.w, b.h, b.c);
      R(ctx, OX + b.x, OY + b.y, b.w, 1, '#1c1f2c');
      R(ctx, OX + b.x + b.w - 1, OY + b.y, 1, b.h, '#0a0b12');
    }
    // calçada e jardim do prédio, logo abaixo da varanda
    R(ctx, x0, sy + 8, x1 - x0, y1 - sy - 8, '#0b0c14');
    for (let i = x0 + 4; i < x1; i += 26) R(ctx, i, sy + 13, 7, 5, '#0e1a12');
  }

  let full = null;
  const roomCanvas = {};

  function prerender() {
    const W = (COLS + PAD * 2) * T;
    const H = (ROWS + PAD * 2) * T;
    full = document.createElement('canvas');
    full.width = W;
    full.height = H;
    const ctx = full.getContext('2d');
    const rand = rnd(1234);
    for (let y = 0; y < ROWS; y++)
      for (let x = 0; x < COLS; x++) {
        const c = tileAt(x, y);
        if (isFloor(c)) drawFloorTile(ctx, x, y, floorStyle(x, y), rand);
      }
    // móveis "de chão" primeiro (tapetes), depois o resto
    for (const f of F) if (f.decor) drawFurniture(ctx, f);
    for (let y = 0; y < ROWS; y++)
      for (let x = 0; x < COLS; x++) if (isFloor(tileAt(x, y))) wallShadows(ctx, x, y);
    for (const f of F) if (!f.decor) drawFurniture(ctx, f);
    for (let y = 0; y < ROWS; y++)
      for (let x = 0; x < COLS; x++) {
        const c = tileAt(x, y);
        if (c === '#') drawWallTile(ctx, x, y);
        else if (c === 'D') drawDoorTile(ctx, x, y);
      }

    for (const id in ROOMS) {
      const rc = document.createElement('canvas');
      rc.width = W;
      rc.height = H;
      const rx = rc.getContext('2d');
      if (id === 'varanda') drawCity(rx);
      for (const key of ROOMS[id].visible) {
        const [tx, ty] = key.split(',').map(Number);
        if (id === 'varanda' && ty === 2 && tx >= 1 && tx <= 11) continue; // parapeito
        rx.drawImage(full, OX + tx * T, OY + ty * T, T, T, OX + tx * T, OY + ty * T, T, T);
      }
      if (id === 'varanda') {
        drawFurniture(rx, F.find((f) => f.type === 'railing'));
      }
      roomCanvas[id] = rc;
    }
  }

  function draw(ctx, roomId, cam, time, W, H) {
    const rc = roomCanvas[roomId];
    ctx.drawImage(rc, OX + cam.x, OY + cam.y, W, H, 0, 0, W, H);
  }

  // Pontos de luz da cidade (desenhados DEPOIS da escuridão, para brilhar)
  // occluded(x, y) diz se o menino está na frente daquele pixel da tela
  function drawEmissive(ctx, roomId, cam, time, k, occluded) {
    if (k <= 0.02) return;
    const hidden = (x, y) => occluded && occluded(x, y);
    if (roomId === 'meu_quarto') {
      // luzinha de notificação piscando no celular em cima da cômoda
      const lx = Math.round(23 * T + 19 - cam.x), ly = Math.round(2 * T + 4 - cam.y);
      if (Math.floor(time * 1.25) % 2 === 0 && !hidden(lx, ly)) {
        const prev = ctx.globalAlpha;
        ctx.globalAlpha = prev * k;
        R(ctx, lx, ly, 1, 1, '#4cff8a');
        ctx.globalAlpha = prev;
      }
      return;
    }
    if (roomId !== 'varanda') return;
    const limit = 2 * T + 1 - cam.y; // só acima do parapeito
    const prev = ctx.globalAlpha;
    for (const L of cityLights) {
      if (L.s && Math.sin(time * L.s + L.p) < 0.2) continue;
      const sx = Math.round(L.x - cam.x), sy = Math.round(L.y - cam.y);
      if (sy >= limit || sy < 0 || hidden(sx, sy)) continue;
      ctx.globalAlpha = prev * k * 0.85;
      R(ctx, sx, sy, 1, 1, L.c);
    }
    // postes da rua
    const streetY = STREET_Y - 8 - cam.y;
    for (let x = -3 * T + 6; x < 15 * T; x += 34) {
      const sx = Math.round(x - cam.x);
      ctx.globalAlpha = prev * k * 0.25;
      R(ctx, sx - 2, streetY - 2, 5, 5, '#f0a04a');
      ctx.globalAlpha = prev * k;
      R(ctx, sx, streetY, 1, 1, '#ffd08a');
    }
    // carros passando lá embaixo
    for (let i = 0; i < 3; i++) {
      const span = 20 * T;
      const dir = i % 2 ? -1 : 1;
      const speed = 9 + i * 4;
      let x = ((time * speed + i * 97) % span + span) % span - 3 * T;
      if (dir < 0) x = 17 * T - x - 3 * T;
      const y = STREET_Y - 4 + (dir < 0 ? 5 : 0) - cam.y;
      const sx = Math.round(x - cam.x);
      ctx.globalAlpha = prev * k;
      R(ctx, sx, y, 1, 1, dir > 0 ? '#fff4d8' : '#e0303a');
      R(ctx, sx, y + 2, 1, 1, dir > 0 ? '#fff4d8' : '#e0303a');
      ctx.globalAlpha = prev * k * 0.6;
      R(ctx, sx - dir * 5, y, 1, 1, dir > 0 ? '#e0303a' : '#fff4d8');
      R(ctx, sx - dir * 5, y + 2, 1, 1, dir > 0 ? '#e0303a' : '#fff4d8');
    }
    ctx.globalAlpha = prev;
  }

  return {
    get _full() { return full; },
    T, COLS, ROWS, MAP, ROOMS, LIGHTS, F,
    tileAt, roomAt, blocked, furnitureAt, camera, prerender, draw, drawEmissive,
  };
})();
