'use strict';
// ---------------------------------------------------------------------------
// Jogo: loop principal, estados, entrada, entidades e regras
// ---------------------------------------------------------------------------
const heal = (P, n, max) => { if (P.hp >= max) return false; P.hp = Math.min(max, P.hp + n); return true; };
const armorUp = (P, n, max) => { if (P.armor >= max) return false; P.armor = Math.min(max, P.armor + n); return true; };
const ammoUp = (P, k, n) => { if (P.ammo[k] >= AMMO_MAX[k]) return false; P.ammo[k] = Math.min(AMMO_MAX[k], P.ammo[k] + n); return true; };
const weaponUp = (P, w, k, n) => { const had = P.weapons[w]; P.weapons[w] = true; const got = ammoUp(P, k, n); if (!had) { P.select(w); return true; } return got; };
const ITEMS = {
  pamonha: { model: 'pamonha', msg: 'PAMONHA QUENTINHA! +25', snd: 'pickup_health', glow: [0.3, 1, 0.4], fn: (P) => heal(P, 25, 100) },
  pequi: { model: 'pequi', msg: 'PEQUI! +5 (CUIDADO COM O ESPINHO)', snd: 'pickup_health', glow: [1, 0.8, 0.2], fn: (P) => heal(P, 5, 200) },
  empadao: { model: 'empadao', msg: 'EMPADÃO GOIANO! +100', snd: 'pickup_mega', glow: [1, 0.6, 0.2], fn: (P) => heal(P, 100, 200), flash: [1, 0.8, 0.3] },
  camisa: { model: 'camisa', msg: 'CAMISA DA TORCIDA: +25 DE COLETE', snd: 'pickup_armor', glow: [0.3, 1, 0.6], fn: (P) => armorUp(P, 25, 200) },
  manto: { model: 'manto', msg: 'MANTO SAGRADO! +100 DE COLETE', snd: 'pickup_mega', glow: [0.3, 1, 0.5], fn: (P) => armorUp(P, 100, 200), flash: [0.3, 1, 0.5] },
  bullets: { model: 'bullets', msg: 'BALAS', glow: [1, 0.9, 0.4], fn: (P) => ammoUp(P, 'bullets', 20) },
  bulletsBig: { model: 'bulletsBig', msg: 'CAIXA DE BALAS', glow: [1, 0.9, 0.4], fn: (P) => ammoUp(P, 'bullets', 60) },
  shells: { model: 'shells', msg: 'CARTUCHOS CAL.12', glow: [1, 0.5, 0.3], fn: (P) => ammoUp(P, 'shells', 8) },
  shellsBig: { model: 'shellsBig', msg: 'CAIXA DE CARTUCHOS', glow: [1, 0.5, 0.3], fn: (P) => ammoUp(P, 'shells', 20) },
  rockets: { model: 'rockets', msg: 'ROJÕES', glow: [1, 0.3, 0.2], fn: (P) => ammoUp(P, 'rockets', 5) },
  pistol: { model: 'w_pistol', msg: 'OUTRA PISTOLA! AGORA É COM AS DUAS MÃOS', snd: 'pickup_weapon', glow: [1, 1, 1], scale: 1.6, fn: (P) => { if (!P.dual) { P.dual = true; ammoUp(P, 'bullets', 20); P.select('pistol'); return true; } return ammoUp(P, 'bullets', 20); } },
  shotgun: { model: 'w_shotgun', msg: 'ESPINGARDA! AGORA SIM', snd: 'pickup_weapon', glow: [1, 1, 1], scale: 1.3, fn: (P) => weaponUp(P, 'shotgun', 'shells', 8) },
  ssg: { model: 'w_ssg', msg: 'A DOZE DE CANO DUPLO!', snd: 'pickup_weapon', glow: [1, 1, 1], scale: 1.3, event: 'ssg', fn: (P) => weaponUp(P, 'ssg', 'shells', 10) },
  rifle: { model: 'w_rifle', msg: 'METRALHADORA!', snd: 'pickup_weapon', glow: [1, 1, 1], scale: 1.3, fn: (P) => weaponUp(P, 'rifle', 'bullets', 50) },
  rocket: { model: 'w_rocket', msg: 'LANÇA-ROJÃO DA BATERIA!', snd: 'pickup_weapon', glow: [1, 0.4, 0.2], scale: 1.2, event: 'rocket', fn: (P) => weaponUp(P, 'rocket', 'rockets', 8) },
  key_green: { model: 'key_green', msg: 'PEGOU A CHAVE VERDE', snd: 'pickup_key', glow: [0.2, 1, 0.3], scale: 1.5, event: 'key_green', fn: (P) => { P.keys.green = true; return true; } },
  key_white: { model: 'key_white', msg: 'PEGOU A CHAVE BRANCA', snd: 'pickup_key', glow: [1, 1, 1], scale: 1.5, event: 'key_white', fn: (P) => { P.keys.white = true; return true; } },
};

const G = {
  state: 'loading', time: 0, fps: 60, loadMsg: '',
  settings: Object.assign({ sens: 1.6, fov: 74, pix: 0, dither: true, vol: 0.8, music: 0.5, autohop: true, flips: true, invert: false, showFps: false }, lsGet('fjg_settings', {})),
  diffIndex: 1, diff: DIFFS[1],
  enemies: [], items: [], doors: [], triggers: [], barrels: [], emitters: [], groups: {}, flags: {},
  keys: {}, mouse: {}, mdx: 0, mdy: 0, locked: false,
  shakeAmt: 0, flashR: 0, flashP: 0, flashCol: [1, 0.8, 0.3], navT: 0, boss: null,
  saveSettings() { lsSet('fjg_settings', this.settings); },
  // ------------------------------------------------------------------
  async init() {
    this.cv = document.getElementById('gl');
    this.flashEl = document.getElementById('flash');
    HUD.init(document.getElementById('hud'));
    try { R.init(this.cv); } catch (e) { this.fatal(e.message); return; }
    this.resize();
    window.addEventListener('resize', () => this.resize());
    const step = async (msg) => { this.loadMsg = msg; HUD.draw(); await new Promise((r) => setTimeout(r, 16)); };
    try {
      await step('GERANDO TEXTURAS');
      const tex = buildTextures(); R.uploadTextures(tex);
      buildModels();
      await step('CONSTRUINDO O ESTÁDIO');
      this.world = new World();
      this.level = buildSerrinha(this.world);
      this.world.buildGrid();
      this.world.buildNav(-98, -50, 64, 48);
      await step('ACENDENDO OS REFLETORES (ASSANDO A LUZ)');
      const t0 = performance.now();
      const mesh = this.world.buildMesh();
      R.setStatic(mesh.data, mesh.quads);
      console.log('malha estática:', mesh.quads, 'quads em', Math.round(performance.now() - t0), 'ms');
      await step('SONDAS DE LUZ');
      this.world.buildProbes();
    } catch (e) { console.error(e); this.fatal(e.message); return; }
    this.dyn = new QuadBatch(40000); this.add = new QuadBatch(12000); this.vm = new QuadBatch(3000); this.vmAdd = new QuadBatch(200);
    this.bindInput();
    this.toTitle();
    this.last = performance.now();
    requestAnimationFrame((t) => this.loop(t));
  },
  fatal(msg) {
    this.state = 'loading'; this.loadMsg = 'ERRO: ' + msg;
    HUD.draw();
    const c = HUD.ctx; HUD.text('SEU NAVEGADOR PRECISA SUPORTAR WEBGL2', HUD.W / 2, HUD.H / 2 + 40, '#f88', 1, 'center');
  },
  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    const s = this.settings.pix || Math.max(1, Math.round(h / 330));
    const W = Math.max(160, Math.floor(w / s)), H = Math.max(90, Math.floor(h / s));
    R.resize(W, H);
    this.cv.style.width = W * s + 'px'; this.cv.style.height = H * s + 'px';
    HUD.resize(w, h);
  },
  // ------------------------------------------------------------------
  resetLevel() {
    const L = this.level, W = this.world;
    FX.reset();
    this.enemies = []; this.items = []; this.doors = []; this.triggers = []; this.barrels = []; this.emitters = [];
    this.groups = {}; this.flags = {}; this.boss = null; this.bossPending = 0; this.victoryPending = 0;
    W.dyn = [];
    W.nav.blocked.fill(0);
    for (const d of L.doors) {
      const b = d.box;
      const box = { x0: b[0], y0: b[1], z0: b[2], x1: b[3], y1: b[4], z1: b[5], flags: F_SOLID | F_SHOOT, active: true, dynamic: true, mat: 'metal' };
      W.dyn.push(box);
      const thinX = (b[3] - b[0]) < (b[5] - b[2]);
      const tex = new Array(6).fill(T.metal_dark);
      if (thinX) { tex[0] = tex[1] = T[d.tex]; } else { tex[4] = tex[5] = T[d.tex]; }
      const door = { id: d.id, box: b.slice(), key: d.key, dyn: box, state: 'closed', t: 0, h: b[4] - b[1], tex, msgT: 0, light: [1, 1, 1] };
      W.sampleProbe((b[0] + b[3]) / 2, (b[2] + b[5]) / 2, door.light);
      if (d.key) W.setNavBlocked(b[0], b[2], b[3], b[5], true);
      this.doors.push(door);
    }
    for (const b of L.barrels) {
      const box = { x0: b.x - 0.3, y0: b.y, z0: b.z - 0.3, x1: b.x + 0.3, y1: b.y + 0.95, z1: b.z + 0.3, flags: F_SOLID | F_SHOOT, active: true, dynamic: true, mat: 'metal' };
      W.dyn.push(box);
      this.barrels.push({ x: b.x, y: b.y, z: b.z, hp: 20, alive: true, fuse: -1, dyn: box, light: W.sampleProbe(b.x, b.z, [0, 0, 0]) });
    }
    for (const t of L.triggers) this.triggers.push(Object.assign({}, t, { fired: false }));
    let ps = null;
    for (const e of L.ents) {
      if (e.type === 'player') ps = e;
      else if (e.type === 'item') this.items.push({ type: e.itype, x: e.x, y: e.y, z: e.z, taken: false, ph: rand(0, TAU), light: W.sampleProbe(e.x, e.z, [0, 0, 0]) });
      else if (e.type === 'enemy') { if ((e.minDiff || 0) <= this.diff.level) this.enemies.push(new Enemy(e.etype, e.x, e.y, e.z, e.yaw, { dormant: e.dormant })); }
      else if (e.type === 'emitter') this.emitters.push({ kind: e.kind, x: e.x, y: e.y, z: e.z, small: e.small, t: rand(0, 1) });
    }
    this.player = new Player(ps.x, ps.y, ps.z, ps.yaw);
    this.stats = { kills: 0, total: this.enemies.length, secrets: 0, time: 0, deaths: 0 };
    this.cp = null; this.lastCheckpoint = 'INÍCIO';
    this.checkpoint('INÍCIO', null, true);
    this.scoreT = 0; this.lastScore = '';
    this.updateScoreboard(true);
  },
  newGame(di) {
    AUDIO.init();
    this.diffIndex = di; this.diff = DIFFS[di];
    this.resetLevel();
    this.state = 'intro'; this.introT = 0;
    HUD.msgs = []; HUD.big = null;
    MUSIC.start(); MUSIC.setIntensity(0);
  },
  startPlay() {
    this.state = 'play';
    this.lock();
    HUD.bigMsg('ENTRE NO ESTÁDIO E EXPULSE OS VILEIROS!', 4);
  },
  toTitle() {
    this.state = 'title';
    MENU.close(); MENU.open('main');
    this.unlock();
    if (this.level) this.resetLevel();
    this.titleA = 0.5;
    MUSIC.setIntensity(0);
  },
  pause() { if (this.state !== 'play') return; this.state = 'pause'; MENU.close(); MENU.open('pause'); this.unlock(); this.keys = {}; this.mouse = {}; },
  resume() { if (this.state !== 'pause') return; MENU.close(); this.state = this.player.alive ? 'play' : 'dead'; this.lock(); },
  lock() { try { const p = this.cv.requestPointerLock(); if (p && p.catch) p.catch(() => {}); } catch (e) { /* ignora */ } },
  unlock() { if (document.pointerLockElement) document.exitPointerLock(); },
  // ------------------------------------------------------------------
  bindInput() {
    const prevent = new Set(['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab', 'Backspace']);
    document.addEventListener('keydown', (e) => {
      AUDIO.init();
      if (prevent.has(e.code)) e.preventDefault();
      if (MENU.active()) { if (!(this.state === 'title' && e.code === 'Escape')) MENU.key(e.code); return; }
      if (this.state === 'intro') { if (e.code === 'Enter' || e.code === 'Space') this.startPlay(); return; }
      if (this.state === 'victory') { if (e.code === 'Enter' && this.victoryT > 2) this.toTitle(); return; }
      this.keys[e.code] = true;
      if (this.state === 'play' || this.state === 'dead') {
        const P = this.player;
        if (e.code.startsWith('Digit')) { const n = +e.code.slice(5); const w = WEAPON_ORDER.find((k) => WEAPONS[k].slot === n); if (w) P.select(w); }
        if (e.code === 'KeyQ') P.select(P.prev);
        if (e.code === 'Escape' || e.code === 'KeyP') this.pause();
        if (this.state === 'dead' && (e.code === 'Space' || e.code === 'Enter') && P.deadT > 1) this.respawn();
      }
    });
    document.addEventListener('keyup', (e) => { this.keys[e.code] = false; });
    window.addEventListener('blur', () => { this.keys = {}; this.mouse = {}; });
    document.addEventListener('mousemove', (e) => {
      if (this.locked) { this.mdx += e.movementX; this.mdy += e.movementY; }
      else { HUD.mouse.x = e.clientX / HUD.scale; HUD.mouse.y = e.clientY / HUD.scale; if (MENU.active()) MENU.hover(HUD.mouse.x, HUD.mouse.y); }
    });
    document.addEventListener('mousedown', (e) => {
      AUDIO.init();
      if (MENU.active()) { MENU.click(e.clientX / HUD.scale, e.clientY / HUD.scale); return; }
      if (this.state === 'intro') { if (this.introT > 0.4) this.startPlay(); return; }
      if (this.state === 'victory') { if (this.victoryT > 2) this.toTitle(); return; }
      if (this.state === 'dead') { if (this.player.deadT > 1) this.respawn(); if (!this.locked) this.lock(); return; }
      if (this.state === 'play') {
        if (!this.locked) { this.lock(); return; }
        this.mouse[e.button] = true;
      }
    });
    document.addEventListener('mouseup', (e) => { this.mouse[e.button] = false; });
    document.addEventListener('contextmenu', (e) => e.preventDefault());
    document.addEventListener('wheel', (e) => { if (this.state === 'play' && this.locked) this.player.cycle(e.deltaY > 0 ? 1 : -1); }, { passive: true });
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === this.cv;
      if (!this.locked && this.state === 'play') this.pause();
    });
  },
  readInput() {
    const k = this.keys, s = this.settings;
    const sens = 0.0022 * s.sens;
    const inp = {
      fwd: (k.KeyW || k.ArrowUp ? 1 : 0) - (k.KeyS || k.ArrowDown ? 1 : 0),
      side: (k.KeyD || k.ArrowRight ? 1 : 0) - (k.KeyA || k.ArrowLeft ? 1 : 0),
      jump: !!k.Space, crouch: !!(k.KeyC || k.ShiftLeft || k.ShiftRight),
      fire: !!(this.mouse[0] || k.KeyF || k.ControlRight), alt: !!this.mouse[2],
      mx: this.mdx * sens, my: this.mdy * sens * (s.invert ? -1 : 1),
    };
    this.mdx = 0; this.mdy = 0;
    return inp;
  },
  // ------------------------------------------------------------------
  loop(now) {
    const dt = Math.min(0.05, Math.max(0.0005, (now - this.last) / 1000));
    this.last = now;
    this.fps = lerp(this.fps, 1 / dt, 0.05);
    this.time += dt;
    try {
      this.update(dt);
      this.render(dt);
    } catch (e) { console.error(e); }
    requestAnimationFrame((t) => this.loop(t));
  },
  update(dt) {
    HUD.update(dt);
    _alertSndT -= dt;
    if (this.state === 'title') { this.titleA += dt * 0.045; return; }
    if (this.state === 'intro') { this.introT += dt; return; }
    if (this.state === 'pause' || this.state === 'loading') return;
    if (this.state === 'victory') { this.victoryT += dt; FX.update(dt); if (Math.random() < dt * 3) FX.confetti(0, 22, 0, 6, 30); return; }
    this.gameUpdate(dt);
  },
  gameUpdate(dt) {
    const P = this.player, W = this.world;
    const inp = this.readInput();
    if (this.state === 'play') this.stats.time += dt;
    P.update(dt, inp);
    if (!P.alive && this.state === 'play') this.state = 'dead';
    this.navT -= dt;
    if (this.navT <= 0) { this.navT = 0.25; W.navFlow(P.pos[0], P.pos[1], P.pos[2]); }
    for (const e of this.enemies) e.update(dt);
    this.separate();
    this.updateDoors(dt);
    this.updateTriggers();
    this.updateItems(dt);
    this.updateBarrels(dt);
    this.updateEmitters(dt);
    FX.update(dt);
    this.checkGroups();
    this.shakeAmt = Math.max(0, this.shakeAmt - dt * 2.2);
    for (const d of P.dmgDirs) d.t -= dt;
    P.dmgDirs = P.dmgDirs.filter((d) => d.t > 0);
    this.flashR = Math.max(0, this.flashR - dt * 1.8); this.flashP = Math.max(0, this.flashP - dt * 2.5);
    // música dinâmica
    this.musT = (this.musT || 0) - dt;
    if (this.musT <= 0) {
      this.musT = 1;
      let n = 0;
      for (const e of this.enemies) if (e.alive && e.state !== 'idle' && V3.dist(e.pos, P.pos) < 40) n++;
      MUSIC.setIntensity(this.boss && this.boss.alive ? 1 : n ? Math.min(1, 0.45 + n * 0.12) : 0);
      if (Math.random() < 0.08) AUDIO.play('distant_rojao', [P.pos[0] + rand(-150, 150), 40, P.pos[2] + rand(-150, 150)], 0.8);
    }
    if (this.bossPending > 0) { this.bossPending -= dt; if (this.bossPending <= 0) this.spawnBoss(); }
    if (this.victoryPending > 0) { this.victoryPending -= dt; if (this.victoryPending <= 0) this.victory(); }
    this.updateScoreboard(false, dt);
  },
  separate() {
    const E = this.enemies;
    for (let i = 0; i < E.length; i++) {
      const a = E[i];
      if (!a.alive) continue;
      for (let j = i + 1; j < E.length; j++) {
        const b = E[j];
        if (!b.alive) continue;
        const dx = b.pos[0] - a.pos[0], dz = b.pos[2] - a.pos[2], rr = a.r + b.r;
        if (Math.abs(dx) > rr || Math.abs(dz) > rr || Math.abs(a.pos[1] - b.pos[1]) > 1.5) continue;
        const d = Math.hypot(dx, dz) || 0.01;
        if (d >= rr) continue;
        const push = (rr - d) * 6, nx = dx / d, nz = dz / d;
        const wa = b.scale / (a.scale + b.scale), wb = 1 - wa;
        a.vel[0] -= nx * push * wa; a.vel[2] -= nz * push * wa;
        b.vel[0] += nx * push * wb; b.vel[2] += nz * push * wb;
      }
    }
  },
  // ------------------------------------------------------------------
  updateDoors(dt) {
    const P = this.player;
    for (const d of this.doors) {
      d.msgT -= dt;
      if (d.state === 'open') continue;
      if (d.state === 'opening') {
        d.t = Math.min(1, d.t + dt / 0.9);
        d.dyn.y0 = d.box[1] + d.t * d.h;
        if (d.t >= 1) { d.state = 'open'; d.dyn.active = false; }
        continue;
      }
      const cx = (d.box[0] + d.box[3]) / 2, cz = (d.box[2] + d.box[5]) / 2;
      const dist = Math.hypot(P.pos[0] - cx, P.pos[2] - cz);
      if (P.alive && dist < 2.9 && P.pos[1] < d.box[4] && P.pos[1] + P.h > d.box[1]) {
        if (!d.key) this.openDoor(d);
        else if (d.key !== 'script' && P.keys[d.key]) { this.openDoor(d); HUD.msg('ABRIU COM A CHAVE ' + (d.key === 'green' ? 'VERDE' : 'BRANCA')); }
        else if (d.key !== 'script' && d.msgT <= 0) { HUD.bigMsg('PRECISA DA CHAVE ' + (d.key === 'green' ? 'VERDE' : 'BRANCA'), 2); AUDIO.play('locked'); d.msgT = 2; }
      }
      if (!d.key && d.state === 'closed') {
        for (const e of this.enemies) {
          if (!e.alive || e.state === 'idle') continue;
          if (Math.hypot(e.pos[0] - cx, e.pos[2] - cz) < 2.4 && e.pos[1] < d.box[4]) { this.openDoor(d); break; }
        }
      }
    }
  },
  openDoor(d) {
    if (d.state !== 'closed') return;
    d.state = 'opening';
    const b = d.box;
    AUDIO.play('door', [(b[0] + b[3]) / 2, b[1] + 1, (b[2] + b[5]) / 2]);
    this.world.setNavBlocked(b[0], b[2], b[3], b[5], false);
  },
  doorById(id) { return this.doors.find((d) => d.id === id); },
  updateTriggers() {
    const p = this.player.pos;
    if (!this.player.alive) return;
    for (const t of this.triggers) {
      if (t.fired) continue;
      const b = t.box;
      if (p[0] >= b[0] && p[0] <= b[3] && p[1] >= b[1] && p[1] <= b[4] && p[2] >= b[2] && p[2] <= b[5]) {
        t.fired = true;
        if (t.event === 'secret') {
          this.stats.secrets++;
          HUD.bigMsg('VOCÊ ACHOU UM SEGREDO!', 2.5);
          AUDIO.play('secret');
        } else if (LEVEL_EVENTS[t.event]) LEVEL_EVENTS[t.event](this);
      }
    }
  },
  updateItems(dt) {
    const P = this.player;
    if (!P.alive) return;
    for (const it of this.items) {
      if (it.taken) continue;
      const dx = P.pos[0] - it.x, dz = P.pos[2] - it.z;
      if (dx * dx + dz * dz < 1.2 && P.pos[1] < it.y + 1.1 && P.pos[1] + P.h > it.y - 0.2) {
        const d = ITEMS[it.type];
        if (!d || !d.fn(P, this)) continue;
        it.taken = true;
        HUD.msg(d.msg);
        AUDIO.play(d.snd || 'pickup_ammo');
        this.flashP = d.flash ? 0.5 : 0.22; this.flashCol = d.flash || [1, 0.85, 0.4];
        if (d.event && LEVEL_EVENTS[d.event]) LEVEL_EVENTS[d.event](this);
      }
    }
  },
  updateBarrels(dt) {
    for (const b of this.barrels) {
      if (!b.alive) continue;
      if (b.fuse >= 0) {
        b.fuse -= dt;
        if (Math.random() < 0.5) FX.sparks(b.x, b.y + 1, b.z, 1, [1, 0.6, 0.2], 3);
        if (b.fuse < 0) this.explodeBarrel(b);
      }
    }
  },
  damageBarrel(b, dmg) {
    if (!b.alive || b.fuse >= 0) return;
    b.hp -= dmg;
    if (b.hp <= 0) { b.fuse = rand(0.05, 0.25); AUDIO.play('fuse', [b.x, b.y + 0.5, b.z]); }
  },
  explodeBarrel(b) {
    b.alive = false; b.dyn.active = false;
    FX.explosion(b.x, b.y + 0.6, b.z, 4.2, 110, 'barrel', {});
  },
  updateEmitters(dt) {
    const c = this.cam ? this.cam.pos : this.player.pos;
    for (const e of this.emitters) {
      if (Math.abs(e.x - c[0]) > 70 || Math.abs(e.z - c[2]) > 70) continue;
      e.t -= dt;
      if (e.t > 0) continue;
      if (e.kind === 'fire') {
        e.t = e.small ? 0.07 : 0.04;
        const s = e.small ? 0.5 : 1;
        FX.part({ x: e.x + rand(-0.4, 0.4) * s, y: e.y + 0.2, z: e.z + rand(-0.4, 0.4) * s, vx: rand(-0.3, 0.3), vy: rand(1.5, 3) * s, vz: rand(-0.3, 0.3), life: rand(0.4, 0.8), size: rand(0.25, 0.45) * s, size1: 0.05, add: true, layer: T.fire, col: [1, rand(0.5, 0.8), 0.3], bright: 1.6, rot: rand(0, TAU) });
        if (Math.random() < 0.25) FX.smoke(e.x, e.y + 1.2 * s, e.z, 1, [0.18, 0.17, 0.17], 0.6 * s, 2.5, 1.5);
      } else if (e.kind === 'flare') {
        e.t = 0.09;
        FX.smoke(e.x, e.y + 0.3, e.z, 1, [0.75, 0.12, 0.1], 0.5, 2.6, 1.3);
        FX.part({ x: e.x, y: e.y + 0.32, z: e.z, vx: rand(-1.5, 1.5), vy: rand(1, 3), vz: rand(-1.5, 1.5), life: 0.3, size: 0.06, size1: 0.01, add: true, layer: T.spark, col: [1, 0.4, 0.3], bright: 2, grav: 8 });
      }
    }
  },
  checkGroups() {
    const alive = (tag) => (this.groups[tag] || []).filter((e) => e.alive).length;
    if (this.groups.waveA && !this.flags.waveA_low && alive('waveA') <= 2) { this.flags.waveA_low = true; LEVEL_EVENTS.waveA_low(this); }
    if (this.groups.waveB && !this.flags.waveB_clear && alive('waveA') + alive('waveB') === 0) { this.flags.waveB_clear = true; LEVEL_EVENTS.waveB_clear(this); }
  },
  // ------------------------------------------------------------------
  // API usada pelos eventos
  message(text, kind) { if (kind === 'big') HUD.bigMsg(text, 3.5); else HUD.msg(text); },
  checkpoint(name, pos, silent) {
    const P = this.player;
    this.cp = { name, pos: pos ? pos.slice() : P.pos.slice(), yaw: P.yaw, armor: P.armor, ammo: Object.assign({}, P.ammo) };
    if (!silent && name !== this.lastCheckpoint) { HUD.msg('CHECKPOINT: ' + name); AUDIO.play('checkpoint'); }
    this.lastCheckpoint = name;
  },
  respawn() {
    const P = this.player, c = this.cp;
    P.pos = c.pos.slice(); P.vel = [0, 0, 0]; P.yaw = c.yaw; P.pitch = 0;
    P.alive = true; P.deadT = 0; P.hp = 100; P.armor = Math.max(P.armor, c.armor);
    for (const k in c.ammo) P.ammo[k] = Math.max(P.ammo[k], c.ammo[k]);
    P.invuln = 2; P.flip = null; P.dmgDirs = [];
    if (!P.hasAmmo(P.cur)) P.cur = P.bestWeapon();
    this.state = 'play';
    this.flashR = 0;
    HUD.msg('DE VOLTA AO JOGO: ' + c.name);
    // inimigos muito próximos recuam para o estado ocioso
    for (const e of this.enemies) if (e.alive && !e.boss && V3.dist(e.pos, P.pos) < 7) { e.state = 'idle'; e.alerted = false; e.cd = 1.5; }
  },
  spawnGroup(list, tag) {
    const grp = [];
    const P = this.player;
    for (const [type, x, y, z, o] of list) {
      if (o && o.minDiff > this.diff.level) continue;
      const yaw = Math.atan2(-(P.pos[0] - x), -(P.pos[2] - z));
      const e = new Enemy(type, x, y, z, yaw, { spawnFx: true, group: tag });
      e.state = 'chase'; e.cd = rand(0.8, 1.6);
      FX.smoke(x, y + 0.6, z, 12, [0.8, 0.12, 0.1], 1.0, 1.6, 1.4);
      FX.light(x, y + 1, z, 7, [1, 0.2, 0.1], 2, 0.8);
      AUDIO.play('spawn', [x, y + 1, z]);
      this.enemies.push(e); grp.push(e);
      this.stats.total++;
    }
    if (tag) this.groups[tag] = grp;
    return grp;
  },
  wakeDormant() {
    for (const e of this.enemies) if (e.dormant && e.alive) { e.dormant = false; e.alert(); }
  },
  startBoss() {
    if (this.flags.boss) return;
    this.flags.boss = true;
    HUD.bigMsg('O TIGRÃO CHEGOU NA SERRINHA! PORTÃO DOS VISITANTES!', 4);
    AUDIO.play('boss_roar', null, 0.9);
    this.shake(0.5);
    this.bossPending = 2.5;
    MUSIC.setIntensity(1);
  },
  spawnBoss() {
    const d = this.doorById('visitors');
    if (d) this.openDoor(d);
    const b = new Enemy('tigrao', 58, 0, 0, Math.PI / 2, {});
    b.state = 'intro'; b.dormant = false;
    this.enemies.push(b); this.stats.total++;
    this.boss = b;
    AUDIO.play('boss_roar', b.eye());
    this.spawnGroup([['vileiro', 45, 0, -2], ['vileiro', 45, 0, 2], ['rojoeiro', 48, 0, 0, { minDiff: 1 }]], 'boss1');
  },
  bossSummon() {
    HUD.bigMsg('O TIGRÃO CHAMOU REFORÇO!', 2.5);
    this.spawnGroup([
      ['vileiro', -34, 0, -23], ['vileiro', 34, 0, 23], ['arremessador', -34, 0, 23], ['vileiro', 34, 0, -23],
      ['rojoeiro', 0, 0, 24, { minDiff: 2 }],
    ]);
  },
  bossDefeated(b) {
    HUD.bigMsg('O TIGRÃO FOI TORADO!!!', 4);
    this.victoryPending = 4.5;
    MUSIC.setIntensity(0);
    AUDIO.play('crowd_cheer', null, 1);
    // os vileiros restantes fogem (morrem de medo)
    for (const e of this.enemies) if (e.alive && !e.boss) { e.hp = 0; e.die([0, 0, 1], 'melee', 0); }
  },
  victory() {
    this.state = 'victory'; this.victoryT = 0;
    this.unlock();
    AUDIO.chant(0.35);
    AUDIO.play('crowd_cheer', null, 1);
    FX.confetti(0, 20, 0, 300, 30);
  },
  onEnemyKilled(e) {
    this.stats.kills++;
    this.updateScoreboard(true);
    if (this.stats.kills % 12 === 0) AUDIO.chant(0.08);
  },
  updateScoreboard(force, dt = 0) {
    this.scoreT -= dt;
    if (!force && this.scoreT > 0) return;
    this.scoreT = 5;
    const s = this.stats;
    const t = Math.floor(s.time / 60);
    const key = s.kills + '|' + s.deaths + '|' + t;
    if (key === this.lastScore) return;
    this.lastScore = key;
    R.updateLayer(T.scoreboard, drawScoreboard(s.kills, s.deaths, (t < 45 ? '1º TEMPO ' : '2º TEMPO ') + (t % 45) + "'"));
  },
  shake(a) { this.shakeAmt = Math.max(this.shakeAmt, a); },
  noise(pos, r) {
    for (const e of this.enemies) {
      if (!e.alive || e.state !== 'idle' || e.dormant) continue;
      if (V3.dist(e.pos, pos) < r) e.alert();
    }
  },
  lineOfSight(a, b) {
    const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2], d = Math.hypot(dx, dy, dz);
    if (d < 0.01) return true;
    return this.world.raycast(a[0], a[1], a[2], dx / d, dy / d, dz / d, d, F_SHOOT, true) === Infinity;
  },
  // ------------------------------------------------------------------
  // Dano
  damagePlayer(dmg, from, kind) {
    const P = this.player;
    if (!P.alive || (this.state !== 'play' && this.state !== 'dead')) return;
    if (P.invuln > 0 && kind !== 'fall') return;
    if (kind !== 'fall' && kind !== 'self') dmg *= this.diff.pdmg;
    const saved = Math.min(P.armor, dmg * 0.6);
    P.armor -= saved; P.hp -= dmg - saved;
    this.flashR = Math.min(0.75, this.flashR + dmg / 45);
    P.kick += 0.02;
    if (from) {
      const a = Math.atan2(from[0] - P.pos[0], from[2] - P.pos[2]);
      const rel = wrapAngle(-(a - Math.atan2(-Math.sin(P.yaw), -Math.cos(P.yaw))));
      P.dmgDirs.push({ a: rel, t: 1 });
    }
    if (P.painT <= 0 && P.hp > 0) { AUDIO.play('player_pain'); P.painT = 0.35; }
    if (P.hp <= 0) {
      P.hp = 0; P.alive = false; P.deadT = 0;
      this.stats.deaths++;
      AUDIO.play('player_death');
      this.updateScoreboard(true);
      this.state = 'dead';
    }
  },
  radiusDamage(x, y, z, r, dmg, owner, opts = {}) {
    if (opts.noDamage || dmg <= 0) return;
    const P = this.player;
    for (const e of this.enemies) {
      if (e.gibbed) continue;
      if (opts.noSelf && e === opts.src) continue;
      const c = e.alive ? e.center : [e.pos[0], e.pos[1] + 0.3, e.pos[2]];
      const d = Math.max(0, V3.dist(c, [x, y, z]) - e.r);
      if (d > r) continue;
      if (!this.lineOfSight([x, y, z], c) && d > 0.8) continue;
      let k = 1 - d / r;
      let dd = dmg * (0.25 + 0.75 * k);
      if (opts.directTarget === e) dd *= 0.5;
      if (owner === 'enemy' && !e.boss) dd *= 0.5;
      if (e.boss && owner === 'enemy') continue;
      const dir = V3.norm([c[0] - x, c[1] - y + 0.5, c[2] - z]);
      e.damage(dd, dir, 'explosion', c);
    }
    if (P.alive) {
      const c = [P.pos[0], P.pos[1] + P.h * 0.5, P.pos[2]];
      const d = V3.dist(c, [x, y, z]);
      if (d < r && this.lineOfSight([x, y, z], c)) {
        const k = 1 - d / r;
        let dd = dmg * (0.3 + 0.7 * k);
        let kind = 'expl';
        if (owner === 'player') { dd *= 0.35; kind = 'self'; }
        const dir = V3.norm([c[0] - x, c[1] - y, c[2] - z]);
        const imp = (owner === 'player' ? 14 : 7) * k;
        P.vel[0] += dir[0] * imp; P.vel[1] += Math.max(dir[1], 0.4) * imp * 1.1; P.vel[2] += dir[2] * imp;
        if (P.vel[1] > 0) P.onGround = false;
        this.damagePlayer(dd, [x, y, z], kind);
      }
    }
    for (const b of this.barrels) {
      if (!b.alive || b.fuse >= 0) continue;
      if (Math.hypot(b.x - x, b.y + 0.5 - y, b.z - z) < r) this.damageBarrel(b, 100);
    }
  },
  fireHitscan(eye, dirs, dmg, weapon) {
    const W = this.world, acc = new Map();
    for (const d of dirs) {
      let best = W.raycast(eye[0], eye[1], eye[2], d[0], d[1], d[2], 250, F_SHOOT);
      const wh = best !== Infinity ? { nx: W.hit.nx, ny: W.hit.ny, nz: W.hit.nz, box: W.hit.box } : null;
      let target = null, head = false, barrel = null;
      for (const e of this.enemies) {
        const hb = e.hitboxes();
        if (!hb) continue;
        const t = rayAABB(eye[0], eye[1], eye[2], d[0], d[1], d[2], hb.body, best);
        if (t < best) { best = t; target = e; head = false; barrel = null; }
        if (hb.head) { const th = rayAABB(eye[0], eye[1], eye[2], d[0], d[1], d[2], hb.head, best); if (th < best) { best = th; target = e; head = true; barrel = null; } }
      }
      for (const b of this.barrels) {
        if (!b.alive) continue;
        const t = rayAABB(eye[0], eye[1], eye[2], d[0], d[1], d[2], [b.x - 0.3, b.y, b.z - 0.3, b.x + 0.3, b.y + 0.95, b.z + 0.3], best);
        if (t < best) { best = t; barrel = b; target = null; }
      }
      const hp = [eye[0] + d[0] * best, eye[1] + d[1] * best, eye[2] + d[2] * best];
      if (target) {
        let dd = dmg * rand(0.85, 1.15);
        if (head && target.alive) dd *= (weapon === 'pistol' || weapon === 'rifle') ? 2 : 1.4;
        const a = acc.get(target) || { dmg: 0, dir: d, pos: hp };
        a.dmg += dd; acc.set(target, a);
        AUDIO.play('flesh', hp, 0.5);
      } else if (barrel) {
        this.damageBarrel(barrel, dmg);
        FX.sparks(hp[0], hp[1], hp[2], 3, [1, 0.7, 0.3], 4);
      } else if (wh && best !== Infinity) {
        FX.impact(hp[0], hp[1], hp[2], wh.nx, wh.ny, wh.nz, wh.box);
      }
    }
    for (const [e, a] of acc) e.damage(a.dmg, a.dir, weapon === 'ssg' ? 'ssg' : 'bullet', a.pos);
  },
  meleeHit(P) {
    const cam = this.cam, eye = cam.pos, f = cam.f;
    let hits = 0;
    for (const e of this.enemies) {
      if (e.gibbed) continue;
      const c = e.alive ? e.center : [e.pos[0], e.pos[1] + 0.3, e.pos[2]];
      const to = V3.sub(c, eye), d = V3.len(to);
      if (d > WEAPONS.mastro.range + e.r) continue;
      const dot = V3.dot(V3.scale(to, 1 / d), f);
      if (dot < 0.5 && d > 1.2) continue;
      if (!this.lineOfSight(eye, c)) continue;
      const dir = V3.norm([to[0], 0.2, to[2]]);
      e.damage(WEAPONS.mastro.dmg * rand(0.9, 1.15), dir, 'melee', V3.add(eye, V3.scale(f, Math.min(d, 1.5))));
      if (e.alive) { e.vel[0] += dir[0] * 5 / e.scale; e.vel[2] += dir[2] * 5 / e.scale; }
      hits++;
      if (hits >= 3) break;
    }
    for (const b of this.barrels) if (b.alive && Math.hypot(b.x - eye[0], b.z - eye[2]) < 2.2) this.damageBarrel(b, 25);
    if (hits) { AUDIO.play('hit_melee'); this.shake(0.15); }
    else {
      const t = this.world.raycast(eye[0], eye[1], eye[2], f[0], f[1], f[2], 2.3, F_SHOOT);
      if (t !== Infinity) { const h = this.world.hit; FX.impact(eye[0] + f[0] * t, eye[1] + f[1] * t, eye[2] + f[2] * t, h.nx, h.ny, h.nz, null); AUDIO.play('hit_melee', null, 0.4); }
    }
    this.noise(P.pos, 8);
  },
  firePlayerRocket(eye, f, cam) {
    const sp = V3.add(eye, V3.add(V3.scale(f, 0.6), V3.add(V3.scale(cam.r, 0.16), V3.scale(cam.u, -0.12))));
    const d = V3.sub(sp, eye), dl = V3.len(d);
    const t = this.world.raycast(eye[0], eye[1], eye[2], d[0] / dl, d[1] / dl, d[2] / dl, dl, F_SHOOT);
    if (t !== Infinity) { FX.explosion(eye[0] + d[0] / dl * (t - 0.1), eye[1] + d[1] / dl * (t - 0.1), eye[2] + d[2] / dl * (t - 0.1), 4.2, 100, 'player', { colorful: true }); return; }
    const spd = 30;
    FX.proj({ type: 'rojao', x: sp[0], y: sp[1], z: sp[2], vx: f[0] * spd, vy: f[1] * spd, vz: f[2] * spd, grav: 0, radius: 0.18, dmg: 60, splash: 100, splashR: 4.2, owner: 'player', spin: 25, life: 6 });
  },
  projActorHit(p, dx, dy, dz, len) {
    let best = null;
    const R_ = p.radius;
    if (p.owner === 'player') {
      for (const e of this.enemies) {
        if (!e.alive) continue;
        const hb = e.hitboxes();
        const b = hb.body;
        const t = rayAABB(p.x, p.y, p.z, dx, dy, dz, [b[0] - R_, b[1] - R_, b[2] - R_, b[3] + R_, b[4] + 0.4 * e.scale, b[5] + R_], len);
        if (t <= len && (!best || t < best.t)) best = { t, target: e };
      }
    } else {
      const P = this.player;
      if (P.alive) {
        const b = [P.pos[0] - P.r - R_, P.pos[1] - R_, P.pos[2] - P.r - R_, P.pos[0] + P.r + R_, P.pos[1] + P.h + R_, P.pos[2] + P.r + R_];
        const t = rayAABB(p.x, p.y, p.z, dx, dy, dz, b, len);
        if (t <= len) best = { t, target: 'player' };
      }
    }
    for (const b of this.barrels) {
      if (!b.alive) continue;
      const t = rayAABB(p.x, p.y, p.z, dx, dy, dz, [b.x - 0.3 - R_, b.y, b.z - 0.3 - R_, b.x + 0.3 + R_, b.y + 0.95, b.z + 0.3 + R_], len);
      if (t <= len && (!best || t < best.t)) best = { t, target: b };
    }
    return best;
  },
  projDamage(p, target, dir, pos) {
    if (target === 'player') this.damagePlayer(p.dmg, [p.x, p.y, p.z], 'proj');
    else if (target instanceof Enemy) target.damage(p.dmg, dir, p.splashR ? 'explosion' : 'proj', pos);
    else if (target && target.dyn) this.damageBarrel(target, p.dmg);
  },
  // ------------------------------------------------------------------
  render(dt) {
    if (this.state === 'loading') { HUD.draw(); return; }
    const aspect = R.W / R.H;
    let cam;
    if (this.state === 'title') {
      const a = this.titleA, rr = 42;
      const pos = [Math.sin(a) * rr, 13 + Math.sin(a * 0.7) * 3, Math.cos(a) * rr * 0.75];
      const f = V3.norm(V3.sub([0, 1, 0], pos));
      const r = V3.norm([-f[2], 0, f[0]]), u = V3.cross(r, f);
      cam = { pos, r, u, f, fov: 70 * DEG, aspect };
    } else {
      cam = this.player.camera(this.settings.fov, aspect);
    }
    this.cam = cam;
    AUDIO.listener.x = cam.pos[0]; AUDIO.listener.y = cam.pos[1]; AUDIO.listener.z = cam.pos[2];
    AUDIO.listener.yaw = this.state === 'title' ? Math.atan2(-cam.f[0], -cam.f[2]) : this.player.yaw;
    R.quality.dither = this.settings.dither ? 1 : 0;
    const dyn = this.dyn, add = this.add, vm = this.vm, vmAdd = this.vmAdd;
    dyn.reset(); add.reset(); vm.reset(); vmAdd.reset();
    const f = cam.f, cp = cam.pos;
    const visible = (x, y, z, rad = 2) => {
      const dx = x - cp[0], dy = y - cp[1], dz = z - cp[2];
      const d = dx * f[0] + dy * f[1] + dz * f[2];
      return d > -rad && dx * dx + dz * dz < 140 * 140;
    };
    const one = [1, 1, 1];
    // portas
    for (const d of this.doors) {
      if (d.state === 'open') continue;
      const b = d.box, y0 = b[1] + d.t * d.h;
      const M = M34.mul(M34.trans((b[0] + b[3]) / 2, (y0 + b[4]) / 2, (b[2] + b[5]) / 2), M34.scale(b[3] - b[0], b[4] - y0, b[5] - b[2]));
      emitBox(dyn, M, d.tex, d.light, one, 0, true, d.t);
    }
    // botijões
    for (const b of this.barrels) {
      if (!b.alive || !visible(b.x, b.y, b.z)) continue;
      const M = M34.mul(M34.trans(b.x, b.y + 0.475, b.z), M34.scale(0.6, 0.95, 0.6));
      emitCylinder(dyn, M, 10, T.botijao, T.botijao_top, b.light, one, b.fuse >= 0 ? 0.4 : 0);
      emitPart(dyn, M34.trans(b.x, b.y + 0.95, b.z), 0, 0.06, 0, 0.12, 0.12, 0.12, T.metal, b.light, one, 0);
    }
    // itens
    for (const it of this.items) {
      if (it.taken || !visible(it.x, it.y, it.z)) continue;
      const d = ITEMS[it.type];
      const t = this.time + it.ph;
      const sc = d.scale || 1;
      const M = M34.mul(M34.trans(it.x, it.y + 0.4 + Math.sin(t * 2.2) * 0.08, it.z), M34.mul(M34.rotY(t * 1.6), M34.scale(sc, sc, sc)));
      const l = it.light;
      emitItemModel(dyn, M, d.model, [l[0] * 1.3 + 0.12, l[1] * 1.3 + 0.12, l[2] * 1.3 + 0.12]);
      emitBillboard(add, cam, it.x, it.y + 0.4, it.z, 1.1, 1.1, 0, T.glow, [0.45, 0.45, 0.45], d.glow, 1);
    }
    // inimigos
    for (const e of this.enemies) {
      if (e.gibbed || !visible(e.pos[0], e.pos[1] + 1, e.pos[2], 3 * e.scale)) continue;
      e.draw(dyn, cam);
    }
    // emissores
    const lights = [];
    for (const e of this.emitters) {
      if (Math.abs(e.x - cp[0]) > 90 || Math.abs(e.z - cp[2]) > 90) continue;
      if (e.kind === 'flare') {
        emitPart(dyn, M34.trans(e.x, e.y, e.z), 0, 0.15, 0, 0.06, 0.3, 0.06, T.flare_stick, one, one, 0.5);
        emitBillboard(add, cam, e.x, e.y + 0.33, e.z, 0.7, 0.7, rand(0, TAU), T.flash, [1.8, 1.8, 1.8], [1, 0.3, 0.2], 1);
        lights.push({ x: e.x, y: e.y + 0.6, z: e.z, r: 9, cr: 1, cg: 0.15, cb: 0.1, i: 1.6 * rand(0.75, 1.1) });
      } else {
        lights.push({ x: e.x, y: e.y + 1, z: e.z, r: e.small ? 7 : 10, cr: 1, cg: 0.55, cb: 0.2, i: (e.small ? 1.2 : 1.8) * rand(0.8, 1.05) });
      }
    }
    // halos das lâmpadas (com oclusão)
    const W = this.world, L = this.level;
    for (const g of L.glows) {
      if (!visible(g.x, g.y, g.z)) continue;
      const dx = g.x - cp[0], dy = g.y - cp[1], dz = g.z - cp[2], d = Math.hypot(dx, dy, dz);
      if (d > 160) continue;
      g.vt = (g.vt || 0) - 1;
      if (g.vt <= 0) { g.vt = 3 + Math.floor(Math.random() * 3); g.vis = W.raycast(cp[0], cp[1], cp[2], dx / d, dy / d, dz / d, d - 0.6, F_SHADOW, true, true) === Infinity; }
      if (!g.vis) continue;
      const s = g.s * (1 + d * 0.012);
      emitBillboard(add, cam, g.x, g.y, g.z, s, s, 0, T.glow, [0.55, 0.55, 0.55], g.c, 1);
    }
    FX.draw(dyn, add, cam);
    FX.gatherLights(lights);
    // luzes: ordenar por relevância
    for (const l of lights) { const d = Math.hypot(l.x - cp[0], l.y - cp[1], l.z - cp[2]); l.score = d > l.r + 60 ? -1 : l.i * l.r / (d + 4); }
    const act = lights.filter((l) => l.score > 0).sort((a, b) => b.score - a.score);
    R.setLights(act);
    // arma
    if ((this.state === 'play' || this.state === 'pause' || this.state === 'dead') && this.player.alive) {
      const lt = W.sampleProbe(this.player.pos[0], this.player.pos[2], [0, 0, 0]);
      this.player.drawViewmodel(vm, vmAdd, cam, [lt[0] * 0.9 + 0.16, lt[1] * 0.9 + 0.16, lt[2] * 0.9 + 0.17]);
    }
    const env = { fog: W.env.fog, fogD: W.env.fogD, bright: 1.0, moon: W.env.moonDir, time: this.time };
    R.render({ cam, env, dyn, add, vm, vmAdd, vmFov: 62 * DEG });
    // flash de tela
    const fr = this.flashR, fp = this.flashP;
    if (fr > 0.01) { this.flashEl.style.background = `rgba(200,0,0,${Math.min(0.55, fr)})`; this.flashEl.style.opacity = 1; }
    else if (fp > 0.01) { const c = this.flashCol; this.flashEl.style.background = `rgba(${c[0] * 255 | 0},${c[1] * 255 | 0},${c[2] * 255 | 0},${fp * 0.35})`; this.flashEl.style.opacity = 1; }
    else this.flashEl.style.opacity = 0;
    HUD.draw();
  },
};

window.addEventListener('load', () => G.init());
