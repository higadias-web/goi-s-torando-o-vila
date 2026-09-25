'use strict';
// ---------------------------------------------------------------------------
// HUD e menus desenhados em canvas 2D de baixa resolução com fonte bitmap
// ---------------------------------------------------------------------------
const HUD = {
  cv: null, ctx: null, W: 640, H: 360, scale: 2,
  msgs: [], big: null, mouse: { x: -1, y: -1 },
  init(cv) { this.cv = cv; this.ctx = cv.getContext('2d'); },
  resize(winW, winH) {
    this.scale = Math.max(1, Math.floor(winH / 330));
    this.W = Math.ceil(winW / this.scale); this.H = Math.ceil(winH / this.scale);
    this.cv.width = this.W; this.cv.height = this.H;
    this.cv.style.width = this.W * this.scale + 'px'; this.cv.style.height = this.H * this.scale + 'px';
    this.ctx.imageSmoothingEnabled = false;
  },
  msg(text) { this.msgs.push({ text, t: 3.5 }); if (this.msgs.length > 5) this.msgs.shift(); },
  bigMsg(text, t = 3.5) { this.big = { text, t, max: t }; },
  update(dt) {
    for (const m of this.msgs) m.t -= dt;
    this.msgs = this.msgs.filter((m) => m.t > 0);
    if (this.big) { this.big.t -= dt; if (this.big.t <= 0) this.big = null; }
  },
  text(s, x, y, col = '#fff', sc = 1, al = 'left', sh = '#000') { FONT.draw(this.ctx, s, x, y, col, sc, al, sh); },
  // quebra de linha por largura
  wrap(s, maxW, sc = 1) {
    const words = s.split(' '), lines = [];
    let cur = '';
    for (const w of words) {
      const t = cur ? cur + ' ' + w : w;
      if (FONT.width(t, sc) > maxW && cur) { lines.push(cur); cur = w; } else cur = t;
    }
    if (cur) lines.push(cur);
    return lines;
  },
  // ------------------------------------------------------------------
  draw() {
    const c = this.ctx, W = this.W, H = this.H;
    c.clearRect(0, 0, W, H);
    const st = G.state;
    if (st === 'loading') { this.drawLoading(); return; }
    if (st === 'play' || st === 'pause' || st === 'dead') this.drawGame();
    if (st === 'title' || st === 'pause' || MENU.active()) MENU.draw(c, W, H);
    if (st === 'intro') this.drawIntro();
    if (st === 'dead') this.drawDead();
    if (st === 'victory') this.drawVictory();
    if (TOUCH.on && (st === 'play' || st === 'dead')) TOUCH.draw(c, W, H);
    if (TOUCH.on && H > W) {
      c.fillStyle = 'rgba(0,0,0,0.85)'; c.fillRect(0, 0, W, H);
      this.text('GIRE O CELULAR', W / 2, H / 2 - 10, '#7f7', 2, 'center');
      this.text('O JOGO É NA HORIZONTAL', W / 2, H / 2 + 14, '#aca', 1, 'center');
    }
    if (st === 'play' && !G.locked && !MENU.active()) {
      c.fillStyle = 'rgba(0,0,0,0.5)'; c.fillRect(0, H / 2 - 20, W, 40);
      this.text('CLIQUE PARA CONTINUAR', W / 2, H / 2 - 7, '#7f7', 2, 'center');
    }
  },
  drawLoading() {
    const c = this.ctx;
    c.fillStyle = '#000'; c.fillRect(0, 0, this.W, this.H);
    this.text('CARREGANDO A SERRINHA...', this.W / 2, this.H / 2 - 10, '#3c6', 2, 'center');
    this.text(G.loadMsg || '', this.W / 2, this.H / 2 + 20, '#aaa', 1, 'center');
  },
  drawGame() {
    const c = this.ctx, W = this.W, H = this.H, P = G.player;
    if (!P) return;
    // mira
    if (P.alive && G.state === 'play') {
      c.fillStyle = 'rgba(0,0,0,0.6)';
      c.fillRect(W / 2 - 1, H / 2 - 5, 3, 11); c.fillRect(W / 2 - 5, H / 2 - 1, 11, 3);
      c.fillStyle = '#e8ffe8';
      c.fillRect(W / 2, H / 2 - 4, 1, 3); c.fillRect(W / 2, H / 2 + 2, 1, 3);
      c.fillRect(W / 2 - 4, H / 2, 3, 1); c.fillRect(W / 2 + 2, H / 2, 3, 1);
    }
    // indicadores de dano
    for (const d of P.dmgDirs) {
      const a = d.a - Math.PI / 2;
      c.fillStyle = `rgba(255,30,20,${Math.min(1, d.t) * 0.8})`;
      for (let k = -3; k <= 3; k++) {
        const aa = a + k * 0.06;
        c.fillRect(Math.round(W / 2 + Math.cos(aa) * 34) - 1, Math.round(H / 2 + Math.sin(aa) * 34) - 1, 3, 3);
      }
    }
    const y0 = H - 34;
    // vida
    const hpCol = P.hp > 100 ? '#8fdcff' : P.hp > 25 ? '#e8ffe8' : (Math.floor(G.time * 4) % 2 ? '#ff4040' : '#aa2020');
    this.iconCross(10, y0 + 2);
    this.text(String(Math.max(0, Math.ceil(P.hp))), 34, y0 - 1, hpCol, 3, 'left', '#031');
    // colete
    this.iconShirt(10, y0 - 26);
    this.text(String(Math.ceil(P.armor)), 34, y0 - 26, P.armor > 0 ? '#9fe' : '#577', 2, 'left', '#031');
    // munição
    const w = WEAPONS[P.cur];
    if (w.ammo) {
      const n = P.ammo[w.ammo];
      this.text(String(n), W - 32, y0 - 1, n > 0 ? '#ffe9a0' : '#f55', 3, 'right', '#310');
      this.iconAmmo(W - 26, y0 + 2, w.ammo);
    } else this.text('--', W - 32, y0 - 1, '#ffe9a0', 3, 'right', '#310');
    if (!TOUCH.on) this.text(w.name + (P.cur === 'pistol' && P.dual ? ' x2' : ''), W - 10, y0 - 14, '#9c9', 1, 'right');
    // slots
    let sx = W - 10 - 6 * 12;
    if (!TOUCH.on) {
      for (const k of WEAPON_ORDER) {
        const d = WEAPONS[k];
        const owned = P.weapons[k];
        const col = k === P.cur ? '#6f6' : owned ? '#ddd' : '#333';
        if (k === P.cur) { c.fillStyle = 'rgba(40,160,70,0.5)'; c.fillRect(sx - 2, y0 - 27, 10, 12); }
        this.text(String(d.slot), sx, y0 - 26, col, 1);
        sx += 12;
      }
      // munição reserva pequena
      const ay = y0 - 42;
      const am = [['BALAS', 'bullets'], ['CART', 'shells'], ['ROJ', 'rockets']];
      am.forEach(([lab, k], i) => {
        this.text(lab + ' ' + P.ammo[k] + '/' + AMMO_MAX[k], W - 10, ay - i * 10, w.ammo === k ? '#fe8' : '#8a8', 1, 'right');
      });
    }
    // chaves
    let kx = 80;
    if (P.keys.green) { this.iconKey(kx, y0 + 4, '#3e6'); kx += 16; }
    if (P.keys.white) { this.iconKey(kx, y0 + 4, '#fff'); kx += 16; }
    // mensagens
    let my = 6;
    for (const m of this.msgs) {
      const a = Math.min(1, m.t);
      this.text(m.text, 6, my, `rgba(230,255,230,${a})`, 1, 'left', `rgba(0,0,0,${a})`);
      my += 11;
    }
    if (this.big) {
      const a = Math.min(1, this.big.t, (this.big.max - this.big.t) * 4 + 0.2);
      const lines = this.wrap(this.big.text, W - 40, 2);
      lines.forEach((l, i) => this.text(l, W / 2, H * 0.28 + i * 22, `rgba(120,255,140,${a})`, 2, 'center', `rgba(0,30,10,${a})`));
    }
    // chefe
    if (G.boss && G.boss.alive) {
      const bw = Math.min(260, W - 80), bx = (W - bw) / 2, by = 22;
      c.fillStyle = '#000'; c.fillRect(bx - 2, by - 2, bw + 4, 10);
      c.fillStyle = '#511'; c.fillRect(bx, by, bw, 6);
      c.fillStyle = '#e63'; c.fillRect(bx, by, Math.round(bw * Math.max(0, G.boss.hp / G.boss.maxHp)), 6);
      this.text('TIGRÃO', W / 2, by - 13, '#fb6', 1, 'center');
    }
    if (G.settings.showFps) this.text(Math.round(G.fps) + ' FPS', W - 6, 6, '#8f8', 1, 'right');
  },
  iconCross(x, y) {
    const c = this.ctx;
    c.fillStyle = '#031'; c.fillRect(x + 5, y - 1, 10, 24); c.fillRect(x - 1, y + 5, 22, 12);
    c.fillStyle = '#2d6'; c.fillRect(x + 6, y, 8, 22); c.fillRect(x, y + 6, 20, 10);
    c.fillStyle = '#9fb'; c.fillRect(x + 7, y + 1, 2, 6);
  },
  iconShirt(x, y) {
    const c = this.ctx;
    c.fillStyle = '#031'; c.fillRect(x - 1, y - 1, 22, 16);
    c.fillStyle = '#1a6'; c.fillRect(x, y, 20, 5); c.fillRect(x + 4, y, 12, 14);
    c.fillStyle = '#fff'; c.fillRect(x + 4, y + 6, 12, 2); c.fillRect(x + 8, y, 4, 2);
  },
  iconAmmo(x, y, k) {
    const c = this.ctx;
    if (k === 'bullets') { c.fillStyle = '#310'; c.fillRect(x - 1, y - 1, 16, 22); for (let i = 0; i < 3; i++) { c.fillStyle = '#db4'; c.fillRect(x + i * 5, y + 5, 4, 15); c.fillStyle = '#b73'; c.fillRect(x + i * 5, y + 2, 4, 4); } }
    else if (k === 'shells') { c.fillStyle = '#310'; c.fillRect(x - 1, y - 1, 16, 22); for (let i = 0; i < 2; i++) { c.fillStyle = '#d33'; c.fillRect(x + i * 7, y + 2, 6, 14); c.fillStyle = '#db4'; c.fillRect(x + i * 7, y + 16, 6, 4); } }
    else { c.fillStyle = '#310'; c.fillRect(x - 1, y - 1, 16, 22); c.fillStyle = '#e33'; c.fillRect(x + 4, y + 5, 6, 15); c.fillStyle = '#fd4'; c.fillRect(x + 5, y + 1, 4, 4); c.fillStyle = '#3c5'; c.fillRect(x + 4, y + 11, 6, 2); }
  },
  iconKey(x, y, col) {
    const c = this.ctx;
    c.fillStyle = '#000'; c.fillRect(x - 1, y - 1, 14, 20);
    c.fillStyle = col; c.fillRect(x + 2, y, 8, 7); c.fillRect(x + 5, y + 6, 2, 11); c.fillRect(x + 7, y + 12, 3, 2); c.fillRect(x + 7, y + 15, 3, 2);
    c.fillStyle = '#000'; c.fillRect(x + 4, y + 2, 4, 3);
  },
  drawIntro() {
    const c = this.ctx, W = this.W, H = this.H;
    c.fillStyle = 'rgba(0,0,0,0.78)'; c.fillRect(0, 0, W, H);
    const lines = INTRO_TEXT;
    const t = G.introT;
    let chars = Math.floor(t * 45);
    let y = H * 0.18;
    this.text('SERRINHA, GOIÂNIA — 23:47', W / 2, y - 26, '#6f8', 2, 'center');
    for (const l of lines) {
      const wl = this.wrap(l, W - 60, 1);
      for (const ln of wl) {
        if (chars <= 0) break;
        const s = ln.slice(0, chars); chars -= ln.length;
        this.text(s, 30, y, '#dfd', 1);
        y += 12;
      }
      y += 6;
    }
    if (Math.floor(G.time * 2) % 2) this.text('CLIQUE PARA ENTRAR EM CAMPO', W / 2, H - 30, '#ff8', 2, 'center');
  },
  drawDead() {
    const c = this.ctx, W = this.W, H = this.H;
    const a = Math.min(0.6, G.player.deadT * 0.6);
    c.fillStyle = `rgba(90,0,0,${a})`; c.fillRect(0, 0, W, H);
    if (G.player.deadT > 0.8) {
      this.text('VOCÊ FOI TORADO!', W / 2, H * 0.35, '#f44', 4, 'center', '#300');
      this.text('CLIQUE PARA VOLTAR AO ÚLTIMO CHECKPOINT', W / 2, H * 0.35 + 50, '#fcc', 1, 'center');
      this.text('(' + (G.lastCheckpoint || 'INÍCIO') + ')', W / 2, H * 0.35 + 64, '#c99', 1, 'center');
    }
  },
  drawVictory() {
    const c = this.ctx, W = this.W, H = this.H;
    c.fillStyle = 'rgba(0,20,8,0.72)'; c.fillRect(0, 0, W, H);
    const s = G.stats;
    this.text('A SERRINHA É DO VERDÃO!', W / 2, H * 0.14, '#6f8', 3, 'center', '#021');
    this.text('OS VILEIROS FORAM EXPULSOS DA CASA DO GOIÁS', W / 2, H * 0.14 + 36, '#dfd', 1, 'center');
    const rows = [
      ['DIFICULDADE', DIFFS[G.diffIndex].name],
      ['TEMPO', fmtTime(s.time)],
      ['ABATES', s.kills + ' / ' + s.total],
      ['SEGREDOS', s.secrets + ' / 3'],
      ['VEZES TORADO', String(s.deaths)],
    ];
    if (s.goals) rows.push(['GOLS', String(s.goals)]);
    rows.forEach(([k, v], i) => {
      const y = H * 0.36 + i * 20;
      this.text(k, W / 2 - 10, y, '#9c9', 2, 'right');
      this.text(v, W / 2 + 10, y, '#fff', 2, 'left');
    });
    if (G.victoryT > 2 && Math.floor(G.time * 2) % 2) this.text('CLIQUE PARA VOLTAR AO MENU', W / 2, H - 28, '#ff8', 1, 'center');
  },
};
const INTRO_TEXT = [
  'NOITE DE CLÁSSICO. O JOGO NEM COMEÇOU E UM ÔNIBUS VERMELHO JÁ ESTACIONOU NA PORTA DA SERRINHA.',
  'OS VILEIROS PULARAM O MURO, PICHARAM A FACHADA, APAGARAM UM REFLETOR E PENDURARAM FAIXA DO TIGRE NA ARQUIBANCADA DA FORÇA JOVEM.',
  'VOCÊ É O ÚLTIMO DA BATERIA QUE FICOU PRA GUARDAR O ESTÁDIO. PEGA O MASTRO, PEGA O QUE ACHAR PELO CAMINHO E DEVOLVE A CASA PRO VERDÃO.',
  'DIZEM QUE O CHEFE DELES, O TAL DO TIGRÃO, ESTÁ ESPERANDO NO PORTÃO DOS VISITANTES...',
];
function fmtTime(t) { const m = Math.floor(t / 60), s = Math.floor(t % 60); return m + ':' + String(s).padStart(2, '0'); }

// ---------------------------------------------------------------------------
// Menus
// ---------------------------------------------------------------------------
const DIFFS = [
  { name: 'TORCEDOR DE SOFÁ', desc: 'PRA QUEM SÓ VÊ PELA TV', pdmg: 0.5, ehp: 0.8, erate: 0.7, espd: 0.9, pspd: 0.8, lead: 0, level: 0 },
  { name: 'SÓCIO-TORCEDOR', desc: 'EQUILIBRADO', pdmg: 0.8, ehp: 1.0, erate: 0.9, espd: 1.0, pspd: 0.95, lead: 0.3, level: 1 },
  { name: 'ARQUIBANCADA RAIZ', desc: 'COMO O DUSK MANDA', pdmg: 1.0, ehp: 1.0, erate: 1.0, espd: 1.05, pspd: 1.05, lead: 0.6, level: 2 },
  { name: 'FORÇA JOVEM', desc: 'SÓ PRA QUEM É DE FÉ', pdmg: 1.4, ehp: 1.15, erate: 1.3, espd: 1.15, pspd: 1.2, lead: 0.9, level: 3 },
];
const MENU = {
  stack: [], sel: 0, rects: [],
  active() { return this.stack.length > 0; },
  open(name) { this.stack.push(name); this.sel = 0; },
  back() { this.stack.pop(); this.sel = 0; if (!this.stack.length && G.state === 'pause') G.resume(); },
  close() { this.stack.length = 0; },
  cur() { return this.stack[this.stack.length - 1]; },
  items() {
    const S = G.settings;
    switch (this.cur()) {
      case 'main': return [
        { label: 'NOVO JOGO', act: () => this.open('diff') },
        { label: 'OPÇÕES', act: () => this.open('options') },
        { label: 'CONTROLES', act: () => this.open('controls') },
      ];
      case 'diff': return DIFFS.map((d, i) => ({ label: d.name, desc: d.desc, act: () => { this.close(); G.newGame(i); } })).concat([{ label: 'VOLTAR', act: () => this.back() }]);
      case 'pause': return [
        { label: 'CONTINUAR', act: () => { this.close(); G.resume(); } },
        { label: 'OPÇÕES', act: () => this.open('options') },
        { label: 'CONTROLES', act: () => this.open('controls') },
        { label: 'VOLTAR AO CHECKPOINT', act: () => { this.close(); G.resume(); G.respawn(); } },
        { label: 'REINICIAR FASE', act: () => { this.close(); G.newGame(G.diffIndex); } },
        { label: 'MENU PRINCIPAL', act: () => { this.close(); G.toTitle(); } },
      ];
      case 'options': return [
        { label: 'SENSIBILIDADE', val: () => S.sens.toFixed(1), adj: (d) => { S.sens = clamp(Math.round((S.sens + d * 0.1) * 10) / 10, 0.2, 6); } },
        { label: 'CAMPO DE VISÃO', val: () => S.fov + 'º', adj: (d) => { S.fov = clamp(S.fov + d * 2, 56, 110); } },
        { label: 'PIXELIZAÇÃO', val: () => S.pix === 0 ? 'AUTO' : S.pix + 'X', adj: (d) => { S.pix = clamp(S.pix + d, 0, 6); G.resize(); } },
        { label: 'DITHERING', val: () => S.dither ? 'SIM' : 'NÃO', adj: () => { S.dither = !S.dither; } },
        { label: 'BRILHO', val: () => Math.round(S.bright * 100) + '%', adj: (d) => { S.bright = clamp(Math.round((S.bright + d * 0.1) * 10) / 10, 0.6, 2); } },
        { label: 'TELA CHEIA', val: () => document.fullscreenElement ? 'SIM' : 'NÃO', adj: () => { try { if (document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen(); } catch (e) { /* sem suporte */ } } },
        { label: 'VOLUME', val: () => Math.round(S.vol * 100) + '%', adj: (d) => { S.vol = clamp(Math.round((S.vol + d * 0.1) * 10) / 10, 0, 1); AUDIO.setVolume(S.vol); } },
        { label: 'MÚSICA', val: () => Math.round(S.music * 100) + '%', adj: (d) => { S.music = clamp(Math.round((S.music + d * 0.1) * 10) / 10, 0, 1); AUDIO.setMusicVolume(S.music); } },
        { label: 'PULO AUTOMÁTICO', val: () => S.autohop ? 'SIM' : 'NÃO', adj: () => { S.autohop = !S.autohop; } },
        { label: 'CAMBALHOTAS', val: () => S.flips ? 'SIM' : 'NÃO', adj: () => { S.flips = !S.flips; } },
        { label: 'INVERTER MOUSE', val: () => S.invert ? 'SIM' : 'NÃO', adj: () => { S.invert = !S.invert; } },
        { label: 'MOSTRAR FPS', val: () => S.showFps ? 'SIM' : 'NÃO', adj: () => { S.showFps = !S.showFps; } },
        { label: 'VOLTAR', act: () => { G.saveSettings(); this.back(); } },
      ];
      case 'controls': return [{ label: 'VOLTAR', act: () => this.back() }];
    }
    return [];
  },
  key(code) {
    const it = this.items();
    if (!it.length) return;
    if (code === 'ArrowUp' || code === 'KeyW') { this.sel = (this.sel - 1 + it.length) % it.length; AUDIO.play('switch', null, 0.4); }
    else if (code === 'ArrowDown' || code === 'KeyS') { this.sel = (this.sel + 1) % it.length; AUDIO.play('switch', null, 0.4); }
    else if (code === 'ArrowLeft' || code === 'KeyA') { const i = it[this.sel]; if (i && i.adj) { i.adj(-1); AUDIO.play('switch', null, 0.4); } }
    else if (code === 'ArrowRight' || code === 'KeyD') { const i = it[this.sel]; if (i && i.adj) { i.adj(1); AUDIO.play('switch', null, 0.4); } }
    else if (code === 'Enter' || code === 'Space') { const i = it[this.sel]; if (i) { AUDIO.play('pickup_ammo', null, 0.5); if (i.act) i.act(); else if (i.adj) i.adj(1); } }
    else if (code === 'Escape' || code === 'Backspace') { if (this.cur() !== 'main') this.back(); }
  },
  hover(x, y) {
    for (let i = 0; i < this.rects.length; i++) { const r = this.rects[i]; if (x >= r[0] && x <= r[2] && y >= r[1] && y <= r[3]) { if (this.sel !== i) this.sel = i; return; } }
  },
  click(x, y) {
    const it = this.items();
    for (let i = 0; i < this.rects.length; i++) {
      const r = this.rects[i];
      if (x >= r[0] && x <= r[2] && y >= r[1] && y <= r[3]) {
        const item = it[i];
        if (!item) return true;
        AUDIO.play('pickup_ammo', null, 0.5);
        if (item.act) item.act();
        else if (item.adj) item.adj(x < (r[0] + r[2]) / 2 ? -1 : 1);
        return true;
      }
    }
    return false;
  },
  draw(c, W, H) {
    const name = this.cur();
    const T2 = (s, x, y, col, sc, al, sh) => HUD.text(s, x, y, col, sc, al, sh);
    if (!name) return;
    if (name === 'main') {
      c.fillStyle = 'rgba(0,0,0,0.35)'; c.fillRect(0, 0, W, H);
      const ts = W > 520 ? 4 : 3;
      T2('GOIÁS TORANDO', W / 2, H * 0.1, '#3d6', ts, 'center', '#021');
      T2('O VILA', W / 2, H * 0.1 + 12 * ts, '#fff', ts + 1, 'center', '#021');
      T2('INVASÃO NA SERRINHA', W / 2, H * 0.1 + 12 * ts + 14 * (ts + 1), '#e44', 1, 'center', '#200');
    } else {
      c.fillStyle = 'rgba(0,8,4,0.8)'; c.fillRect(0, 0, W, H);
      const titles = { diff: 'ESCOLHA A DIFICULDADE', options: 'OPÇÕES', controls: 'CONTROLES', pause: 'PAUSADO' };
      T2(titles[name] || '', W / 2, H * 0.1, '#3d6', 3, 'center', '#021');
    }
    const it = this.items();
    this.rects = [];
    let y = name === 'main' ? H * 0.55 : name === 'controls' ? H - 40 : H * 0.26;
    const lh = name === 'options' ? 16 : 22, sc = name === 'options' ? 1 : 2;
    it.forEach((item, i) => {
      const sel = i === this.sel;
      let label = item.label;
      if (item.val) {
        const v = item.val();
        T2(label, W / 2 - 8, y, sel ? '#ff8' : '#cdc', sc, 'right');
        T2('< ' + v + ' >', W / 2 + 8, y, sel ? '#ff8' : '#fff', sc, 'left');
        this.rects.push([W / 2 - 160, y - 3, W / 2 + 160, y + 10 * sc + 2]);
      } else {
        T2((sel ? '> ' : '') + label + (sel ? ' <' : ''), W / 2, y, sel ? '#ff8' : '#dfd', sc, 'center');
        const w = FONT.width(label, sc) / 2 + 20;
        this.rects.push([W / 2 - w, y - 3, W / 2 + w, y + 10 * sc + 2]);
        if (item.desc && sel) T2(item.desc, W / 2, y + 10 * sc + 1, '#8a8', 1, 'center');
      }
      y += lh + (item.desc ? 4 : 0);
    });
    if (name === 'controls') {
      const L = [
        ['WASD / SETAS', 'ANDAR'], ['MOUSE', 'MIRAR'], ['BOTÃO ESQUERDO', 'ATIRAR / BATER'], ['ESPAÇO', 'PULAR (SEGURE PRA BUNNY HOP)'],
        ['C / SHIFT', 'AGACHAR · CORRENDO = DESLIZAR'], ['C NO AR', 'CAMBALHOTA (ESTILO DUSK)'], ['1 A 6 / RODA', 'TROCAR ARMA'], ['Q', 'ARMA ANTERIOR'], ['ESC / P', 'PAUSAR'],
      ];
      L.forEach(([k, v], i) => { T2(k, W / 2 - 8, H * 0.24 + i * 14, '#ff8', 1, 'right'); T2(v, W / 2 + 8, H * 0.24 + i * 14, '#dfd', 1, 'left'); });
      T2('DICA: O ROJÃO EMPURRA VOCÊ — DÁ PRA FAZER ROCKET JUMP.', W / 2, H * 0.24 + L.length * 14 + 10, '#8a8', 1, 'center');
    }
    if (name === 'pause') {
      const s = G.stats;
      T2('ABATES ' + s.kills + '/' + s.total + '   SEGREDOS ' + s.secrets + '/3   TEMPO ' + fmtTime(s.time), W / 2, H - 40, '#9c9', 1, 'center');
    }
    if (name === 'main') {
      const lines = HUD.wrap('JOGO DE PARÓDIA E OBRA DE FICÇÃO, SEM LIGAÇÃO OFICIAL COM CLUBES OU TORCIDAS. RIVALIDADE É NO CAMPO: NA VIDA REAL, VIOLÊNCIA NÃO É TORCIDA.', W - 40, 1);
      lines.forEach((l, i) => T2(l, W / 2, H - 14 - (lines.length - i) * 10, '#8a8', 1, 'center'));
      T2('INSPIRADO EM DUSK, DOOM E QUAKE', W / 2, H - 12, '#575', 1, 'center');
    }
  },
};

// ---------------------------------------------------------------------------
// Controles de toque (celular/tablet): analógico à esquerda, olhar arrastando
// à direita e botões de ação.
// ---------------------------------------------------------------------------
const TOUCH = {
  on: false, move: null, look: null, pressed: {}, lookDX: 0, lookDY: 0,
  buttons(W, H) {
    return [
      { id: 'fire', x: W - 58, y: H - 92, r: 32, label: 'TIRO' },
      { id: 'jump', x: W - 122, y: H - 50, r: 24, label: 'PULO' },
      { id: 'crouch', x: W - 128, y: H - 118, r: 20, label: 'AGACHA' },
      { id: 'next', x: W - 52, y: H - 168, r: 20, label: 'ARMA' },
      { id: 'pause', x: W - 22, y: 24, r: 14, label: 'II' },
    ];
  },
  bind(g) {
    const pos = (t) => [t.clientX / HUD.scale, t.clientY / HUD.scale];
    const start = (e) => {
      AUDIO.init();
      if (!this.on) { this.on = true; g.locked = true; }
      e.preventDefault();
      for (const t of e.changedTouches) {
        const [x, y] = pos(t);
        if (MENU.active()) { MENU.hover(x, y); MENU.click(x, y); continue; }
        if (g.state === 'intro') { if (g.introT > 0.4) g.startPlay(); continue; }
        if (g.state === 'victory') { if (g.victoryT > 2) g.toTitle(); continue; }
        if (g.state === 'dead') { if (g.player.deadT > 1) g.respawn(); continue; }
        if (g.state !== 'play') continue;
        const b = this.buttons(HUD.W, HUD.H).find((b) => Math.hypot(x - b.x, y - b.y) < b.r + 8);
        if (b) {
          this.pressed[b.id] = t.identifier;
          if (b.id === 'next') g.player.cycle(1);
          if (b.id === 'pause') g.pause();
        } else if (x < HUD.W * 0.42 && !this.move) this.move = { id: t.identifier, ox: x, oy: y, x, y };
        else if (!this.look) this.look = { id: t.identifier, x: t.clientX, y: t.clientY };
      }
    };
    const move = (e) => {
      e.preventDefault();
      for (const t of e.changedTouches) {
        if (this.move && t.identifier === this.move.id) { const [x, y] = pos(t); this.move.x = x; this.move.y = y; }
        if (this.look && t.identifier === this.look.id) { this.lookDX += t.clientX - this.look.x; this.lookDY += t.clientY - this.look.y; this.look.x = t.clientX; this.look.y = t.clientY; }
      }
    };
    const end = (e) => {
      for (const t of e.changedTouches) {
        if (this.move && t.identifier === this.move.id) this.move = null;
        if (this.look && t.identifier === this.look.id) this.look = null;
        for (const k in this.pressed) if (this.pressed[k] === t.identifier) delete this.pressed[k];
      }
    };
    document.addEventListener('touchstart', start, { passive: false });
    document.addEventListener('touchmove', move, { passive: false });
    document.addEventListener('touchend', end);
    document.addEventListener('touchcancel', end);
  },
  apply(inp, s) {
    if (this.move) {
      const dx = this.move.x - this.move.ox, dy = this.move.y - this.move.oy;
      inp.side = clamp(dx / 28, -1, 1); inp.fwd = clamp(-dy / 28, -1, 1);
      if (Math.abs(inp.side) < 0.15) inp.side = 0;
      if (Math.abs(inp.fwd) < 0.15) inp.fwd = 0;
    }
    const k = 0.0045 * s.sens;
    inp.mx += this.lookDX * k; inp.my += this.lookDY * k * (s.invert ? -1 : 1);
    this.lookDX = 0; this.lookDY = 0;
    if (this.pressed.fire !== undefined) inp.fire = true;
    if (this.pressed.jump !== undefined) inp.jump = true;
    if (this.pressed.crouch !== undefined) inp.crouch = true;
  },
  draw(c, W, H) {
    for (const b of this.buttons(W, H)) {
      const on = this.pressed[b.id] !== undefined;
      c.fillStyle = on ? 'rgba(80,220,120,0.45)' : 'rgba(0,0,0,0.3)';
      c.strokeStyle = 'rgba(160,255,180,0.55)';
      c.beginPath(); c.arc(b.x, b.y, b.r, 0, TAU); c.fill(); c.stroke();
      HUD.text(b.label, b.x, b.y - 4, 'rgba(220,255,225,0.9)', 1, 'center');
    }
    if (this.move) {
      c.strokeStyle = 'rgba(160,255,180,0.5)';
      c.beginPath(); c.arc(this.move.ox, this.move.oy, 30, 0, TAU); c.stroke();
      c.fillStyle = 'rgba(160,255,180,0.35)';
      const dx = clamp(this.move.x - this.move.ox, -30, 30), dy = clamp(this.move.y - this.move.oy, -30, 30);
      c.beginPath(); c.arc(this.move.ox + dx, this.move.oy + dy, 12, 0, TAU); c.fill();
    } else {
      HUD.text('ARRASTE AQUI PARA ANDAR', W * 0.2, H - 70, 'rgba(200,255,210,0.35)', 1, 'center');
    }
  },
};
