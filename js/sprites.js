// Sprites do personagem em pixel art (16x24).
// Camisa listrada roxo/lilás, calça preta, cabelo cacheado e cheio.
window.Sprites = (function () {
  const PAL = {
    k: '#0b080f', // contorno
    h: '#17131c', // cabelo (quase preto)
    H: '#322c3b', // brilho dos cachos
    s: '#c48a60', // pele
    S: '#9b6442', // sombra da pele
    e: '#1a1222', // olho
    p: '#5b2b8e', // roxo
    P: '#3e1c66', // roxo escuro
    l: '#b892ea', // lilás
    b: '#17141c', // calça preta
    B: '#2f2a38', // brilho da calça
    o: '#3a3440', // tênis
    O: '#77717f', // sola
  };

  const DOWN = [
    '................',
    '....kk.kk.kk....',
    '..kkhhkhhkhhkk..',
    '.khHhhHhhHhhHhk.',
    'khhhHhhhhhhHhhhk',
    'khHhhhHhhHhhhHhk',
    'khhhHshhhhsHhhhk',
    'khhhsssssssshhhk',
    '.khhsesssseshhk.',
    'khhhsesssseshhhk',
    '.khhSssSSssShhk.',
    '..kkkSssssSkkk..',
    '...kkpSSSSpkk...',
    '..kppppppppppk..',
    '.kllllllllllllk.',
    '.kppkppppppkppk.',
    '.kllkllllllkllk.',
    '.kppkppppppkppk.',
    '.kSskllllllksSk.',
    '..kkkbbbbbbkkk..',
    '....kbbbbbbk....',
    '....kbBkkBbk....',
    '....kbbkkbbk....',
    '....kookkook....',
  ];
  const DOWN_W1 = DOWN.slice(0, 20).concat([
    '....kbbbbbbk....',
    '....kbBkkBbk....',
    '....kbbkkook....',
    '....kook.kk.....',
  ]);
  const DOWN_W2 = DOWN.slice(0, 20).concat([
    '....kbbbbbbk....',
    '....kbBkkBbk....',
    '....kookkbbk....',
    '.....kk.kook....',
  ]);

  const UP = [
    '................',
    '....kk.kk.kk....',
    '..kkhhkhhkhhkk..',
    '.khHhhHhhHhhHhk.',
    'khhhHhhhhhhHhhhk',
    'khHhhhHhhHhhhHhk',
    'khhhHhhHHhhHhhhk',
    'khHhhhhhhhhhhHhk',
    '.khhhHhhhhHhhhk.',
    'khhHhhhHHhhhHhhk',
    '.khhhHhhhhHhhhk.',
    '..kkkhhhhhhkkk..',
    '...kkpSSSSpkk...',
    '..kppppppppppk..',
    '.kllllllllllllk.',
    '.kppkppppppkppk.',
    '.kllkllllllkllk.',
    '.kppkppppppkppk.',
    '.kSskllllllksSk.',
    '..kkkbbbbbbkkk..',
    '....kbbbbbbk....',
    '....kbBkkBbk....',
    '....kbbkkbbk....',
    '....kookkook....',
  ];
  const UP_W1 = UP.slice(0, 20).concat(DOWN_W1.slice(20));
  const UP_W2 = UP.slice(0, 20).concat(DOWN_W2.slice(20));

  // Perfil (olhando para a esquerda). O rosto fica dentro do volume do cabelo;
  // só a ponta do nariz passa 1px do contorno.
  const LEFT = [
    '................',
    '.....kk.kk.kk...',
    '....khhkhhkhhk..',
    '...khHhhhHhhhHk.',
    '..khhhhhhhhHhhhk',
    '..khHhhhhhhhhhk.',
    '..khsHhhhhhhHhhk',
    '..ksssshhhhhhhk.',
    '..ksesshhhHhhhhk',
    '.kssesshhhhhhhk.',
    '..ksssShhhhhhk..',
    '...kSSShhhhhk...',
    '......kSSk......',
    '.....kpppppk....',
    '....kllllllPk...',
    '....kpppkppPk...',
    '....klllkllPk...',
    '....kpppkppPk...',
    '....klSskllPk...',
    '.....kbbbbbk....',
    '.....kbbbbbk....',
    '.....kbBbbbk....',
    '.....kbbbbbk....',
    '....koooooOk....',
  ];
  const LEFT_W1 = LEFT.slice(0, 19).concat([
    '.....kbbbbbk....',
    '....kbbkkbbk....',
    '...kbbk..kbbk...',
    '...kbk....kbk...',
    '..kook....kook..',
  ]);
  const LEFT_W2 = LEFT.slice(0, 19).concat([
    '.....kbbbbbk....',
    '.....kbbbbbk....',
    '.....kbbbbk.....',
    '.....kbbkook....',
    '....koook.......',
  ]);

  function build(rows, flip) {
    const h = rows.length;
    const w = rows[0].length;
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const x = c.getContext('2d');
    for (let y = 0; y < h; y++) {
      for (let i = 0; i < w; i++) {
        const ch = rows[y][flip ? w - 1 - i : i];
        if (ch !== '.' && PAL[ch]) {
          x.fillStyle = PAL[ch];
          x.fillRect(i, y, 1, 1);
        }
      }
    }
    return c;
  }

  // olhos fechados
  function closeEyes(rows) {
    return rows.map((r, y) => (y === 8 ? r.replace(/e/g, 's') : y === 9 ? r.replace(/e/g, 'k') : r));
  }

  // Ajoelhado: cabeça baixa, mãos no chão
  function kneelRows() {
    const head = closeEyes(DOWN.slice(1, 12));
    const rows = ['................', '................', '................', '................', '................', '................'];
    rows.push(...head.slice(0, 10)); // cabeça mais baixa
    rows.push('...kkpSSSSpkk...');
    rows.push('..kppppppppppk..');
    rows.push('.kllllllllllllk.');
    rows.push('.kppkppppppkppk.');
    rows.push('.kllkllllllkllk.');
    rows.push('kSskbbbbbbbbksSk');
    rows.push('kkkbbbbbbbbbbkkk');
    rows.push('.kbbBbbbbbbBbbk.');
    return rows.slice(0, 24);
  }

  // Caído: o sprite de frente rotacionado (cabeça para o lado), olhos fechados
  function lyingRows(headLeft) {
    const src = closeEyes(DOWN);
    const H = src.length; // 24
    const W = src[0].length; // 16
    const out = [];
    for (let y = 0; y < W; y++) {
      let row = '';
      for (let x = 0; x < H; x++) {
        // rotação 90° anti-horária -> cabeça à esquerda
        const sy = x;
        const sx = W - 1 - y;
        row += src[sy][sx];
      }
      out.push(row);
    }
    if (!headLeft) return out.map((r) => [...r].reverse().join('')).reverse();
    return out;
  }

  const S = {
    down: [build(DOWN), build(DOWN_W1), build(DOWN_W2)],
    up: [build(UP), build(UP_W1), build(UP_W2)],
    left: [build(LEFT), build(LEFT_W1), build(LEFT_W2)],
    right: [build(LEFT, true), build(LEFT_W1, true), build(LEFT_W2, true)],
    kneel: build(kneelRows()),
    lyingL: build(lyingRows(true)),
    lyingR: build(lyingRows(false)),
    // busto (reflexo no espelho): cabeça e ombros
    bust: build(DOWN.slice(0, 18), true),
    bustBlink: build(closeEyes(DOWN).slice(0, 18), true),
  };
  S.PAL = PAL;
  return S;
})();
