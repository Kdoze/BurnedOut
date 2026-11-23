// Áudio: bips (WebAudio), música (elemento <audio> roteado pelo WebAudio p/ fade e filtro)
// e a camada de "desespero" (drone, coração, sussurros, zumbido).
window.Sound = (function () {
  const C = window.CONFIG;
  let ctx = null;
  let master, sfx, musicGain, musicFilter, despairBus;
  let noiseBuf = null;
  let useGraph = false;
  let unlocked = false;
  let unlocking = false;
  let fadeStartedAt = -1; // usado quando não dá para usar o grafo (volume do elemento)
  let despairNodes = null;
  let ended = false;

  const music = new Audio();
  music.src = C.MUSIC_SRC;
  music.preload = 'auto';
  music.loop = false;
  music.setAttribute('playsinline', '');
  let musicError = false;
  let musicStarted = false;
  music.addEventListener('error', () => { musicError = true; });

  function makeNoise() {
    const len = ctx.sampleRate * 2;
    const b = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = b.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return b;
  }

  // Cria o contexto de áudio (pode nascer "suspenso" se ainda não houve toque/tecla).
  function ensureCtx() {
    try {
      if (navigator.audioSession) navigator.audioSession.type = 'playback';
    } catch (e) { /* ignore */ }
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (AC) {
        ctx = new AC();
        master = ctx.createGain();
        master.gain.value = 1;
        master.connect(ctx.destination);
        sfx = ctx.createGain();
        sfx.gain.value = 1;
        sfx.connect(master);
        despairBus = ctx.createGain();
        despairBus.gain.value = 1;
        despairBus.connect(master);
        noiseBuf = makeNoise();
        // A música passa pelo WebAudio (permite fade no iOS, onde audio.volume não funciona).
        // Em file:// isso deixaria a música muda (CORS), então usamos o volume do elemento.
        if (location.protocol !== 'file:') {
          try {
            const src = ctx.createMediaElementSource(music);
            musicFilter = ctx.createBiquadFilter();
            musicFilter.type = 'lowpass';
            musicFilter.frequency.value = 20000;
            musicFilter.Q.value = 0.5;
            musicGain = ctx.createGain();
            musicGain.gain.value = 0;
            src.connect(musicFilter);
            musicFilter.connect(musicGain);
            musicGain.connect(master);
            useGraph = true;
          } catch (e) {
            useGraph = false;
          }
        }
        // buffer silencioso (destrava iOS antigo)
        const b = ctx.createBuffer(1, 1, 22050);
        const s = ctx.createBufferSource();
        s.buffer = b;
        s.connect(ctx.destination);
        s.start(0);
      }
    }
  }

  // Tenta ligar o áudio logo ao abrir (alguns navegadores permitem).
  function tryEarly() {
    try { ensureCtx(); } catch (e) { /* ignore */ }
  }

  // Precisa ser chamado DENTRO de um evento de toque/tecla (regras de autoplay, iOS).
  function unlock() {
    ensureCtx();
    if (ctx && ctx.state !== 'running') ctx.resume();
    // "Destrava" o elemento de áudio dentro do gesto, para poder tocar depois (iOS).
    // Só marca como destravado quando o play() realmente funciona.
    if (!unlocked && !unlocking && !musicStarted) {
      unlocking = true;
      if (!useGraph) music.volume = 0;
      const p = music.play();
      if (p && p.then) {
        p.then(() => {
          unlocked = true;
          unlocking = false;
          if (!musicStarted) {
            music.pause();
            music.currentTime = 0;
          }
        }).catch(() => { unlocking = false; });
      } else {
        unlocked = true;
        unlocking = false;
      }
    }
  }

  function now() {
    return ctx ? ctx.currentTime : 0;
  }

  // ---------------- bips ----------------
  function env(g, t, peak, a, d) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
  }

  // Bip confortável da digitação
  function bip(pitch) {
    if (!ctx || ended) return;
    const t = now();
    const o = ctx.createOscillator();
    const f = ctx.createBiquadFilter();
    const g = ctx.createGain();
    o.type = 'square';
    o.frequency.value = (pitch || 494) * (1 + (Math.random() - 0.5) * 0.03);
    f.type = 'lowpass';
    f.frequency.value = 1600;
    f.Q.value = 0.3;
    env(g, t, 0.05, 0.004, 0.055);
    o.connect(f); f.connect(g); g.connect(sfx);
    o.start(t);
    o.stop(t + 0.08);
  }

  function confirm() {
    if (!ctx || ended) return;
    const t = now();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    const f = ctx.createBiquadFilter();
    o.type = 'triangle';
    o.frequency.setValueAtTime(587, t);
    o.frequency.setValueAtTime(784, t + 0.05);
    f.type = 'lowpass';
    f.frequency.value = 2500;
    env(g, t, 0.07, 0.005, 0.12);
    o.connect(f); f.connect(g); g.connect(sfx);
    o.start(t);
    o.stop(t + 0.15);
  }

  // Bip áspero das vozes intrusivas
  function voice(intensity) {
    if (!ctx || ended) return;
    const t = now();
    const g = ctx.createGain();
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 700 + intensity * 900;
    const base = 70 + Math.random() * 60;
    for (const mul of [1, 1.06]) {
      const o = ctx.createOscillator();
      o.type = mul === 1 ? 'sawtooth' : 'square';
      o.frequency.value = base * mul;
      o.connect(f);
      o.start(t);
      o.stop(t + 0.09);
    }
    env(g, t, 0.035 + intensity * 0.05, 0.003, 0.07);
    f.connect(g); g.connect(despairBus);
  }

  function noiseBurst(dest, t, dur, freq, q, peak, type) {
    const s = ctx.createBufferSource();
    s.buffer = noiseBuf;
    s.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = type || 'bandpass';
    f.frequency.value = freq;
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + dur * 0.3);
    g.gain.linearRampToValueAtTime(0.0001, t + dur);
    let out = g;
    if (ctx.createStereoPanner) {
      const p = ctx.createStereoPanner();
      p.pan.value = Math.random() * 1.6 - 0.8;
      g.connect(p);
      out = p;
    }
    s.connect(f); f.connect(g); out.connect(dest);
    s.start(t, Math.random() * 1.5);
    s.stop(t + dur + 0.05);
  }

  // Sussurro (ruído filtrado) que acompanha as palavras
  function whisper(intensity) {
    if (!ctx || ended) return;
    noiseBurst(despairBus, now(), 0.5 + Math.random() * 0.7, 1400 + Math.random() * 2200, 3 + Math.random() * 4, 0.02 + intensity * 0.05);
  }

  // Baque da queda
  function thud() {
    if (!ctx || ended) return;
    const t = now();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(110, t);
    o.frequency.exponentialRampToValueAtTime(38, t + 0.35);
    env(g, t, 0.7, 0.005, 0.45);
    o.connect(g); g.connect(sfx);
    o.start(t);
    o.stop(t + 0.5);
    noiseBurst(sfx, t, 0.25, 250, 0.7, 0.35, 'lowpass');
  }

  function heartbeat(vol) {
    if (!ctx || ended) return;
    const t = now();
    [[0, 1], [0.17, 0.65]].forEach(([dt, k]) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = 'sine';
      o.frequency.setValueAtTime(72, t + dt);
      o.frequency.exponentialRampToValueAtTime(42, t + dt + 0.13);
      env(g, t + dt, vol * k, 0.008, 0.16);
      o.connect(g); g.connect(despairBus);
      o.start(t + dt);
      o.stop(t + dt + 0.22);
    });
  }

  // Drone grave + zumbido agudo (liga na queda, cresce com o desespero)
  function startDespair() {
    if (!ctx || despairNodes) return;
    const t = now();
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 180;
    const g = ctx.createGain();
    g.gain.value = 0;
    lp.connect(g); g.connect(despairBus);
    const oscs = [55, 55.45, 77.8].map((fq) => {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = fq;
      o.connect(lp);
      o.start(t);
      return o;
    });
    // zumbido (tinnitus) bem baixinho
    const ring = ctx.createOscillator();
    ring.type = 'sine';
    ring.frequency.value = 5200;
    const rg = ctx.createGain();
    rg.gain.value = 0;
    ring.connect(rg); rg.connect(despairBus);
    ring.start(t);
    // ruído grave contínuo
    const ns = ctx.createBufferSource();
    ns.buffer = noiseBuf;
    ns.loop = true;
    const nf = ctx.createBiquadFilter();
    nf.type = 'lowpass';
    nf.frequency.value = 400;
    const ng = ctx.createGain();
    ng.gain.value = 0;
    ns.connect(nf); nf.connect(ng); ng.connect(despairBus);
    ns.start(t);
    despairNodes = { g, lp, oscs, ring, rg, ns, ng };
  }

  function setDespair(D) {
    if (!ctx) return;
    const t = now();
    if (despairNodes) {
      despairNodes.g.gain.setTargetAtTime(0.02 + D * 0.11, t, 0.5);
      despairNodes.lp.frequency.setTargetAtTime(160 + D * 260, t, 0.5);
      despairNodes.rg.gain.setTargetAtTime(D > 0.55 ? (D - 0.55) * 0.022 : 0, t, 1.0);
      despairNodes.ng.gain.setTargetAtTime(D * 0.05, t, 0.5);
    }
    if (useGraph && musicFilter) {
      // abafa a música aos poucos (dissociação), sem destruir a música
      const f = 20000 * Math.pow(3800 / 20000, Math.min(1, D * 1.1));
      musicFilter.frequency.setTargetAtTime(f, t, 0.8);
    }
  }

  // ---------------- espelho ----------------
  let mirrorNodes = null;
  // Drone grave que cresce enquanto a criatura está no reflexo
  function mirrorDrone(on) {
    if (!ctx || ended) return;
    const t = now();
    if (on && !mirrorNodes) {
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(0.16, t + 5);
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.setValueAtTime(140, t);
      lp.frequency.linearRampToValueAtTime(520, t + 5);
      lp.connect(g); g.connect(master);
      const oscs = [41, 41.6, 61.7, 87.3].map((fq, i) => {
        const o = ctx.createOscillator();
        o.type = i < 2 ? 'sawtooth' : 'triangle';
        o.frequency.value = fq;
        o.connect(lp);
        o.start(t);
        return o;
      });
      const ns = ctx.createBufferSource();
      ns.buffer = noiseBuf;
      ns.loop = true;
      const nf = ctx.createBiquadFilter();
      nf.type = 'bandpass';
      nf.frequency.value = 900;
      nf.Q.value = 6;
      const ng = ctx.createGain();
      ng.gain.setValueAtTime(0.0001, t);
      ng.gain.linearRampToValueAtTime(0.05, t + 5);
      ns.connect(nf); nf.connect(ng); ng.connect(master);
      ns.start(t);
      mirrorNodes = { g, oscs, ns, ng };
    } else if (!on && mirrorNodes) {
      const m = mirrorNodes;
      mirrorNodes = null;
      m.g.gain.cancelScheduledValues(t);
      m.g.gain.setTargetAtTime(0.0001, t, 0.08);
      m.ng.gain.cancelScheduledValues(t);
      m.ng.gain.setTargetAtTime(0.0001, t, 0.08);
      for (const o of m.oscs) o.stop(t + 0.5);
      m.ns.stop(t + 0.5);
    }
  }

  // Grito da criatura quando ela "pega" o menino
  function screech() {
    if (!ctx || ended) return;
    const t = now();
    const g = ctx.createGain();
    env(g, t, 0.32, 0.01, 0.9);
    const ws = ctx.createWaveShaper();
    const curve = new Float32Array(256);
    for (let i = 0; i < 256; i++) {
      const x = i / 128 - 1;
      curve[i] = Math.tanh(x * 4);
    }
    ws.curve = curve;
    ws.connect(g); g.connect(master);
    [1, 1.47, 2.03].forEach((m) => {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(820 * m, t);
      o.frequency.exponentialRampToValueAtTime(95 * m, t + 0.85);
      o.connect(ws);
      o.start(t);
      o.stop(t + 1);
    });
    noiseBurst(master, t, 0.7, 2500, 0.8, 0.25);
    thud();
  }

  // Atordoado: música abafada + zumbido (k de 1 até 0)
  let dazeRing = null;
  function setDaze(k) {
    if (!ctx) return;
    const t = now();
    if (k > 0 && !dazeRing) {
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = 4700;
      const g = ctx.createGain();
      g.gain.value = 0;
      o.connect(g); g.connect(master);
      o.start(t);
      dazeRing = { o, g };
    }
    if (dazeRing) {
      dazeRing.g.gain.setTargetAtTime(0.022 * k, t, 0.1);
      if (k <= 0) {
        const r = dazeRing;
        dazeRing = null;
        r.g.gain.setTargetAtTime(0, t, 0.05);
        r.o.stop(t + 0.3);
      }
    }
    if (useGraph && musicFilter) {
      const f = k > 0 ? 20000 * Math.pow(600 / 20000, k) : 20000;
      musicFilter.frequency.setTargetAtTime(f, t, k > 0 ? 0.15 : 0.05);
    }
  }

  // ---------------- música ----------------
  function startMusic(fromTime) {
    musicStarted = true;
    if (fromTime) {
      try { music.currentTime = fromTime; } catch (e) { /* ignore */ }
    } else {
      try { music.currentTime = 0; } catch (e) { /* ignore */ }
    }
    const fade = C.MUSIC_FADE_IN;
    if (useGraph) {
      const t = now();
      const N = 64;
      const curve = new Float32Array(N);
      for (let i = 0; i < N; i++) {
        const x = i / (N - 1);
        curve[i] = x * x; // fade perceptualmente suave
      }
      musicGain.gain.cancelScheduledValues(t);
      musicGain.gain.setValueAtTime(0, t);
      musicGain.gain.setValueCurveAtTime(curve, t + 0.01, fade);
    } else {
      music.volume = 0;
      fadeStartedAt = performance.now();
    }
    const p = music.play();
    if (p && p.catch) p.catch(() => { musicError = true; });
  }

  function update() {
    if (!useGraph && fadeStartedAt >= 0 && !ended) {
      const x = Math.min(1, (performance.now() - fadeStartedAt) / 1000 / C.MUSIC_FADE_IN);
      try { music.volume = x * x; } catch (e) { /* iOS ignora */ }
    }
  }

  function musicTime() {
    return music.currentTime || 0;
  }
  function musicDuration() {
    return isFinite(music.duration) && music.duration > 0 ? music.duration : 342.05;
  }
  function musicPlaying() {
    return musicStarted && !music.paused && !music.ended;
  }

  function pauseAll() {
    if (musicStarted && !music.ended) music.pause();
    if (ctx && ctx.state === 'running') ctx.suspend();
  }
  function resumeAll() {
    if (ended) return;
    if (ctx) ctx.resume();
    if (musicStarted && !music.ended) {
      const p = music.play();
      if (p && p.catch) p.catch(() => {});
    }
  }

  // Fim seco: tudo para de uma vez.
  function hardStop() {
    ended = true;
    try { music.pause(); } catch (e) { /* ignore */ }
    if (ctx) {
      try {
        master.gain.cancelScheduledValues(now());
        master.gain.setValueAtTime(0, now());
      } catch (e) { /* ignore */ }
      setTimeout(() => ctx.suspend(), 60);
    }
  }

  return {
    music,
    unlock,
    tryEarly,
    bip,
    confirm,
    voice,
    whisper,
    thud,
    heartbeat,
    startDespair,
    setDespair,
    mirrorDrone,
    screech,
    setDaze,
    startMusic,
    update,
    musicTime,
    musicDuration,
    musicPlaying,
    pauseAll,
    resumeAll,
    hardStop,
    get musicError() { return musicError; },
    get musicStarted() { return musicStarted; },
    get ready() { return !!ctx; },
  };
})();
