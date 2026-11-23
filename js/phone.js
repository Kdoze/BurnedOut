// O celular (em cima da cômoda do meu quarto): tela de bloqueio, apps e WhatsApp.
// Navegação: direcional move, ação seleciona, Esc/Backspace/X (ou o "‹" na tela) volta.
window.Phone = (function () {
  const C = window.CONFIG;
  const W = C.W, H = C.H;

  // corpo e tela
  const BX = 102, BY = 2, BW = 116, BH = 176;
  const SX = BX + 5, SY = BY + 9, SW = BW - 10, SH = BH - 17;

  const APPS = [
    { id: 'whatsapp', name: 'WhatsApp', color: '#1fa855' },
    { id: 'musica', name: 'Música', color: '#d8424f' },
    { id: 'fotos', name: 'Fotos', color: '#f2f0ec' },
    { id: 'notas', name: 'Notas', color: '#f0cc48' },
    { id: 'relogio', name: 'Relógio', color: '#2a2a33' },
    { id: 'ajustes', name: 'Ajustes', color: '#6f7480' },
  ];

  let open = false;
  let screen = 'lock';
  let sel = 0;
  let scroll = 0;
  let toast = null;
  let t = 0;
  const nav = { x: 0, y: 0, rep: 0 };
  const state = {
    liked: true,
    alarms: [{ h: '06:30', on: false }, { h: '07:00', on: true }, { h: '07:10', on: true }],
    settings: [
      { n: 'Wi-Fi', on: true },
      { n: 'Bluetooth', on: false },
      { n: 'Modo avião', on: false },
      { n: 'Não perturbe', on: false },
    ],
  };

  function R(ctx, x, y, w, h, c) {
    ctx.fillStyle = c;
    ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
  }
  function rrect(ctx, x, y, w, h, c) {
    R(ctx, x + 1, y, w - 2, h, c);
    R(ctx, x, y + 1, w, h - 2, c);
  }
  function disc(ctx, cx, cy, r, c) {
    ctx.fillStyle = c;
    for (let dy = -r; dy <= r; dy++) {
      const w = Math.floor(Math.sqrt(r * r - dy * dy + r * 0.6));
      ctx.fillRect(Math.round(cx - w), Math.round(cy + dy), w * 2 + 1, 1);
    }
  }
  const txt = (ctx, s, x, y, c) => Font.drawSmall(ctx, s, x, y, c);
  const tw = (s) => Font.measureSmall(s);

  function clock(songT) {
    const [h, m] = C.PHONE_START_TIME.split(':').map(Number);
    const tot = h * 60 + m + Math.floor((songT || 0) / 60);
    return String(Math.floor(tot / 60) % 24).padStart(2, '0') + ':' + String(tot % 60).padStart(2, '0');
  }

  function say(msg) {
    toast = { msg, t: 1.8 };
    Sound.bip(330);
  }

  function openPhone() {
    open = true;
    screen = 'lock';
    sel = 0;
    scroll = 0;
    toast = null;
    t = 0;
    nav.x = nav.y = 0;
    Sound.confirm();
  }
  function close() {
    open = false;
  }

  function go(s) {
    screen = s;
    sel = 0;
    scroll = 0;
    toast = null;
    Sound.bip(523);
  }

  // passo de navegação com repetição ao segurar
  function navStep(dt) {
    const d = Input.dir();
    let dx = Math.abs(d.x) > 0.5 ? Math.sign(d.x) : 0;
    let dy = Math.abs(d.y) > 0.5 ? Math.sign(d.y) : 0;
    if (dx && dy) { if (Math.abs(d.x) > Math.abs(d.y)) dy = 0; else dx = 0; }
    let out = null;
    if (dx !== nav.x || dy !== nav.y) {
      if (dx || dy) out = { x: dx, y: dy };
      nav.rep = 0.34;
    } else if (dx || dy) {
      nav.rep -= dt;
      if (nav.rep <= 0) { out = { x: dx, y: dy }; nav.rep = 0.11; }
    }
    nav.x = dx;
    nav.y = dy;
    return out;
  }

  // quantos itens selecionáveis cada tela tem
  function count() {
    switch (screen) {
      case 'home': return APPS.length + 1;
      case 'whatsapp': return C.PHONE_CHATS.length + 1;
      case 'musica': return 5;
      case 'fotos': return 10;
      case 'notas': return 1;
      case 'relogio': return state.alarms.length + 1;
      case 'ajustes': return state.settings.length + 1;
      default: return 1;
    }
  }

  function back() {
    if (screen === 'lock') { close(); return; }
    if (screen === 'home') { go('lock'); return; }
    go('home');
  }

  function activate() {
    if (screen === 'lock') { go('home'); return; }
    if (screen === 'home') {
      if (sel === APPS.length) { close(); Sound.bip(392); return; }
      go(APPS[sel].id);
      return;
    }
    if (sel === 0) { back(); return; }
    switch (screen) {
      case 'whatsapp':
        say(C.PHONE_CHAT_BLOCKED);
        break;
      case 'musica':
        if (sel === 4) { state.liked = !state.liked; Sound.bip(state.liked ? 660 : 440); }
        else say(C.PHONE_SONG.blocked); // não dá pra despausar nem trocar
        break;
      case 'fotos':
        say('não quero ver isso agora.');
        break;
      case 'relogio': {
        const a = state.alarms[sel - 1];
        a.on = !a.on;
        Sound.bip(a.on ? 660 : 440);
        break;
      }
      case 'ajustes': {
        const st = state.settings[sel - 1];
        st.on = !st.on;
        Sound.bip(st.on ? 660 : 440);
        if (st.on && st.n === 'Não perturbe') say('ninguém vai me achar agora.');
        if (st.on && st.n === 'Modo avião') say('sem sinal.');
        break;
      }
    }
  }

  // retorna false quando o celular foi guardado
  function update(dt, action, backPressed) {
    t += dt;
    if (toast) { toast.t -= dt; if (toast.t <= 0) toast = null; }
    if (t < 0.2) return true;
    if (backPressed) { back(); return open; }
    const n = count();
    const m = navStep(dt);
    if (m && screen !== 'lock') {
      let step = m.y;
      if (screen === 'home') {
        if (sel < APPS.length) {
          if (m.x) step = m.x;
          else if (m.y) step = m.y * 3;
        } else if (m.y < 0) step = -2;
        else step = 0;
      } else if (screen === 'musica' && sel >= 1) {
        step = m.x || m.y;
      } else if (screen === 'fotos' && sel >= 1) {
        step = m.x || m.y * 3;
        if (m.y < 0 && sel <= 3) step = -sel;
      }
      const ns = Math.max(0, Math.min(n - 1, sel + step));
      if (ns !== sel) { sel = ns; Sound.bip(600); }
    }
    if (action) activate();
    return open;
  }

  // ---------------- ícones ----------------
  function icon(ctx, id, x, y) {
    const app = APPS.find((a) => a.id === id);
    rrect(ctx, x, y, 18, 18, app.color);
    switch (id) {
      case 'whatsapp':
        disc(ctx, x + 9, y + 8, 6, '#ffffff');
        disc(ctx, x + 9, y + 8, 5, app.color);
        R(ctx, x + 3, y + 13, 3, 2, '#ffffff');
        R(ctx, x + 7, y + 6, 2, 2, '#ffffff');
        R(ctx, x + 8, y + 8, 2, 1, '#ffffff');
        R(ctx, x + 9, y + 9, 3, 2, '#ffffff');
        break;
      case 'musica':
        R(ctx, x + 7, y + 4, 2, 9, '#fff');
        R(ctx, x + 9, y + 4, 4, 2, '#fff');
        R(ctx, x + 11, y + 6, 2, 1, '#fff');
        disc(ctx, x + 6, y + 13, 2, '#fff');
        break;
      case 'fotos':
        disc(ctx, x + 6, y + 6, 2, '#f0a030');
        R(ctx, x + 2, y + 12, 14, 4, '#4caf50');
        R(ctx, x + 6, y + 10, 6, 2, '#4caf50');
        R(ctx, x + 8, y + 8, 2, 2, '#4caf50');
        break;
      case 'notas':
        R(ctx, x + 2, y + 2, 14, 3, '#e0b030');
        for (let i = 0; i < 4; i++) R(ctx, x + 4, y + 7 + i * 2, 10 - (i % 2) * 3, 1, '#8a7a40');
        break;
      case 'relogio':
        disc(ctx, x + 9, y + 9, 6, '#f4f4f4');
        R(ctx, x + 9, y + 5, 1, 5, '#222');
        R(ctx, x + 9, y + 9, 3, 1, '#d33');
        break;
      case 'ajustes':
        disc(ctx, x + 9, y + 9, 6, '#d0d3da');
        for (const [ox, oy] of [[0, -7], [0, 6], [-7, 0], [6, 0]]) R(ctx, x + 8 + ox, y + 8 + oy, 3, 3, '#d0d3da');
        disc(ctx, x + 9, y + 9, 2, app.color);
        break;
    }
  }

  function heart(ctx, x, y, c) {
    R(ctx, x, y, 2, 1, c); R(ctx, x + 3, y, 2, 1, c);
    R(ctx, x, y + 1, 5, 1, c);
    R(ctx, x + 1, y + 2, 3, 1, c);
    R(ctx, x + 2, y + 3, 1, 1, c);
  }
  function checks(ctx, x, y, c) {
    for (const ox of [0, 3]) {
      R(ctx, x + ox, y + 2, 1, 1, c);
      R(ctx, x + ox + 1, y + 3, 1, 1, c);
      R(ctx, x + ox + 2, y + 2, 1, 1, c);
      R(ctx, x + ox + 3, y + 1, 1, 1, c);
      R(ctx, x + ox + 4, y, 1, 1, c);
    }
  }
  function muted(ctx, x, y, c) {
    R(ctx, x + 1, y, 3, 1, c); R(ctx, x, y + 1, 5, 3, c); R(ctx, x + 2, y + 4, 1, 1, c);
    R(ctx, x - 1, y - 1, 1, 1, '#121414'); // risco
    for (let i = 0; i < 6; i++) R(ctx, x - 1 + i, y - 1 + i, 1, 1, '#121414');
    for (let i = 0; i < 6; i++) R(ctx, x + i, y - 1 + i, 1, 1, c);
  }

  // ---------------- telas ----------------
  function statusBar(ctx, songT, dark) {
    const c = dark ? '#e6e6e6' : '#ffffff';
    txt(ctx, clock(songT), SX + 4, SY + 2, c);
    // sinal + bateria
    for (let i = 0; i < 4; i++) R(ctx, SX + SW - 26 + i * 2, SY + 6 - i, 1, 1 + i, state.settings[2].on ? '#666' : c);
    R(ctx, SX + SW - 15, SY + 2, 10, 5, c);
    R(ctx, SX + SW - 14, SY + 3, 8, 3, '#000');
    R(ctx, SX + SW - 14, SY + 3, 2, 3, '#e05050'); // 18%
    R(ctx, SX + SW - 5, SY + 3, 1, 3, c);
  }

  function wallpaper(ctx) {
    for (let y = 0; y < SH; y++) {
      const k = y / SH;
      const r = Math.round(26 + 30 * (1 - k)), g = Math.round(14 + 8 * (1 - k)), b = Math.round(48 + 40 * (1 - k));
      R(ctx, SX, SY + y, SW, 1, `rgb(${r},${g},${b})`);
    }
    for (let i = 0; i < 22; i++) {
      const x = SX + ((i * 37) % SW), y = SY + 14 + ((i * 53) % (SH - 40));
      R(ctx, x, y, 1, 1, i % 3 ? '#8f86b8' : '#d8d0f0');
    }
  }

  function header(ctx, title, bg, fg) {
    R(ctx, SX, SY + 9, SW, 13, bg);
    const s = sel === 0;
    if (s) rrect(ctx, SX + 2, SY + 10, 10, 11, 'rgba(255,255,255,0.18)');
    txt(ctx, '<', SX + 5, SY + 12, fg);
    txt(ctx, title, SX + 15, SY + 12, fg);
  }

  function drawLock(ctx, songT) {
    wallpaper(ctx);
    statusBar(ctx, songT);
    const c = clock(songT);
    Font.draw(ctx, c, SX + (SW - Font.measure(c, 2)) / 2, SY + 24, '#f2eefa', { scale: 2 });
    const d = C.PHONE_LOCK_DATE;
    txt(ctx, d, SX + (SW - tw(d)) / 2, SY + 44, '#cfc8e6');
    // notificação
    rrect(ctx, SX + 5, SY + 62, SW - 10, 22, 'rgba(20,16,30,0.82)');
    rrect(ctx, SX + 8, SY + 65, 8, 8, '#1fa855');
    txt(ctx, 'WhatsApp', SX + 19, SY + 65, '#e8e8e8');
    txt(ctx, 'agora', SX + SW - 9 - tw('agora'), SY + 65, '#9a96a8');
    txt(ctx, Font.fitSmall(C.PHONE_NOTIFICATION, SW - 18), SX + 9, SY + 75, '#bdb8cc');
    if (Math.floor(t * 1.5) % 2 === 0) {
      const s = 'aperte para abrir';
      txt(ctx, s, SX + (SW - tw(s)) / 2, SY + SH - 16, '#cfc8e6');
    }
    R(ctx, SX + SW / 2 - 12, SY + SH - 5, 24, 1, '#ffffff');
  }

  function drawHome(ctx, songT) {
    wallpaper(ctx);
    statusBar(ctx, songT);
    const c = clock(songT);
    Font.draw(ctx, c, SX + (SW - Font.measure(c)) / 2, SY + 16, '#f2eefa');
    APPS.forEach((a, i) => {
      const col = i % 3, row = Math.floor(i / 3);
      const x = SX + 9 + col * 31, y = SY + 34 + row * 34;
      if (sel === i) rrect(ctx, x - 4, y - 3, 26, 33, 'rgba(255,255,255,0.22)');
      icon(ctx, a.id, x, y);
      const n = Font.fitSmall(a.name, 30);
      txt(ctx, n, x + 9 - tw(n) / 2, y + 21, '#ffffff');
    });
    // guardar o celular
    const gy = SY + SH - 24;
    rrect(ctx, SX + 20, gy, SW - 40, 13, sel === APPS.length ? '#e8e4f0' : 'rgba(0,0,0,0.45)');
    const g = 'guardar';
    txt(ctx, g, SX + (SW - tw(g)) / 2, gy + 3, sel === APPS.length ? '#1a1622' : '#e8e4f0');
    R(ctx, SX + SW / 2 - 12, SY + SH - 5, 24, 1, '#ffffff');
  }

  function avatar(ctx, chat, x, y) {
    disc(ctx, x + 5, y + 5, 5, chat.color);
    const ini = chat.initial || chat.name[0];
    txt(ctx, ini, x + 6 - tw(ini) / 2, y + 2, '#ffffff');
  }

  function drawWhatsApp(ctx, songT) {
    R(ctx, SX, SY, SW, SH, '#121414');
    statusBar(ctx, songT);
    // topo
    if (sel === 0) rrect(ctx, SX + 2, SY + 10, 10, 11, 'rgba(255,255,255,0.15)');
    txt(ctx, '<', SX + 5, SY + 12, '#e9edef');
    Font.draw(ctx, 'Conversas', SX + 14, SY + 11, '#e9edef');
    disc(ctx, SX + SW - 8, SY + 15, 4, '#21c063');
    R(ctx, SX + SW - 10, SY + 15, 5, 1, '#0b1d12'); R(ctx, SX + SW - 8, SY + 13, 1, 5, '#0b1d12');
    // busca
    rrect(ctx, SX + 3, SY + 24, SW - 6, 10, '#252a2c');
    disc(ctx, SX + 8, SY + 28, 2, '#8a9396'); disc(ctx, SX + 8, SY + 28, 1, '#252a2c');
    txt(ctx, 'Pesquisar', SX + 13, SY + 25, '#8a9396');
    // filtros
    let fx = SX + 3;
    [['Tudo', true], ['Não lidas ' + C.PHONE_UNREAD, false], ['+', false]].forEach(([n, on]) => {
      const w = tw(n) + 6;
      rrect(ctx, fx, SY + 37, w, 9, on ? '#103529' : '#1e2224');
      txt(ctx, n, fx + 3, SY + 38, on ? '#d6f5e3' : '#a9b0b3');
      fx += w + 3;
    });
    // lista
    const listY = SY + 49, rowH = 17, vis = Math.floor((SH - 52) / rowH);
    const idx = sel - 1;
    if (idx >= 0) {
      if (idx < scroll) scroll = idx;
      if (idx >= scroll + vis) scroll = idx - vis + 1;
    }
    ctx.save();
    ctx.beginPath();
    ctx.rect(SX, listY, SW, SH - (listY - SY));
    ctx.clip();
    C.PHONE_CHATS.forEach((ch, i) => {
      const r = i - scroll;
      if (r < 0 || r > vis) return;
      const y = listY + r * rowH;
      if (idx === i) R(ctx, SX, y - 1, SW, rowH, '#24292b');
      avatar(ctx, ch, SX + 3, y + 2);
      let nx = SX + 17;
      const time = ch.time || 'Ontem';
      const tc = ch.unread ? '#21c063' : '#8a9396';
      const nameMax = SW - 21 - tw(time) - 4 - (ch.heart ? 7 : 0);
      const nm = Font.fitSmall(ch.name, nameMax);
      nx = txt(ctx, nm, nx, y + 1, '#e9edef');
      if (ch.heart) heart(ctx, nx + 1, y + 2, ch.heart);
      txt(ctx, time, SX + SW - 3 - tw(time), y + 1, tc);
      let px = SX + 17;
      if (ch.sent) { checks(ctx, px, y + 10, ch.read ? '#53bdeb' : '#8a9396'); px += 9; }
      let pmax = SX + SW - 4 - px;
      if (ch.unread) pmax -= tw(String(ch.unread)) + 8;
      if (ch.muted) pmax -= 8;
      txt(ctx, Font.fitSmall(ch.preview, pmax), px, y + 9, '#8a9396');
      let bx = SX + SW - 3;
      if (ch.unread) {
        const s = String(ch.unread);
        const bw = Math.max(8, tw(s) + 5);
        bx -= bw;
        rrect(ctx, bx, y + 8, bw, 8, '#21c063');
        txt(ctx, s, bx + Math.round((bw - tw(s)) / 2), y + 8, '#06140c');
      }
      if (ch.muted) muted(ctx, bx - 8, y + 10, '#8a9396');
      R(ctx, SX + 17, y + rowH - 1, SW - 17, 1, '#1b2022');
    });
    ctx.restore();
  }

  function drawMusic(ctx, songT) {
    const song = C.PHONE_SONG;
    R(ctx, SX, SY, SW, SH, '#121214');
    statusBar(ctx, songT);
    header(ctx, 'Música', '#121214', '#e8e4f0');
    // capa em preto e branco (abstrata)
    const cx = SX + 18, cy = SY + 26, cs = SW - 36;
    for (let y = 0; y < cs; y++) {
      const v = Math.round(18 + (y / cs) * 70);
      R(ctx, cx, cy + y, cs, 1, `rgb(${v},${v},${v})`);
    }
    for (let i = 0; i < 40; i++) R(ctx, cx + ((i * 37) % cs), cy + ((i * 53) % cs), 1, 1, i % 2 ? '#bdbdbd' : '#6a6a6a');
    disc(ctx, cx + cs / 2, cy + cs / 2 + 6, 10, '#0a0a0a');
    R(ctx, cx + cs / 2 - 14, cy + cs - 10, 28, 10, '#0a0a0a');
    const ty = cy + cs + 5;
    txt(ctx, Font.fitSmall(song.title, SW - 16), SX + 8, ty, '#f0ecf8');
    txt(ctx, Font.fitSmall(song.artist, SW - 16), SX + 8, ty + 8, '#9a9aa6');
    // progresso parado (pausado)
    const k = Math.max(0, Math.min(1, song.pos / song.dur));
    R(ctx, SX + 8, ty + 20, SW - 16, 1, '#4a4a52');
    R(ctx, SX + 8, ty + 20, (SW - 16) * k, 1, '#e8e4f0');
    disc(ctx, SX + 8 + (SW - 16) * k, ty + 20, 1, '#ffffff');
    const fm = (s) => Math.floor(s / 60) + ':' + String(Math.floor(s % 60)).padStart(2, '0');
    txt(ctx, fm(song.pos), SX + 8, ty + 24, '#9a9aa6');
    txt(ctx, fm(song.dur), SX + SW - 8 - tw(fm(song.dur)), ty + 24, '#9a9aa6');
    // botões: anterior, play (pausado), próximo, curtir
    const by = ty + 36;
    const bxs = [SX + 18, SX + SW / 2 - 4, SX + SW - 26, SX + SW - 12];
    bxs.forEach((bx, i) => {
      if (sel === i + 1) rrect(ctx, bx - 3, by - 3, 14, 14, 'rgba(255,255,255,0.18)');
    });
    // ⏮
    R(ctx, bxs[0], by, 1, 7, '#e8e4f0');
    for (let i = 0; i < 4; i++) R(ctx, bxs[0] + 5 - i, by + i, 1 + i, 7 - i * 2, '#e8e4f0');
    // ▶ (está pausada)
    for (let i = 0; i < 5; i++) R(ctx, bxs[1] + i, by + i * 0.5, 1, 8 - i, '#ffffff');
    // ⏭
    for (let i = 0; i < 4; i++) R(ctx, bxs[2] + i, by + i, 1, 7 - i * 2, '#e8e4f0');
    R(ctx, bxs[2] + 5, by, 1, 7, '#e8e4f0');
    // curtir
    heart(ctx, bxs[3], by + 1, state.liked ? '#e84a6a' : '#6a627a');
    txt(ctx, 'pausado', SX + (SW - tw('pausado')) / 2, by + 14, '#5e5e68');
  }

  function drawPhotos(ctx, songT) {
    R(ctx, SX, SY, SW, SH, '#0e0e10');
    statusBar(ctx, songT);
    header(ctx, 'Fotos', '#0e0e10', '#e8e4f0');
    txt(ctx, 'Recentes', SX + 4, SY + 26, '#9a9aa6');
    const cols = ['#3a4a6a', '#5a3a4a', '#2f4f3f', '#6a5a3a', '#3a3a52', '#4a2f2f', '#2f3f5a', '#55506a', '#3d3d3d'];
    for (let i = 0; i < 9; i++) {
      const x = SX + 4 + (i % 3) * 33, y = SY + 36 + Math.floor(i / 3) * 33;
      R(ctx, x, y, 31, 31, cols[i]);
      R(ctx, x, y + 20, 31, 11, 'rgba(0,0,0,0.25)');
      disc(ctx, x + 8 + (i * 7) % 14, y + 8 + (i * 5) % 8, 3, 'rgba(255,255,255,0.18)');
      if (sel === i + 1) {
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1;
        ctx.strokeRect(x - 0.5, y - 0.5, 32, 32);
      }
    }
  }

  function drawNotes(ctx, songT) {
    R(ctx, SX, SY, SW, SH, '#f4efe0');
    R(ctx, SX, SY, SW, 9, '#2a2620');
    statusBar(ctx, songT);
    header(ctx, 'Notas', '#e6dfc8', '#3a3326');
    let y = SY + 27;
    for (const line of C.PHONE_NOTE) {
      for (const ln of wrapSmall(line, SW - 10)) {
        txt(ctx, ln, SX + 5, y, '#3a3326');
        y += 9;
      }
      y += 2;
    }
  }

  function wrapSmall(s, maxW) {
    const words = s.split(' ');
    const out = [];
    let cur = '';
    for (const w of words) {
      const test = cur ? cur + ' ' + w : w;
      if (tw(test) > maxW && cur) { out.push(cur); cur = w; } else cur = test;
    }
    if (cur) out.push(cur);
    return out;
  }

  function toggle(ctx, x, y, on) {
    rrect(ctx, x, y, 14, 7, on ? '#21c063' : '#4a4a55');
    disc(ctx, on ? x + 10 : x + 3, y + 3, 2, '#ffffff');
  }

  function drawClock(ctx, songT) {
    R(ctx, SX, SY, SW, SH, '#101014');
    statusBar(ctx, songT);
    header(ctx, 'Alarmes', '#101014', '#e8e4f0');
    state.alarms.forEach((a, i) => {
      const y = SY + 28 + i * 24;
      if (sel === i + 1) rrect(ctx, SX + 2, y - 3, SW - 4, 22, '#24242c');
      Font.draw(ctx, a.h, SX + 6, y, a.on ? '#f0f0f4' : '#5a5a66');
      txt(ctx, a.on ? 'seg a sex' : 'desativado', SX + 6, y + 10, '#8a8a96');
      toggle(ctx, SX + SW - 20, y + 3, a.on);
    });
  }

  function drawSettings(ctx, songT) {
    R(ctx, SX, SY, SW, SH, '#101014');
    statusBar(ctx, songT);
    header(ctx, 'Ajustes', '#101014', '#e8e4f0');
    state.settings.forEach((st, i) => {
      const y = SY + 28 + i * 18;
      if (sel === i + 1) rrect(ctx, SX + 2, y - 4, SW - 4, 16, '#24242c');
      txt(ctx, st.n, SX + 7, y, '#e8e4f0');
      toggle(ctx, SX + SW - 20, y - 1, st.on);
    });
    txt(ctx, 'bateria: 18%', SX + 7, SY + SH - 14, '#8a8a96');
  }

  function render(ctx, songT, touch) {
    // escurece o quarto atrás
    ctx.fillStyle = 'rgba(0,0,0,0.72)';
    ctx.fillRect(0, 0, W, H);
    // corpo do celular
    rrect(ctx, BX, BY, BW, BH, '#26262e');
    rrect(ctx, BX + 1, BY + 1, BW - 2, BH - 2, '#111116');
    R(ctx, BX + BW / 2 - 8, BY + 4, 16, 2, '#26262e'); // alto-falante
    R(ctx, BX - 1, BY + 30, 1, 14, '#26262e'); // botões laterais
    R(ctx, BX + BW, BY + 26, 1, 22, '#26262e');
    ctx.save();
    ctx.beginPath();
    ctx.rect(SX, SY, SW, SH);
    ctx.clip();
    switch (screen) {
      case 'lock': drawLock(ctx, songT); break;
      case 'home': drawHome(ctx, songT); break;
      case 'whatsapp': drawWhatsApp(ctx, songT); break;
      case 'musica': drawMusic(ctx, songT); break;
      case 'fotos': drawPhotos(ctx, songT); break;
      case 'notas': drawNotes(ctx, songT); break;
      case 'relogio': drawClock(ctx, songT); break;
      case 'ajustes': drawSettings(ctx, songT); break;
    }
    if (toast) {
      const lines = wrapSmall(toast.msg, SW - 16);
      const h = lines.length * 9 + 6;
      const y = SY + SH - 18 - h;
      ctx.globalAlpha = Math.min(1, toast.t * 3);
      rrect(ctx, SX + 5, y, SW - 10, h, '#2b2b33');
      lines.forEach((ln, i) => txt(ctx, ln, SX + (SW - tw(ln)) / 2, y + 3 + i * 9, '#f0eef4'));
      ctx.globalAlpha = 1;
    }
    ctx.restore();
    // dica fora do celular
    const hint = touch ? 'toque em < para voltar' : 'esc ou x: voltar';
    Font.drawSmall(ctx, hint, W - Font.measureSmall(hint) - 4, H - 10, '#4e4a58');
  }

  return {
    open: openPhone,
    close,
    update,
    render,
    get active() { return open; },
  };
})();
