// Easter egg: no computador do meu quarto, 5% de chance de abrir "CLUTCH",
// um minigame de tiro tático curtinho (mira + inimigos espiando atrás de caixas).
// Não pode encostar na crise: só abre se der tempo de terminar antes do drop,
// e se mesmo assim o drop chegar, ele é fechado na hora.
window.Minigame = (function () {
  const C = window.CONFIG;
  const W = C.W, H = C.H;

  const ROUND_TIME = 40;
  const KILLS_TO_WIN = 5;

  // pontos onde os inimigos aparecem: x,y = pés; dir = de onde sai; s = escala (perspectiva)
  const SPOTS = [
    { x: 104, y: 141, dir: 1, s: 1.0, cover: 'crateL' },
    { x: 160, y: 117, dir: 0, s: 0.72, cover: 'crateC' },
    { x: 268, y: 113, dir: -1, s: 0.85, cover: null },
    { x: 160, y: 100, dir: 0, s: 0.55, cover: null, fade: true },
    { x: 60, y: 74, dir: 0, s: 0.5, cover: 'sill' },
    { x: 226, y: 151, dir: -1, s: 1.05, cover: 'crateR' },
  ];

  let st = null;
  let bg = null;

  function R(ctx, x, y, w, h, c) {
    ctx.fillStyle = c;
    ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
  }

  // ---------------- cenário (desenhado uma vez) ----------------
  function buildBg() {
    const c = document.createElement('canvas');
    c.width = W;
    c.height = H;
    const x = c.getContext('2d');
    R(x, 0, 0, W, 42, '#2b3444'); // teto
    for (let i = 20; i < W; i += 60) { R(x, i, 6, 26, 3, '#dfe6f0'); R(x, i - 4, 9, 34, 1, 'rgba(220,230,240,0.25)'); }
    R(x, 0, 42, W, 60, '#b9a27c'); // parede do fundo
    for (let i = 0; i < W; i += 32) R(x, i, 42, 1, 60, '#a8916c');
    R(x, 0, 96, W, 6, '#8e7a5c'); // rodapé
    R(x, 138, 58, 44, 44, '#3a3026'); // porta do fundo
    R(x, 136, 56, 48, 2, '#6a5a44');
    R(x, 40, 50, 40, 22, '#1e2430'); // janela alta
    R(x, 38, 48, 44, 2, '#6a5a44');
    R(x, 248, 60, 40, 54, '#262019'); // porta da direita
    R(x, 246, 58, 2, 56, '#6a5a44');
    // chão com linhas de perspectiva
    R(x, 0, 102, W, 78, '#7d6d55');
    for (let i = -8; i <= 8; i++) {
      x.strokeStyle = 'rgba(60,50,38,0.35)';
      x.beginPath();
      x.moveTo(160 + i * 6, 102);
      x.lineTo(160 + i * 60, 180);
      x.stroke();
    }
    for (const yy of [110, 122, 138, 160]) R(x, 0, yy, W, 1, 'rgba(60,50,38,0.3)');
    // parede lateral esquerda
    x.fillStyle = '#a08a66';
    x.beginPath();
    x.moveTo(0, 30); x.lineTo(24, 42); x.lineTo(24, 102); x.lineTo(0, 120);
    x.closePath();
    x.fill();
    // marca de spray no chão (um alvo)
    x.strokeStyle = 'rgba(200,60,70,0.55)';
    x.lineWidth = 2;
    x.beginPath();
    x.ellipse(190, 150, 16, 6, 0, 0, Math.PI * 2);
    x.stroke();
    x.lineWidth = 1;
    return c;
  }

  function crate(ctx, x, y, w, h) {
    R(ctx, x, y, w, h, '#6a5638');
    R(ctx, x, y, w, 3, '#8a7250');
    R(ctx, x, y + h - 2, w, 2, '#4a3a26');
    R(ctx, x + 2, y + 4, w - 4, 1, '#5a4830');
    ctx.strokeStyle = '#54432c';
    ctx.beginPath();
    ctx.moveTo(x + 3, y + 5); ctx.lineTo(x + w - 3, y + h - 3);
    ctx.moveTo(x + w - 3, y + 5); ctx.lineTo(x + 3, y + h - 3);
    ctx.stroke();
  }
  const COVERS = {
    crateL: (ctx) => crate(ctx, 40, 104, 64, 40),
    crateC: (ctx) => crate(ctx, 134, 100, 52, 20),
    crateR: (ctx) => crate(ctx, 226, 116, 46, 38),
    sill: (ctx) => R(ctx, 38, 72, 44, 8, '#b9a27c'),
  };

  // inimigo genérico: capacete, colete escuro, contorno vermelho (de "inimigo")
  function enemy(ctx, e, sp) {
    const s = sp.s;
    const bw = Math.round(12 * s), bh = Math.round(24 * s), hr = Math.max(2, Math.round(3.2 * s));
    let x = sp.x, y = sp.y;
    const k = e.reveal;
    if (sp.dir) x = sp.x - sp.dir * (1 - k) * (bw + 4);
    else if (!sp.fade) y = sp.y + (1 - k) * (bh + hr * 2);
    if (e.dead) y += e.deadT * 30 * s;
    const alpha = sp.fade ? k : 1;
    const a2 = e.dead ? Math.max(0, 1 - e.deadT * 2.5) : 1;
    const prev = ctx.globalAlpha;
    ctx.globalAlpha = prev * alpha * a2;
    const bx = Math.round(x - bw / 2), by = Math.round(y - bh);
    R(ctx, bx - 1, by - hr * 2 - 1, bw + 2, bh + hr * 2 + 2, '#ff4a5a'); // contorno
    R(ctx, bx, by, bw, bh, '#2a2a34');
    R(ctx, bx, by, bw, Math.max(1, Math.round(3 * s)), '#3a3a48');
    R(ctx, bx + 1, by + Math.round(bh * 0.55), bw - 2, 1, '#1a1a22');
    const hx = Math.round(x), hy = Math.round(by - hr);
    R(ctx, hx - hr, hy - hr, hr * 2, hr * 2, '#3a3e48'); // capacete
    R(ctx, hx - hr + 1, hy, hr * 2 - 2, Math.max(1, Math.round(hr * 0.6)), '#9fd8ff'); // viseira
    R(ctx, bx + bw - 2, by + Math.round(bh * 0.3), Math.max(2, Math.round(6 * s)), Math.max(1, Math.round(2 * s)), '#15151a'); // arma
    if (e.flash > 0) R(ctx, bx + bw + Math.round(4 * s), by + Math.round(bh * 0.28), 3, 3, '#ffe08a');
    ctx.globalAlpha = prev;
    e.box = { x: bx, y: by, w: bw, h: bh, hx, hy, hr };
  }

  // ---------------- lógica ----------------
  function open() {
    if (!bg) bg = buildBg();
    st = {
      phase: 'title',
      t: 0,
      time: ROUND_TIME,
      hp: 100,
      ammo: 20,
      reserve: 60,
      reload: 0,
      cool: 0,
      kills: 0,
      cx: 160,
      cy: 96,
      recoil: 0,
      shotFx: 0,
      hitFx: 0,
      hurt: 0,
      feed: [],
      enemies: [],
      spawnT: 1.2,
      result: null,
      endT: 0,
    };
    Sound.confirm();
  }
  function close() {
    st = null;
  }

  function spawn() {
    const free = SPOTS.map((s, i) => i).filter((i) => !st.enemies.some((e) => e.spot === i));
    if (!free.length) return;
    const i = free[(Math.random() * free.length) | 0];
    const life = Math.max(0.75, 1.5 - st.kills * 0.12) + Math.random() * 0.4;
    st.enemies.push({ spot: i, t: 0, life, reveal: 0, hp: 100, dead: false, deadT: 0, flash: 0, shot: false });
  }

  function shoot() {
    if (st.reload > 0 || st.cool > 0) return;
    if (st.ammo <= 0) { startReload(); return; }
    st.ammo--;
    st.cool = 0.13;
    st.recoil = Math.min(10, st.recoil + 3.5);
    st.shotFx = 0.06;
    Sound.gunshot();
    const ax = st.cx, ay = st.cy - st.recoil * 0.6;
    for (const e of st.enemies) {
      if (e.dead || !e.box || e.reveal < 0.35) continue;
      const b = e.box;
      const head = Math.abs(ax - b.hx) <= b.hr + 0.5 && Math.abs(ay - b.hy) <= b.hr + 0.5;
      const body = ax >= b.x && ax <= b.x + b.w && ay >= b.y && ay <= b.y + b.h;
      if (head || body) {
        e.hp -= head ? 150 : 60;
        st.hitFx = 0.15;
        Sound.hitmark(head);
        if (e.hp <= 0) {
          e.dead = true;
          st.kills++;
          st.feed.unshift({ txt: head ? 'você  >  inimigo  (na cabeça)' : 'você  >  inimigo', t: 3 });
          if (st.feed.length > 3) st.feed.pop();
        }
        break;
      }
    }
    if (st.ammo === 0) startReload();
  }
  function startReload() {
    if (st.reserve <= 0 || st.reload > 0) return;
    st.reload = 1.2;
    Sound.reload();
  }

  // retorna 'won' | 'lost' | 'quit' quando termina
  function update(dt, action, back) {
    st.t += dt;
    if (back) { close(); return 'quit'; }
    if (st.phase === 'title') {
      if (action && st.t > 0.3) { st.phase = 'play'; st.t = 0; Sound.bip(660); }
      return null;
    }
    if (st.phase === 'end') {
      st.endT += dt;
      if (st.endT > 2.4) {
        const r = st.result;
        close();
        return r;
      }
      return null;
    }
    // mira
    const d = Input.dir();
    st.cx = Math.max(4, Math.min(W - 4, st.cx + d.x * 150 * dt));
    st.cy = Math.max(30, Math.min(H - 30, st.cy + d.y * 150 * dt));
    st.recoil = Math.max(0, st.recoil - dt * 22);
    st.cool = Math.max(0, st.cool - dt);
    st.shotFx = Math.max(0, st.shotFx - dt);
    st.hitFx = Math.max(0, st.hitFx - dt);
    st.hurt = Math.max(0, st.hurt - dt * 2);
    if (st.reload > 0) {
      st.reload -= dt;
      if (st.reload <= 0) {
        const n = Math.min(20 - st.ammo, st.reserve);
        st.ammo += n;
        st.reserve -= n;
      }
    }
    if (action) shoot();
    // inimigos
    st.spawnT -= dt;
    const alive = st.enemies.filter((e) => !e.dead).length;
    if (st.spawnT <= 0 && alive < 2) {
      spawn();
      st.spawnT = 0.7 + Math.random() * 0.9;
    }
    for (const e of st.enemies) {
      e.flash = Math.max(0, e.flash - dt);
      if (e.dead) { e.deadT += dt; continue; }
      e.t += dt;
      const inT = 0.16, outT = 0.16;
      if (e.t < inT) e.reveal = e.t / inT;
      else if (e.t < e.life) e.reveal = 1;
      else e.reveal = Math.max(0, 1 - (e.t - e.life) / outT);
      // atira antes de voltar para a cobertura
      if (!e.shot && e.t >= e.life * 0.85) {
        e.shot = true;
        e.flash = 0.08;
        Sound.enemyShot();
        if (Math.random() < 0.65) {
          st.hp -= 20 + Math.floor(Math.random() * 11);
          st.hurt = 1;
        }
      }
    }
    st.enemies = st.enemies.filter((e) => (e.dead ? e.deadT < 0.4 : e.t < e.life + 0.2));
    for (const f of st.feed) f.t -= dt;
    st.feed = st.feed.filter((f) => f.t > 0);
    st.time -= dt;
    if (st.kills >= KILLS_TO_WIN) finish('won');
    else if (st.hp <= 0) { st.hp = 0; finish('lost'); }
    else if (st.time <= 0) { st.time = 0; finish('lost'); }
    return null;
  }
  function finish(r) {
    st.phase = 'end';
    st.result = r;
    st.endT = 0;
    if (r === 'won') { Sound.bip(523); setTimeout(() => Sound.bip(784), 120); setTimeout(() => Sound.bip(1046), 240); }
    else { Sound.bip(220); setTimeout(() => Sound.bip(165), 160); }
  }

  // ---------------- desenho ----------------
  function render(ctx, songT, touch) {
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, W, H);
    if (st.phase === 'title') {
      R(ctx, 0, 0, W, H, '#0f1218');
      for (let i = 0; i < 9; i++) R(ctx, 0, 20 + i * 18, W, 1, 'rgba(255,74,90,0.08)');
      const t = 'CLUTCH';
      Font.draw(ctx, t, (W - Font.measure(t, 3)) / 2, 42, '#ff4a5a', { scale: 3, shadow: '#000' });
      const s1 = '5 inimigos. 40 segundos.';
      Font.draw(ctx, s1, (W - Font.measure(s1)) / 2, 84, '#e8e4f0');
      const s2 = 'mira: direcional   tiro: ' + (touch ? 'A' : 'enter');
      Font.drawSmall(ctx, s2, (W - Font.measureSmall(s2)) / 2, 104, '#9a96a8');
      if (Math.floor(st.t * 2) % 2 === 0) {
        const s3 = touch ? 'toque A para jogar' : 'enter para jogar';
        Font.draw(ctx, s3, (W - Font.measure(s3)) / 2, 128, '#e8e4f0');
      }
      const s4 = touch ? '' : 'esc: sair';
      if (s4) Font.drawSmall(ctx, s4, W - Font.measureSmall(s4) - 6, H - 12, '#5a5664');
      bezel(ctx);
      return;
    }
    const shake = st.shotFx > 0 ? 1 : 0;
    ctx.save();
    if (shake) ctx.translate(Math.round(Math.random() * 2 - 1), Math.round(Math.random() * 2 - 1));
    ctx.drawImage(bg, 0, 0);
    // inimigos e coberturas, na ordem certa
    const order = [4, 3, 1, 2, 0, 5];
    for (const i of order) {
      const sp = SPOTS[i];
      for (const e of st.enemies) if (e.spot === i) enemy(ctx, e, sp);
      if (sp.cover) COVERS[sp.cover](ctx);
    }
    if (!st.enemies.some((e) => e.spot === 1)) COVERS.crateC(ctx);
    ctx.restore();
    // arma (visão em primeira pessoa)
    const kick = st.recoil * 0.8, gx = 228 + Math.round(kick * 0.5), gy = 140 + Math.round(kick);
    R(ctx, gx, gy + 10, 70, 12, '#24252c');
    R(ctx, gx + 10, gy + 4, 44, 10, '#30323a');
    R(ctx, gx + 4, gy + 6, 10, 4, '#1a1b20');
    R(ctx, gx + 30, gy + 20, 10, 20, '#1d1e24');
    R(ctx, gx + 54, gy + 14, 30, 14, '#c99a6a'); // mão
    if (st.shotFx > 0) { R(ctx, gx - 6, gy + 2, 8, 6, '#ffe08a'); R(ctx, gx - 3, gy + 3, 4, 4, '#ffffff'); }
    // mira
    const ax = Math.round(st.cx), ay = Math.round(st.cy - st.recoil * 0.6);
    const cc = '#3cff6a';
    R(ctx, ax - 6, ay, 4, 1, cc); R(ctx, ax + 3, ay, 4, 1, cc);
    R(ctx, ax, ay - 6, 1, 4, cc); R(ctx, ax, ay + 3, 1, 4, cc);
    R(ctx, ax, ay, 1, 1, cc);
    if (st.hitFx > 0) {
      for (const [dx, dy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
        R(ctx, ax + dx * 4, ay + dy * 4, 1, 1, '#ffffff');
        R(ctx, ax + dx * 5, ay + dy * 5, 1, 1, '#ffffff');
      }
    }
    // dano
    if (st.hurt > 0) {
      ctx.fillStyle = `rgba(200,0,20,${0.35 * st.hurt})`;
      ctx.fillRect(0, 0, W, H);
    }
    // HUD
    const mm = Math.floor(st.time / 60), ss = String(Math.floor(st.time % 60)).padStart(2, '0');
    R(ctx, 128, 4, 64, 22, 'rgba(10,12,18,0.75)');
    Font.draw(ctx, `${mm}:${ss}`, 160 - Font.measure(`${mm}:${ss}`) / 2, 7, st.time < 10 ? '#ff4a5a' : '#e8e4f0');
    const ks = `${st.kills}/${KILLS_TO_WIN}`;
    Font.drawSmall(ctx, 'abates ' + ks, 160 - Font.measureSmall('abates ' + ks) / 2, 17, '#9a96a8');
    R(ctx, 6, H - 20, 70, 14, 'rgba(10,12,18,0.75)');
    Font.draw(ctx, String(st.hp), 10, H - 17, st.hp <= 30 ? '#ff4a5a' : '#e8e4f0');
    R(ctx, 36, H - 13, 36, 3, '#3a3a44');
    R(ctx, 36, H - 13, Math.round(36 * st.hp / 100), 3, st.hp <= 30 ? '#ff4a5a' : '#e8e4f0');
    const am = st.reload > 0 ? 'recarregando' : `${st.ammo} / ${st.reserve}`;
    Font.drawSmall(ctx, am, W - Font.measureSmall(am) - 8, H - 30, '#e8e4f0');
    st.feed.forEach((f, i) => {
      const w = Font.measureSmall(f.txt) + 6;
      R(ctx, W - w - 4, 30 + i * 10, w, 9, 'rgba(10,12,18,0.7)');
      Font.drawSmall(ctx, f.txt, W - w - 1, 30 + i * 10, '#e8e4f0');
    });
    if (st.phase === 'end') {
      const won = st.result === 'won';
      R(ctx, 0, 70, W, 34, won ? 'rgba(20,120,90,0.85)' : 'rgba(150,20,40,0.85)');
      const t = won ? 'VITÓRIA' : st.time <= 0 ? 'TEMPO ESGOTADO' : 'DERROTA';
      Font.draw(ctx, t, (W - Font.measure(t, 2)) / 2, 79, '#ffffff', { scale: 2, shadow: '#000' });
    }
    bezel(ctx);
  }

  // moldura do monitor + reflexo, para lembrar que é a tela do computador
  function bezel(ctx) {
    ctx.fillStyle = '#0b0b0e';
    ctx.fillRect(0, 0, W, 3); ctx.fillRect(0, H - 3, W, 3);
    ctx.fillRect(0, 0, 3, H); ctx.fillRect(W - 3, 0, 3, H);
    ctx.fillStyle = 'rgba(255,255,255,0.03)';
    ctx.fillRect(3, 3, W - 6, 40);
  }

  return {
    open,
    close,
    update,
    render,
    get active() { return !!st; },
  };
})();
