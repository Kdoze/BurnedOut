// Núcleo do jogo: estados, intro, exploração, queda, desespero e fim seco.
(function () {
  const C = window.CONFIG;
  const W = C.W, H = C.H, T = C.TILE;

  // ---- parâmetros de teste pela URL (ex.: ?skip&t=145) ----
  const QS = new URLSearchParams(location.search);
  const DEBUG = {
    skip: QS.has('skip'),
    t: parseFloat(QS.get('t')) || 0,
    nomusic: QS.has('nomusic'),
    hud: QS.has('debug'),
    creature: QS.has('creature'), // força a criatura no espelho
  };

  const screen = document.getElementById('screen');
  const sctx = screen.getContext('2d');
  const crt = document.getElementById('crt');
  const controls = document.getElementById('controls');
  const buf = document.createElement('canvas');
  buf.width = W;
  buf.height = H;
  const ctx = buf.getContext('2d', { willReadFrequently: true });
  ctx.imageSmoothingEnabled = false;

  World.prerender();

  // =====================================================================
  //  LAYOUT (desktop / celular retrato / celular paisagem)
  // =====================================================================
  let touchUI = Input.isTouch;
  let scale = 1;
  function layout() {
    const vw = window.innerWidth, vh = window.innerHeight;
    const portrait = vh > vw;
    let availH = vh;
    if (touchUI && portrait) availH = Math.min(vh * 0.58, vh - 230);
    scale = Math.min(vw / W, availH / H);
    // escala inteira quando sobra espaço (pixels mais nítidos)
    if (scale >= 2) {
      const si = Math.floor(scale);
      if (scale - si < 0.35) scale = si;
    }
    const cw = Math.floor(W * scale), ch = Math.floor(H * scale);
    const left = Math.floor((vw - cw) / 2);
    const top = touchUI && portrait ? Math.max(0, Math.floor((availH - ch) / 2) + 8) : Math.floor((vh - ch) / 2);
    for (const el of [screen, crt]) {
      el.style.width = cw + 'px';
      el.style.height = ch + 'px';
      el.style.left = left + 'px';
      el.style.top = top + 'px';
    }
    crt.style.backgroundSize = `100% ${Math.max(2, scale)}px`;
    const dpr = Math.min(3, window.devicePixelRatio || 1);
    screen.width = Math.round(cw * dpr);
    screen.height = Math.round(ch * dpr);
    sctx.imageSmoothingEnabled = false;
    controls.classList.toggle('portrait', portrait);
    controls.classList.toggle('landscape', !portrait);
    controls.style.setProperty('--vh', vh + 'px');
    if (touchUI && portrait) {
      controls.style.setProperty('--ctrl-top', top + ch + 'px');
    }
  }
  window.addEventListener('resize', layout);
  window.addEventListener('orientationchange', () => setTimeout(layout, 200));
  layout();

  // =====================================================================
  //  ESTADO
  // =====================================================================
  // O jogo abre direto nas mensagens. ('start' só existe no modo de teste ?skip)
  let state = DEBUG.skip ? 'start' : 'intro'; // intro -> gap -> play -> end
  Sound.tryEarly();
  let stateT = 0;
  let paused = false;
  let clock = 0; // relógio de reserva (se a música falhar)

  const intro = { i: 0, chars: 0, acc: 0, done: false, out: 0, inT: 0 };

  const player = {
    x: C.START_POS.x * T,
    y: C.START_POS.y * T,
    dir: 'down',
    anim: 0,
    frame: 0,
    moving: false,
  };
  let room = C.START_ROOM;
  if (QS.get('pos')) {
    const [px, py] = QS.get('pos').split(',').map(Number);
    const r = World.roomAt(px * T, py * T);
    if (r) { player.x = px * T; player.y = py * T; room = r; }
  }
  let trans = null; // { phase:'out'|'in', t, next }
  let dialog = null;
  let shake = 0;
  let flash = 0;
  let pulse = 0;
  let nextBeat = 0;
  let fallDone = false;
  let trembleStarted = false;
  let despairStarted = false;
  let lastT = 0;
  let fsTried = false;

  function setState(s) {
    state = s;
    stateT = 0;
  }

  // Toque/tecla: destrava áudio e (no celular) tenta tela cheia
  Input.onGesture((e) => {
    Sound.unlock();
    if (e && e.type !== 'keydown') touchUI = touchUI || e.pointerType === 'touch' || e.type === 'touchend';
    if (!fsTried && (state === 'start' || state === 'intro') && touchUI && e.type !== 'keydown') {
      fsTried = true;
      const el = document.documentElement;
      const rfs = el.requestFullscreen || el.webkitRequestFullscreen;
      if (rfs && !document.fullscreenElement) {
        try {
          const p = rfs.call(el, { navigationUI: 'hide' });
          if (p && p.then) p.then(() => { try { screen.orientation.lock('landscape').catch(() => {}); } catch (_) { /* ignore */ } layout(); }).catch(() => {});
        } catch (_) { /* ignore */ }
      }
    }
    // volta da pausa (dentro do gesto, exigência do iOS)
    if (state === 'play' && paused) {
      paused = false;
      Sound.resumeAll();
      Input.clear();
      return;
    }
    // se o navegador bloqueou a música, tenta de novo dentro do gesto
    if (state === 'play' && !paused && Sound.musicStarted && Sound.music.paused && !Sound.music.ended) {
      const p = Sound.music.play();
      if (p && p.catch) p.catch(() => {});
    }
  });

  // fim seco assim que a música termina (mesmo se o loop estiver atrasado)
  Sound.music.addEventListener('ended', () => {
    if (state === 'play') endGame();
  });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden && state === 'play') {
      paused = true;
      Sound.pauseAll();
      Input.releaseAll();
    }
  });

  // =====================================================================
  //  TEMPO DA MÚSICA
  // =====================================================================
  function songTime() {
    if (DEBUG.nomusic || Sound.musicError) return clock;
    if (Sound.musicStarted) {
      const t = Sound.musicTime();
      if (t > 0) clock = t;
      return t;
    }
    return clock;
  }
  function songEnd() {
    return DEBUG.nomusic || Sound.musicError ? 342.05 : Sound.musicDuration();
  }

  // =====================================================================
  //  TEXTO (máquina de escrever)
  // =====================================================================
  function charDelay(ch) {
    if (ch === ',') return 0.2;
    if (ch === '.' || ch === '?' || ch === '!') return 0.34;
    return 0.045;
  }

  function typeStep(obj, text, dt, pitch) {
    const arr = [...text];
    obj.acc += dt;
    while (!obj.done && obj.acc >= 0) {
      const ch = arr[obj.chars];
      obj.chars++;
      obj.acc -= charDelay(ch);
      if (ch !== ' ' && obj.chars % 2 === 1) Sound.bip(pitch);
      if (obj.chars >= arr.length) obj.done = true;
    }
  }

  function drawArrow(x, y, color) {
    ctx.fillStyle = color;
    ctx.fillRect(x, y, 7, 1);
    ctx.fillRect(x + 1, y + 1, 5, 1);
    ctx.fillRect(x + 2, y + 2, 3, 1);
    ctx.fillRect(x + 3, y + 3, 1, 1);
  }

  // =====================================================================
  //  DIÁLOGO (interações durante a exploração)
  // =====================================================================
  function openDialog(text) {
    dialog = { text, chars: 0, acc: 0, done: false, t: 0 };
    Sound.confirm();
  }
  function drawDialog() {
    if (!dialog) return;
    const x = 8, h = 40, y = H - h - 6, w = W - 16;
    ctx.fillStyle = '#000';
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = '#e8e4f0';
    ctx.fillRect(x, y, w, 1); ctx.fillRect(x, y + h - 1, w, 1);
    ctx.fillRect(x, y, 1, h); ctx.fillRect(x + w - 1, y, 1, h);
    ctx.fillStyle = '#4a4554';
    ctx.fillRect(x + 2, y + 2, w - 4, 1); ctx.fillRect(x + 2, y + h - 3, w - 4, 1);
    ctx.fillRect(x + 2, y + 2, 1, h - 4); ctx.fillRect(x + w - 3, y + 2, 1, h - 4);
    const lines = Font.wrap(dialog.text, 35);
    let left = dialog.chars;
    lines.forEach((ln, i) => {
      const arr = [...ln];
      const n = Math.max(0, Math.min(arr.length, left));
      left -= arr.length + 1;
      Font.draw(ctx, arr.slice(0, n).join(''), x + 10, y + 8 + i * 11, '#e8e4f0');
    });
    if (dialog.done && Math.floor(dialog.t * 2.5) % 2 === 0) drawArrow(x + w - 14, y + h - 9, '#e8e4f0');
  }

  // =====================================================================
  //  JOGADOR
  // =====================================================================
  const FEET_W = 5, FEET_H = 6;
  function free(x, y) {
    return !World.blocked(x - FEET_W, y - FEET_H, x + FEET_W, y);
  }
  function move(dx, dy) {
    if (dx) {
      if (free(player.x + dx, player.y)) player.x += dx;
      else if (!dy) nudge('y', dx);
    }
    if (dy) {
      if (free(player.x, player.y + dy)) player.y += dy;
      else if (!dx) nudge('x', dy);
    }
  }
  // ajuda a passar por portas mesmo desalinhado
  function nudge(axis, d) {
    const step = Math.abs(d);
    for (let off = 1; off <= 11; off++) {
      for (const s of [1, -1]) {
        const o = off * s;
        const ok = axis === 'y' ? free(player.x + d, player.y + o) : free(player.x + o, player.y + d);
        if (ok) {
          const m = Math.min(step, off) * s;
          if (axis === 'y' && free(player.x, player.y + m)) player.y += m;
          if (axis === 'x' && free(player.x + m, player.y)) player.x += m;
          return;
        }
      }
    }
  }

  const DIRV = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };

  function tryInteract(t) {
    const [vx, vy] = DIRV[player.dir];
    for (const dist of [8, 14, 20, 26]) {
      const f = World.furnitureAt(player.x + vx * dist, player.y - 4 + vy * dist);
      if (f && f.action === 'mirror') {
        Mirror.open(t, DEBUG.creature);
        return;
      }
      if (f && f.desc) {
        openDialog(f.desc);
        return;
      }
    }
  }

  function updateExplore(dt, t) {
    if (trans) return;
    if (Mirror.active) {
      const r = Mirror.update(dt, Input.consumeAction());
      if (r === 'grabbed') {
        shake = 5;
        Input.releaseAll();
      }
      return;
    }
    const dz = Mirror.dazeK();
    if (dialog) {
      dialog.t += dt;
      if (!dialog.done) typeStep(dialog, dialog.text, dt, 440);
      if (Input.consumeAction()) {
        if (!dialog.done) { dialog.chars = [...dialog.text].length; dialog.done = true; }
        else dialog = null;
      }
      player.moving = false;
      player.frame = 0;
      return;
    }
    if (Input.consumeAction()) {
      if (dz < 0.4) tryInteract(t);
      if (dialog || Mirror.active) return;
    }
    const d = Input.dir();
    // atordoado: anda devagar e meio torto
    if (dz > 0 && (d.x || d.y)) {
      d.x += Math.sin(t * 1.9) * 0.45 * dz;
      d.y += Math.cos(t * 1.4) * 0.3 * dz;
    }
    // pouco antes da queda o corpo fica pesado
    const heavy = (t > 138 ? Math.max(0.62, 1 - (t - 138) / 12 * 0.38) : 1) * (1 - 0.45 * dz);
    const sp = C.PLAYER_SPEED * heavy;
    if (d.x || d.y) {
      if (Math.abs(d.x) > Math.abs(d.y) + 0.01) player.dir = d.x > 0 ? 'right' : 'left';
      else if (Math.abs(d.y) > Math.abs(d.x) + 0.01) player.dir = d.y > 0 ? 'down' : 'up';
      else if (!((d.x > 0 && player.dir === 'right') || (d.x < 0 && player.dir === 'left') || (d.y > 0 && player.dir === 'down') || (d.y < 0 && player.dir === 'up'))) player.dir = d.y > 0 ? 'down' : 'up';
      move(d.x * sp * dt, d.y * sp * dt);
      player.anim += dt * heavy;
      player.frame = [1, 0, 2, 0][Math.floor(player.anim * 7) % 4];
      player.moving = true;
    } else {
      player.anim = 0;
      player.frame = 0;
      player.moving = false;
    }
    // troca de cômodo -> corte
    const r = World.roomAt(player.x, player.y - 3);
    if (r && r !== room) {
      trans = { phase: 'out', t: 0, next: r };
    }
  }

  function updateTransition(dt) {
    if (!trans) return 0;
    trans.t += dt;
    const OUT = 0.22, IN = 0.26;
    if (trans.phase === 'out') {
      if (trans.t >= OUT) {
        room = trans.next;
        const [vx, vy] = DIRV[player.dir];
        for (let i = 0; i < 6; i++) if (free(player.x + vx, player.y + vy)) { player.x += vx; player.y += vy; }
        trans = { phase: 'in', t: 0 };
        return 1;
      }
      return trans.t / OUT;
    }
    if (trans.t >= IN) {
      trans = null;
      return 0;
    }
    return 1 - trans.t / IN;
  }

  // =====================================================================
  //  DESESPERO
  // =====================================================================
  function despair(t) {
    if (t < C.FALL_AT) return 0;
    const x = Math.min(1, (t - C.FALL_AT) / (C.DESPAIR_FULL_AT - C.FALL_AT));
    return Math.pow(x, 1.05);
  }

  function lightsFor(t, D, cam) {
    const out = [];
    const list = World.LIGHTS[room] || [];
    for (const L of list) {
      let i = L.i;
      if (L.kind === 'lamp') {
        const offAt = room === 'quarto' ? 0.34 : 0.46;
        if (D > offAt) i = 0;
        else if (D > offAt - 0.12) i *= Math.random() < 0.25 + (D - offAt + 0.12) * 4 ? 0.1 : 1;
        else if (t > C.TREMBLE_AT) i *= 0.92 + Math.random() * 0.08;
      } else if (L.kind === 'screen') {
        i *= D > 0.6 ? 0 : 0.85 + Math.random() * 0.15;
      } else if (L.kind !== 'tiny') {
        i *= 1 - D * 0.75;
      }
      out.push({ x: L.x - cam.x, y: L.y - cam.y, r: L.r, c: L.c, i });
    }
    // luz suave em volta do menino
    const pr = 48 - D * 16;
    out.push({ x: player.x - cam.x, y: player.y - 8 - cam.y, r: pr, c: [0.85, 0.8, 0.82], i: 0.36 + D * 0.1 });
    return out;
  }

  function updateStory(dt, t) {
    // 2:30 — o drop: trava e treme
    if (t >= C.TREMBLE_AT && !trembleStarted) {
      trembleStarted = true;
      dialog = null;
      Mirror.reset(); // nunca mistura o espelho com a crise
      if (trans) {
        if (trans.next) room = trans.next;
        trans = null;
      }
      player.moving = false;
      player.frame = 0;
      shake = 3;
      flash = 0.5;
      controls.classList.add('fade');
      Input.releaseAll();
    }
    // 2:33 — cai no chão
    if (t >= C.FALL_AT && !fallDone) {
      fallDone = true;
      shake = 6;
      Sound.thud();
      if (!despairStarted) {
        despairStarted = true;
        Sound.startDespair();
      }
      nextBeat = t + 0.9;
      Effects.reset();
    }
    if (fallDone) {
      const D = despair(t);
      Sound.setDespair(D);
      if (t >= nextBeat) {
        Sound.heartbeat(0.28 + D * 0.42);
        pulse = 0.12 + D * 0.18;
        nextBeat = t + (1.15 - D * 0.6);
      }
      const ps = screenPos();
      Effects.updateWords(dt, D, ps);
    }
  }

  function screenPos() {
    const cam = World.camera(room, player.x, player.y, W, H);
    return { x: player.x - cam.x, y: player.y - 8 - cam.y };
  }

  // =====================================================================
  //  UPDATE
  // =====================================================================
  function update(dt) {
    stateT += dt;
    Sound.update();

    if (state === 'start') {
      if (Input.consumeAction()) {
        Sound.confirm();
        if (DEBUG.skip) startGame();
        else setState('intro');
      }
      return;
    }

    if (state === 'intro') {
      const text = C.INTRO_TEXTS[intro.i];
      if (intro.out > 0) {
        intro.out += dt;
        if (intro.out > 0.45) {
          intro.i++;
          intro.chars = 0; intro.acc = -0.35; intro.done = false; intro.out = 0; intro.inT = 0;
          if (intro.i >= C.INTRO_TEXTS.length) setState('gap');
        }
        Input.clear();
        return;
      }
      intro.inT += dt;
      if (!intro.done) typeStep(intro, text, dt, 494);
      if (Input.consumeAction()) {
        if (!intro.done) {
          intro.chars = [...text].length;
          intro.done = true;
        } else {
          intro.out = 0.0001;
          Sound.bip(392);
        }
      }
      return;
    }

    if (state === 'gap') {
      Input.clear();
      if (stateT > 1.6) startGame();
      return;
    }

    if (state === 'play') {
      if (paused) {
        if (Input.consumeAction()) {
          paused = false;
          Sound.resumeAll();
        }
        return;
      }
      clock += dt;
      const t = songTime();
      lastT = t;
      if (t >= songEnd() - 0.03 || Sound.music.ended) {
        endGame();
        return;
      }
      if (t < C.TREMBLE_AT) {
        updateExplore(dt, t);
        Mirror.tickDaze(dt);
      } else Input.clear();
      updateStory(dt, t);
      shake = Math.max(0, shake - dt * 9);
      flash = Math.max(0, flash - dt * 1.2);
      pulse = Math.max(0, pulse - dt * 0.5);
    }
  }

  function startGame() {
    setState('play');
    clock = DEBUG.t || 0;
    if (!DEBUG.nomusic) Sound.startMusic(DEBUG.t || 0);
    if (touchUI) {
      controls.classList.remove('hidden');
      layout();
    }
    if (DEBUG.t >= C.TREMBLE_AT) controls.classList.add('fade');
  }

  function endGame() {
    setState('end');
    Sound.hardStop();
    controls.classList.add('hidden');
    document.body.classList.add('ended');
  }

  // =====================================================================
  //  RENDER
  // =====================================================================
  function drawPlayer(cam, t, D) {
    let img, ox, oy;
    let jx = 0, jy = 0;
    if (t >= C.FALL_AT) {
      img = player.dir === 'right' ? Sprites.lyingR : Sprites.lyingL;
      ox = player.x - 12;
      oy = player.y - 15;
      // respiração e soluços
      if (Math.sin(t * 3.6) > 0.55) jy = -1;
      if (Math.random() < 0.03 + D * 0.12) jx = Math.random() < 0.5 ? -1 : 1;
    } else if (t >= C.FALL_AT - 0.55 && t >= C.TREMBLE_AT) {
      img = Sprites.kneel;
      ox = player.x - 8;
      oy = player.y - 23;
      jx = Math.random() < 0.5 ? -1 : 1;
    } else {
      const set = Sprites[player.dir];
      img = set[player.frame] || set[0];
      ox = player.x - 8;
      oy = player.y - 23;
      if (t >= C.TREMBLE_AT) {
        jx = Math.random() < 0.6 ? (Math.random() < 0.5 ? -1 : 1) : 0;
        jy = Math.random() < 0.1 ? 1 : 0;
      }
    }
    const sx = Math.round(ox - cam.x + jx), sy = Math.round(oy - cam.y + jy);
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    if (t >= C.FALL_AT) ctx.fillRect(sx + 1, sy + 14, 22, 2);
    else ctx.fillRect(sx + 3, sy + 22, 10, 2);
    ctx.drawImage(img, sx, sy);
  }

  function renderPlay() {
    const t = lastT;
    const D = despair(t);
    if (Mirror.active) {
      Mirror.render(ctx, t, touchUI);
      drawOverlays(t, D);
      return;
    }
    const dz = Mirror.dazeK();
    const fadeTrans = updateTransitionValue;
    let cam = World.camera(room, player.x, player.y, W, H);
    // tremor de tela
    const sh = shake + (D > 0.35 ? (D - 0.35) * 2.2 : 0) + dz * 1.2;
    if (sh > 0.05) {
      cam = { x: cam.x + Math.round((Math.random() * 2 - 1) * sh), y: cam.y + Math.round((Math.random() * 2 - 1) * sh) };
    }
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, W, H);
    World.draw(ctx, room, cam, t, W, H);
    drawPlayer(cam, t, D);

    // luz
    const amb = 1 - 0.9 * Math.pow(D, 1.25);
    const pre = t > 140 && t < C.FALL_AT ? Math.min(1, (t - 140) / 10) : 0; // presságio
    const fl = flash;
    const ambient = [
      (0.30 + fl) * amb * (1 - pre * 0.15),
      (0.33 + fl) * amb * (1 - pre * 0.18),
      (0.50 + fl) * amb * (1 - pre * 0.1),
    ];
    // entrada do jogo: fade lento em dithering
    let fade = fadeTrans;
    if (stateT < 3.2) fade = Math.max(fade, 1 - stateT / 3.2);
    const target = screenPos();
    Effects.drawTentacles(D, t, target);
    Effects.post(ctx, {
      ambient,
      lights: lightsFor(t, D, cam),
      desat: Math.min(0.9, D * 1.1 + pre * 0.2 + dz * 0.6),
      vignette: 0.35 + D * 0.75 + pulse + pre * 0.2 + dz * (0.45 + Math.sin(t * 4) * 0.15),
      noise: D * 0.11 + (t > C.TREMBLE_AT && t < C.FALL_AT ? 0.04 : 0) + dz * 0.06,
      wave: dz * 4,
      waveT: t,
      fade,
      glitch: D > 0.45 ? (D - 0.45) * 0.5 : 0,
      vcx: W / 2 + (target.x - W / 2) * Math.min(1, D * 1.5),
      vcy: H / 2 + (target.y - H / 2) * Math.min(1, D * 1.5),
      tint: D > 0.5 ? [1 + (D - 0.5) * 0.25, 1 - (D - 0.5) * 0.3, 1 - (D - 0.5) * 0.2]
        : dz > 0 ? [1 + dz * 0.3, 1 - dz * 0.25, 1 - dz * 0.2] : null,
    });
    // visão dupla quando atordoado
    if (dz > 0.02) {
      const prevA = ctx.globalAlpha;
      ctx.globalAlpha = 0.38 * dz;
      ctx.drawImage(buf, Math.round(3 + Math.sin(t * 2.7) * 5 * dz), Math.round(Math.cos(t * 1.9) * 2 * dz));
      ctx.globalAlpha = prevA;
    }
    // luzes que "brilham" por cima da escuridão (cidade lá fora)
    World.drawEmissive(ctx, room, cam, t, (1 - fade) * Math.max(0, 1 - D * 1.6));
    if (t >= C.FALL_AT) Effects.drawWords(ctx, D, t, target);
    drawDialog();
    drawOverlays(t, D);
  }

  function drawOverlays(t, D) {
    if (paused) {
      ctx.fillStyle = 'rgba(0,0,0,0.75)';
      ctx.fillRect(0, 0, W, H);
      const s1 = 'pausado';
      Font.draw(ctx, s1, (W - Font.measure(s1)) / 2, H / 2 - 12, '#e8e4f0');
      const s2 = touchUI ? 'toque para continuar' : 'enter para continuar';
      Font.draw(ctx, s2, (W - Font.measure(s2)) / 2, H / 2 + 6, '#77727f');
    }
    if (DEBUG.hud) {
      const m = Math.floor(t / 60), s = (t % 60).toFixed(1);
      Font.draw(ctx, `${m}:${s.padStart(4, '0')} D${D.toFixed(2)} ${room}`, 2, 2, '#7fff7f', { shadow: '#000' });
    }
  }

  function renderStart() {
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, W, H);
    const p = '[teste] enter';
    Font.draw(ctx, p, (W - Font.measure(p)) / 2, H / 2 - 4, '#3e3a46');
  }

  function renderIntro() {
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, W, H);
    if (state === 'gap') return;
    const text = C.INTRO_TEXTS[intro.i];
    if (!text) return;
    const lines = Font.wrap(text, 34);
    const lh = 14;
    const y0 = Math.round((H - lines.length * lh) / 2);
    let left = intro.chars;
    let alpha = 1;
    if (intro.out > 0) alpha = Math.max(0, 1 - intro.out / 0.4);
    let lastX = 0, lastY = 0;
    lines.forEach((ln, i) => {
      const arr = [...ln];
      const n = Math.max(0, Math.min(arr.length, left));
      left -= arr.length + 1;
      const x = Math.round((W - arr.length * 8) / 2);
      Font.draw(ctx, arr.slice(0, n).join(''), x, y0 + i * lh, '#e8e4f0', { alpha });
      lastX = x + arr.length * 8;
      lastY = y0 + i * lh;
    });
    if (intro.done && intro.out === 0) {
      if (Math.floor(intro.inT * 2.2) % 2 === 0) drawArrow(Math.min(W - 12, lastX + 4), lastY + 3, '#e8e4f0');
      if (intro.i === 0) {
        const hint = touchUI ? 'toque para continuar' : 'enter para continuar';
        Font.draw(ctx, hint, (W - Font.measure(hint)) / 2, H - 16, '#3e3a46');
      }
    }
    // primeira mensagem: dica dos fones
    if (intro.i === 0 && intro.out === 0) {
      const s = 'use fones de ouvido.';
      Font.draw(ctx, s, (W - Font.measure(s)) / 2, 14, '#4a4654');
      if (touchUI && window.innerHeight > window.innerWidth) {
        const s2 = '(melhor com o celular deitado)';
        Font.draw(ctx, s2, (W - Font.measure(s2)) / 2, 26, '#36323e');
      }
    }
  }

  function blit() {
    sctx.imageSmoothingEnabled = false;
    sctx.drawImage(buf, 0, 0, screen.width, screen.height);
  }

  // =====================================================================
  //  LOOP
  // =====================================================================
  let last = performance.now();
  let updateTransitionValue = 0;
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (state === 'end') {
      // fim seco: só preto.
      sctx.fillStyle = '#000';
      sctx.fillRect(0, 0, screen.width, screen.height);
      return; // para o loop
    }
    update(dt);
    if (state === 'play' && !paused) updateTransitionValue = updateTransition(dt);
    if (state === 'start') renderStart();
    else if (state === 'intro' || state === 'gap') renderIntro();
    else if (state === 'play') renderPlay();
    if (state === 'end') {
      sctx.fillStyle = '#000';
      sctx.fillRect(0, 0, screen.width, screen.height);
      return;
    }
    blit();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  // ganchos para testes
  window.__game = {
    get state() { return state; },
    get room() { return room; },
    get t() { return lastT; },
    player,
    setClock(v) { clock = v; },
  };
})();
