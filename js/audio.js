'use strict';
// ---------------------------------------------------------------------------
// Áudio 100% sintetizado (WebAudio): efeitos, vozes, batucada e riff pesado
// ---------------------------------------------------------------------------
const AUDIO = {
  ctx: null, master: null, sfx: null, mus: null, ok: false,
  listener: { x: 0, y: 0, z: 0, yaw: 0 },
  vol: 0.8, musicVol: 0.55,
  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = this.ctx = new AC();
    this.comp = ctx.createDynamicsCompressor();
    this.comp.threshold.value = -14; this.comp.ratio.value = 6; this.comp.attack.value = 0.003; this.comp.release.value = 0.2;
    this.master = ctx.createGain(); this.master.gain.value = this.vol;
    this.sfx = ctx.createGain(); this.sfx.gain.value = 1;
    this.mus = ctx.createGain(); this.mus.gain.value = this.musicVol;
    this.sfx.connect(this.comp); this.mus.connect(this.comp); this.comp.connect(this.master); this.master.connect(ctx.destination);
    // buffers de ruído
    const len = ctx.sampleRate * 2;
    this.white = ctx.createBuffer(1, len, ctx.sampleRate);
    this.brown = ctx.createBuffer(1, len, ctx.sampleRate);
    const w = this.white.getChannelData(0), b = this.brown.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      w[i] = Math.random() * 2 - 1;
      last = (last + 0.02 * w[i]) / 1.02; b[i] = last * 3.5;
    }
    // curva de distorção
    this.distCurve = new Float32Array(1024);
    for (let i = 0; i < 1024; i++) { const x = i / 512 - 1; this.distCurve[i] = Math.tanh(x * 6) * 0.8; }
    this.ok = true;
    this.startAmbience();
  },
  setVolume(v) { this.vol = v; if (this.master) this.master.gain.value = v; },
  setMusicVolume(v) { this.musicVol = v; if (this.mus) this.mus.gain.setTargetAtTime(v, this.ctx.currentTime, 0.1); },
  // saída espacial para um som
  out(pos, vol = 1, maxDist = 60) {
    const ctx = this.ctx;
    const g = ctx.createGain();
    let gain = vol, pan = 0;
    if (pos) {
      const L = this.listener;
      const dx = pos[0] - L.x, dy = pos[1] - L.y, dz = pos[2] - L.z;
      const d = Math.hypot(dx, dy, dz);
      if (d > maxDist * 1.5) return null;
      gain *= 1 / (1 + d * 0.06 + d * d * 0.0025);
      const rx = Math.cos(L.yaw), rz = -Math.sin(L.yaw);
      pan = d > 0.5 ? clamp((dx * rx + dz * rz) / d, -1, 1) * 0.75 : 0;
    }
    if (gain < 0.005) return null;
    g.gain.value = gain;
    if (ctx.createStereoPanner) {
      const p = ctx.createStereoPanner(); p.pan.value = pan;
      g.connect(p); p.connect(this.sfx);
    } else g.connect(this.sfx);
    return g;
  },
  env(param, t, a, peak, dur, curve = 'exp') {
    param.setValueAtTime(0.0001, t);
    param.linearRampToValueAtTime(peak, t + a);
    if (curve === 'exp') param.exponentialRampToValueAtTime(0.0001, t + a + dur);
    else param.linearRampToValueAtTime(0.0001, t + a + dur);
  },
  noise(o, dest) {
    const ctx = this.ctx, t = ctx.currentTime + (o.t || 0);
    const src = ctx.createBufferSource();
    src.buffer = o.brown ? this.brown : this.white;
    src.loop = true;
    src.playbackRate.value = o.rate || 1;
    let node = src;
    if (o.f) {
      const f = ctx.createBiquadFilter();
      f.type = o.ft || 'lowpass'; f.Q.value = o.q || 0.7;
      f.frequency.setValueAtTime(o.f, t);
      if (o.f1) f.frequency.exponentialRampToValueAtTime(o.f1, t + (o.fd || o.dur));
      node.connect(f); node = f;
    }
    const g = ctx.createGain();
    this.env(g.gain, t, o.a || 0.002, o.v || 0.5, o.dur, o.curve);
    node.connect(g); g.connect(dest);
    src.start(t, Math.random() * 1.5); src.stop(t + (o.a || 0.002) + o.dur + 0.05);
  },
  tone(o, dest) {
    const ctx = this.ctx, t = ctx.currentTime + (o.t || 0);
    const osc = ctx.createOscillator();
    osc.type = o.w || 'sine';
    osc.frequency.setValueAtTime(o.f, t);
    if (o.f1) osc.frequency.exponentialRampToValueAtTime(o.f1, t + (o.fd || o.dur));
    if (o.det) osc.detune.value = o.det;
    let node = osc;
    if (o.dist) { const ws = ctx.createWaveShaper(); ws.curve = this.distCurve; node.connect(ws); node = ws; }
    if (o.lp) { const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = o.lp; node.connect(f); node = f; }
    const g = ctx.createGain();
    this.env(g.gain, t, o.a || 0.002, o.v || 0.3, o.dur, o.curve);
    node.connect(g); g.connect(dest);
    osc.start(t); osc.stop(t + (o.a || 0.002) + o.dur + 0.05);
  },
  // voz com formantes (gritos dos torcedores)
  voice(o, dest) {
    const ctx = this.ctx, t = ctx.currentTime + (o.t || 0);
    const F = { a: [750, 1250], e: [480, 1900], o: [450, 820], u: [330, 720], i: [300, 2300] }[o.vowel || 'a'];
    const osc = ctx.createOscillator(); osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(o.f, t);
    if (o.f1) osc.frequency.exponentialRampToValueAtTime(o.f1, t + o.dur);
    const vib = ctx.createOscillator(); vib.frequency.value = 6 + Math.random() * 3;
    const vg = ctx.createGain(); vg.gain.value = o.f * 0.03; vib.connect(vg); vg.connect(osc.frequency);
    const g = ctx.createGain();
    this.env(g.gain, t, o.a || 0.02, o.v || 0.3, o.dur);
    for (let k = 0; k < 2; k++) {
      const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = F[k] * (o.fs || 1); bp.Q.value = 6;
      const bg = ctx.createGain(); bg.gain.value = k === 0 ? 1.4 : 0.8;
      osc.connect(bp); bp.connect(bg); bg.connect(g);
    }
    if (o.rasp) this.noise({ t: o.t, dur: o.dur, f: 1200, ft: 'bandpass', q: 1, v: o.v * 0.4, a: o.a || 0.02 }, dest);
    g.connect(dest);
    osc.start(t); osc.stop(t + o.dur + 0.1); vib.start(t); vib.stop(t + o.dur + 0.1);
  },
  play(name, pos, vol = 1) {
    if (!this.ok) return;
    const fn = SFX[name];
    if (!fn) return;
    const d = this.out(pos, vol, fn.range || 60);
    if (!d) return;
    fn(this, d);
  },
  // ------------- ambiente -------------
  startAmbience() {
    const ctx = this.ctx;
    const src = ctx.createBufferSource(); src.buffer = this.brown; src.loop = true;
    const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 500; f.Q.value = 0.6;
    const g = ctx.createGain(); g.gain.value = 0.05;
    const lfo = ctx.createOscillator(); lfo.frequency.value = 0.07;
    const lg = ctx.createGain(); lg.gain.value = 0.025; lfo.connect(lg); lg.connect(g.gain);
    src.connect(f); f.connect(g); g.connect(this.sfx);
    src.start(); lfo.start();
    this.ambGain = g;
  },
  // canto da torcida "Ô ô ô..."
  chant(vol = 0.25, pos = null) {
    if (!this.ok) return;
    const d = this.out(pos, vol, 200); if (!d) return;
    const notes = [['o', 392, 0.3], ['o', 392, 0.3], ['o', 440, 0.3], ['a', 392, 0.55], ['e', 330, 0.3], ['a', 392, 0.9]];
    for (let v = 0; v < 6; v++) {
      let t = Math.random() * 0.05;
      const det = 1 + (Math.random() - 0.5) * 0.02, oct = v % 3 === 0 ? 0.5 : 1;
      for (const [vw, f, du] of notes) {
        this.voice({ t, f: f * det * oct, dur: du * 0.95, vowel: vw, v: 0.12, a: 0.04 }, d);
        t += du + (Math.random() - 0.5) * 0.02;
      }
    }
  },
};

// ---------------------------------------------------------------------------
// Receitas de efeitos sonoros
// ---------------------------------------------------------------------------
const SFX = {
  pistol(A, d) {
    A.noise({ dur: 0.12, f: 3000, f1: 700, ft: 'bandpass', q: 0.8, v: 0.7 }, d);
    A.tone({ dur: 0.07, w: 'square', f: 200, f1: 55, v: 0.35 }, d);
    A.noise({ dur: 0.25, f: 500, v: 0.25, brown: true, t: 0.01 }, d);
  },
  shotgun(A, d) {
    A.noise({ dur: 0.5, f: 4000, f1: 250, v: 1.0 }, d);
    A.tone({ dur: 0.3, f: 110, f1: 30, v: 0.9 }, d);
    A.noise({ dur: 0.07, f: 1800, ft: 'bandpass', q: 1, v: 0.7 }, d);
    A.noise({ dur: 0.6, f: 300, v: 0.4, brown: true, t: 0.02 }, d);
  },
  pump(A, d) {
    A.noise({ dur: 0.04, f: 2500, ft: 'bandpass', q: 3, v: 0.4 }, d);
    A.tone({ dur: 0.03, w: 'square', f: 700, f1: 400, v: 0.12 }, d);
    A.noise({ t: 0.13, dur: 0.05, f: 1800, ft: 'bandpass', q: 3, v: 0.5 }, d);
    A.tone({ t: 0.13, dur: 0.03, w: 'square', f: 500, f1: 900, v: 0.12 }, d);
  },
  ssg(A, d) {
    A.noise({ dur: 0.8, f: 3500, f1: 150, v: 1.2 }, d);
    A.tone({ dur: 0.45, f: 90, f1: 25, v: 1.1 }, d);
    A.noise({ dur: 0.1, f: 1500, ft: 'bandpass', q: 1, v: 0.9 }, d);
    A.noise({ dur: 1.0, f: 250, v: 0.5, brown: true, t: 0.03 }, d);
  },
  ssg_open(A, d) {
    A.noise({ dur: 0.05, f: 1500, ft: 'bandpass', q: 4, v: 0.5 }, d);
    A.tone({ dur: 0.05, w: 'square', f: 300, f1: 200, v: 0.15 }, d);
  },
  ssg_load(A, d) {
    A.noise({ dur: 0.04, f: 2200, ft: 'bandpass', q: 4, v: 0.3 }, d);
    A.noise({ t: 0.12, dur: 0.04, f: 2200, ft: 'bandpass', q: 4, v: 0.3 }, d);
  },
  ssg_close(A, d) {
    A.noise({ dur: 0.06, f: 1200, ft: 'bandpass', q: 3, v: 0.6 }, d);
    A.tone({ dur: 0.05, w: 'square', f: 180, f1: 120, v: 0.2 }, d);
  },
  rifle(A, d) {
    A.noise({ dur: 0.09, f: 2600, f1: 900, ft: 'bandpass', q: 0.9, v: 0.6 }, d);
    A.tone({ dur: 0.06, w: 'square', f: 160, f1: 50, v: 0.35 }, d);
    A.noise({ dur: 0.15, f: 400, v: 0.2, brown: true }, d);
  },
  rocket(A, d) {
    A.noise({ dur: 0.4, f: 700, f1: 3000, ft: 'bandpass', q: 1.2, v: 0.6 }, d);
    A.tone({ dur: 0.9, w: 'sine', f: 1400, f1: 2600, v: 0.12, t: 0.05 }, d);
    A.tone({ dur: 0.2, f: 90, f1: 40, v: 0.6 }, d);
  },
  whistle(A, d) { A.tone({ dur: 0.7, w: 'sine', f: 1800, f1: 900, v: 0.12 }, d); },
  explosion(A, d) {
    A.noise({ dur: 1.4, f: 1600, f1: 80, v: 1.3, brown: true }, d);
    A.noise({ dur: 0.35, f: 5000, f1: 800, v: 0.6 }, d);
    A.tone({ dur: 0.8, f: 70, f1: 22, v: 1.1 }, d);
    for (let i = 0; i < 5; i++) A.noise({ t: 0.1 + Math.random() * 0.5, dur: 0.04, f: 3000, ft: 'highpass', v: 0.25 }, d);
  },
  explosion_small(A, d) {
    A.noise({ dur: 0.6, f: 2500, f1: 150, v: 0.9, brown: true }, d);
    A.noise({ dur: 0.15, f: 6000, f1: 1500, v: 0.5 }, d);
    A.tone({ dur: 0.3, f: 120, f1: 40, v: 0.6 }, d);
  },
  swing(A, d) { A.noise({ dur: 0.2, f: 500, f1: 1800, ft: 'bandpass', q: 2, v: 0.35 }, d); },
  hit_melee(A, d) { A.tone({ dur: 0.1, f: 160, f1: 60, v: 0.7 }, d); A.noise({ dur: 0.08, f: 900, v: 0.5 }, d); },
  flesh(A, d) { A.noise({ dur: 0.07, f: 800, f1: 300, v: 0.4 }, d); A.tone({ dur: 0.05, f: 120, f1: 60, v: 0.2 }, d); },
  gib(A, d) {
    A.noise({ dur: 0.35, f: 900, f1: 200, v: 0.9, brown: true }, d);
    for (let i = 0; i < 4; i++) A.noise({ t: Math.random() * 0.3, dur: 0.06, f: 600, v: 0.4 }, d);
  },
  ricochet(A, d) { A.noise({ dur: 0.03, f: 3000, ft: 'highpass', v: 0.25 }, d); if (Math.random() < 0.3) A.tone({ dur: 0.12, f: 2800, f1: 1600, v: 0.06 }, d); },
  enemy_alert(A, d) {
    const f = 150 + Math.random() * 70, vw = choice(['e', 'o', 'a']);
    A.voice({ dur: 0.28, f: f * 1.2, f1: f * 1.4, vowel: vw, v: 0.4, rasp: true }, d);
    A.voice({ t: 0.32, dur: 0.35, f: f * 1.3, f1: f, vowel: vw, v: 0.35, rasp: true }, d);
  },
  enemy_pain(A, d) { const f = 150 + Math.random() * 60; A.voice({ dur: 0.18, f: f * 1.3, f1: f, vowel: choice(['a', 'u']), v: 0.4, rasp: true }, d); },
  enemy_death(A, d) {
    const f = 140 + Math.random() * 60;
    A.voice({ dur: 0.7, f: f * 1.4, f1: f * 0.5, vowel: choice(['a', 'o', 'u']), v: 0.45, rasp: true }, d);
    A.noise({ t: 0.35, dur: 0.15, f: 300, v: 0.5, brown: true }, d);
  },
  brute_alert(A, d) { A.voice({ dur: 0.6, f: 90, f1: 110, vowel: 'o', v: 0.6, rasp: true }, d); A.voice({ t: 0.1, dur: 0.5, f: 60, f1: 75, vowel: 'a', v: 0.4 }, d); },
  brute_death(A, d) { A.voice({ dur: 1.0, f: 100, f1: 40, vowel: 'o', v: 0.6, rasp: true }, d); A.noise({ t: 0.5, dur: 0.3, f: 200, v: 0.8, brown: true }, d); },
  boss_roar(A, d) {
    A.voice({ dur: 1.6, f: 70, f1: 50, vowel: 'a', v: 0.9, rasp: true }, d);
    A.voice({ dur: 1.4, f: 105, f1: 70, vowel: 'o', v: 0.6, rasp: true }, d);
    A.noise({ dur: 1.5, f: 400, f1: 150, v: 0.6, brown: true }, d);
  },
  boss_pain(A, d) { A.voice({ dur: 0.4, f: 90, f1: 70, vowel: 'a', v: 0.8, rasp: true }, d); },
  shockwave(A, d) { A.tone({ dur: 0.9, f: 60, f1: 20, v: 1.2 }, d); A.noise({ dur: 0.9, f: 800, f1: 60, v: 1.0, brown: true }, d); },
  player_pain(A, d) { const f = 110 + Math.random() * 20; A.voice({ dur: 0.2, f: f * 1.2, f1: f, vowel: choice(['u', 'a']), v: 0.45, rasp: true }, d); },
  player_death(A, d) { A.voice({ dur: 1.2, f: 150, f1: 50, vowel: 'a', v: 0.6, rasp: true }, d); },
  jump(A, d) { A.noise({ dur: 0.06, f: 500, v: 0.15 }, d); },
  land(A, d) { A.noise({ dur: 0.1, f: 300, v: 0.35, brown: true }, d); A.tone({ dur: 0.06, f: 90, f1: 50, v: 0.2 }, d); },
  step(A, d) { A.noise({ dur: 0.05, f: 350 + Math.random() * 300, v: 0.13, brown: true }, d); },
  slide(A, d) { A.noise({ dur: 0.45, f: 1200, f1: 400, ft: 'bandpass', q: 0.6, v: 0.25 }, d); },
  pickup_health(A, d) { A.tone({ dur: 0.08, w: 'square', f: 660, v: 0.12, lp: 3000 }, d); A.tone({ t: 0.07, dur: 0.12, w: 'square', f: 990, v: 0.12, lp: 3000 }, d); },
  pickup_ammo(A, d) { A.noise({ dur: 0.04, f: 2500, ft: 'bandpass', q: 3, v: 0.5 }, d); A.tone({ t: 0.03, dur: 0.06, w: 'triangle', f: 440, v: 0.25 }, d); },
  pickup_armor(A, d) { A.tone({ dur: 0.1, w: 'sawtooth', f: 330, f1: 660, v: 0.15, lp: 2500 }, d); A.tone({ t: 0.08, dur: 0.15, w: 'square', f: 880, v: 0.1, lp: 3000 }, d); },
  pickup_weapon(A, d) {
    A.noise({ dur: 0.05, f: 1600, ft: 'bandpass', q: 2, v: 0.6 }, d);
    A.tone({ dur: 0.12, w: 'sawtooth', f: 110, f1: 220, v: 0.3, lp: 1500 }, d);
    A.noise({ t: 0.14, dur: 0.06, f: 2400, ft: 'bandpass', q: 3, v: 0.5 }, d);
    A.tone({ t: 0.14, dur: 0.2, w: 'square', f: 440, v: 0.12, lp: 2500 }, d);
  },
  pickup_mega(A, d) { [523, 659, 784, 1046].forEach((f, i) => A.tone({ t: i * 0.07, dur: 0.18, w: 'square', f, v: 0.12, lp: 3500 }, d)); },
  pickup_key(A, d) { [784, 988, 1175, 1568].forEach((f, i) => A.tone({ t: i * 0.09, dur: 0.25, w: 'triangle', f, v: 0.25 }, d)); },
  secret(A, d) {
    [392, 523, 659, 784, 659, 1046].forEach((f, i) => A.tone({ t: i * 0.08, dur: 0.35, w: 'square', f, v: 0.08, lp: 2500 }, d));
    [392, 523, 659, 784, 659, 1046].forEach((f, i) => A.tone({ t: 0.25 + i * 0.08, dur: 0.35, w: 'square', f, v: 0.03, lp: 2000 }, d));
  },
  door(A, d) { A.noise({ dur: 0.9, f: 400, v: 0.45, brown: true, a: 0.05 }, d); A.tone({ dur: 0.9, w: 'sawtooth', f: 55, f1: 70, v: 0.08, lp: 300, a: 0.05 }, d); A.noise({ t: 0.9, dur: 0.12, f: 800, v: 0.4 }, d); },
  locked(A, d) { A.tone({ dur: 0.12, w: 'square', f: 140, v: 0.2, lp: 1200 }, d); A.tone({ t: 0.15, dur: 0.12, w: 'square', f: 110, v: 0.2, lp: 1200 }, d); },
  bottle_break(A, d) {
    A.noise({ dur: 0.25, f: 3500, ft: 'highpass', v: 0.5 }, d);
    for (let i = 0; i < 4; i++) A.tone({ t: Math.random() * 0.1, dur: 0.1, f: 2500 + Math.random() * 3000, v: 0.06 }, d);
  },
  throw(A, d) { A.noise({ dur: 0.2, f: 400, f1: 1200, ft: 'bandpass', q: 1.5, v: 0.25 }, d); },
  enemy_rojao(A, d) { A.noise({ dur: 0.3, f: 2000, ft: 'bandpass', q: 1, v: 0.4 }, d); A.tone({ dur: 0.8, w: 'sine', f: 900, f1: 1800, v: 0.1 }, d); },
  fuse(A, d) { A.noise({ dur: 0.6, f: 5000, ft: 'highpass', v: 0.18 }, d); },
  spawn(A, d) { A.noise({ dur: 0.9, f: 2500, ft: 'highpass', v: 0.35, a: 0.05 }, d); A.noise({ dur: 0.2, f: 400, v: 0.3, brown: true }, d); },
  punch(A, d) { A.tone({ dur: 0.12, f: 120, f1: 50, v: 0.9 }, d); A.noise({ dur: 0.1, f: 700, v: 0.6 }, d); },
  empty(A, d) { A.tone({ dur: 0.03, w: 'square', f: 1200, v: 0.1 }, d); },
  switch(A, d) { A.noise({ dur: 0.05, f: 2000, ft: 'bandpass', q: 3, v: 0.25 }, d); },
  checkpoint(A, d) { [523, 784].forEach((f, i) => A.tone({ t: i * 0.1, dur: 0.2, w: 'triangle', f, v: 0.15 }, d)); },
  crowd_cheer(A, d) {
    A.noise({ dur: 2.5, f: 700, f1: 900, ft: 'bandpass', q: 0.5, v: 0.5, a: 0.4, curve: 'lin' }, d);
    for (let i = 0; i < 6; i++) A.voice({ t: Math.random() * 0.4, dur: 1.4, f: 180 + Math.random() * 120, f1: 150 + Math.random() * 80, vowel: 'e', v: 0.07 }, d);
  },
  distant_rojao(A, d) { A.tone({ dur: 0.6, f: 1500, f1: 2400, v: 0.03 }, d); A.noise({ t: 0.65, dur: 0.4, f: 900, f1: 100, v: 0.25, brown: true }, d); },
};
SFX.explosion.range = 120; SFX.shotgun.range = 90; SFX.ssg.range = 100; SFX.boss_roar.range = 150; SFX.shockwave.range = 100; SFX.distant_rojao.range = 400;

// ---------------------------------------------------------------------------
// Música: batucada de torcida + camada de guitarra distorcida no combate
// ---------------------------------------------------------------------------
const MUSIC = {
  on: false, bpm: 142, step: 0, nextT: 0, timer: null, intensity: 0, target: 0, bus: null, guitarBus: null,
  start() {
    const A = AUDIO;
    if (!A.ok || this.on) return;
    this.on = true;
    const ctx = A.ctx;
    this.bus = ctx.createGain(); this.bus.gain.value = 0.9; this.bus.connect(A.mus);
    this.guitarBus = ctx.createGain(); this.guitarBus.gain.value = 0; this.guitarBus.connect(A.mus);
    this.nextT = ctx.currentTime + 0.1; this.step = 0;
    this.timer = setInterval(() => this.tick(), 40);
  },
  stop() { this.on = false; clearInterval(this.timer); if (this.bus) { this.bus.disconnect(); this.guitarBus.disconnect(); } },
  setIntensity(v) { this.target = v; },
  tick() {
    const A = AUDIO, ctx = A.ctx;
    if (!this.on) return;
    this.intensity += (this.target - this.intensity) * 0.05;
    this.guitarBus.gain.setTargetAtTime(this.intensity * 0.55, ctx.currentTime, 0.3);
    const sd = 60 / this.bpm / 4;
    while (this.nextT < ctx.currentTime + 0.15) {
      this.playStep(this.step, this.nextT);
      this.nextT += sd;
      this.step = (this.step + 1) % 64;
    }
  },
  playStep(s, t) {
    const A = AUDIO, ctx = A.ctx, b = this.bus, g = this.guitarBus;
    const off = t - ctx.currentTime;
    const s16 = s % 16;
    // surdos
    if (s16 === 0 || s16 === 8) this.surdo(off, 78, 0.8);
    if (s16 === 4 || s16 === 12) this.surdo(off, 58, 1.0);
    if (s16 === 6 || s16 === 14 || (s16 === 15 && s % 32 === 31)) this.surdo(off, 95, 0.45);
    // caixa
    const acc = [1, 0.25, 0.55, 0.4, 0.9, 0.25, 0.55, 0.45, 1, 0.25, 0.55, 0.4, 0.9, 0.3, 0.6, 0.5][s16];
    A.noise({ t: off, dur: 0.05, f: 2600, ft: 'highpass', v: 0.12 * acc }, b);
    // repique
    if ([2, 5, 10, 13, 15].includes(s16)) {
      A.tone({ t: off, dur: 0.07, w: 'triangle', f: 520, f1: 380, v: 0.12 }, b);
      A.noise({ t: off, dur: 0.03, f: 1800, ft: 'bandpass', q: 2, v: 0.1 }, b);
    }
    // tamborim
    if ([0, 2, 3, 5, 6, 8, 10, 11, 13, 14].includes(s16)) A.tone({ t: off, dur: 0.025, w: 'square', f: 1250, v: 0.025, lp: 4000 }, b);
    // camada pesada
    if (this.intensity > 0.03) {
      if (s16 === 0 || s16 === 6 || s16 === 8 || s16 === 11) {
        A.tone({ t: off, dur: 0.12, f: 140, f1: 45, v: 0.6 }, g);
        A.noise({ t: off, dur: 0.02, f: 3000, ft: 'bandpass', q: 2, v: 0.15 }, g);
      }
      if (s16 === 4 || s16 === 12) A.noise({ t: off, dur: 0.14, f: 1500, ft: 'bandpass', q: 0.8, v: 0.35 }, g);
      const note = RIFF[s];
      if (note) {
        const f = 41.2 * Math.pow(2, note / 12);
        const len = (s % 2 === 0) ? 0.12 : 0.08;
        A.tone({ t: off, dur: len, w: 'sawtooth', f, v: 0.16, dist: true, lp: 1800 }, g);
        A.tone({ t: off, dur: len, w: 'sawtooth', f: f * 1.498, v: 0.1, dist: true, lp: 1800, det: 6 }, g);
        A.tone({ t: off, dur: len, w: 'square', f: f / 2, v: 0.12, lp: 400 }, g);
      }
    }
  },
  surdo(off, f, v) {
    const A = AUDIO;
    A.tone({ t: off, dur: 0.45, f: f * 1.7, f1: f, fd: 0.05, v: 0.5 * v }, this.bus);
    A.noise({ t: off, dur: 0.05, f: 300, v: 0.15 * v, brown: true }, this.bus);
  },
};
// riff em semitons a partir de E1 (0 = pausa, 12 = E2)
const RIFF = (() => {
  const E = 12, G = 15, A = 17, Bb = 18, D = 10, B = 19;
  const bar1 = [E, 0, E, 0, E, 0, E, E, 0, E, 0, E, G, 0, A, 0];
  const bar2 = [E, 0, E, 0, E, 0, E, E, 0, E, 0, E, Bb, 0, A, 0];
  const bar3 = [E, 0, E, 0, E, 0, E, E, 0, E, 0, E, D, 0, E, 0];
  const bar4 = [G, 0, G, G, 0, G, A, 0, A, A, 0, A, B, 0, Bb, 0];
  return bar1.concat(bar2, bar3, bar4);
})();
