'use strict';
// ---------------------------------------------------------------------------
// Construtor de fase + mapa "Serrinha" (Estádio Hailé Pinheiro, Goiânia)
// Eixos: X leste, Y cima, Z sul. Unidade = metro.
// ---------------------------------------------------------------------------
class LevelBuilder {
  constructor(world) {
    this.w = world;
    this.ents = []; this.doors = []; this.triggers = []; this.emitters = []; this.glows = []; this.barrels = [];
  }
  texSpec(spec) {
    if (spec === null || spec === undefined) return null;
    const arr = resolveTex(spec, {});
    return arr.map((l) => (l === undefined ? -1 : l));
  }
  box(x0, y0, z0, x1, y1, z1, o = {}) {
    const b = {
      x0: Math.min(x0, x1), y0: Math.min(y0, y1), z0: Math.min(z0, z1),
      x1: Math.max(x0, x1), y1: Math.max(y0, y1), z1: Math.max(z0, z1),
    };
    b.tex = o.tex === undefined ? this.texSpec('concrete') : this.texSpec(o.tex);
    if (b.tex && b.y0 <= 0.001 && !o.keepBottom) b.tex[3] = -1;
    const alpha = b.tex ? b.tex.some((l) => l >= 0 && TEXDEFS[l].alpha) : false;
    const solid = o.solid !== undefined ? o.solid : true;
    const shoot = o.shoot !== undefined ? o.shoot : (solid && !alpha);
    const shadow = o.shadow !== undefined ? o.shadow : (b.tex !== null && !alpha && (solid || o.fake));
    const occl = o.occl !== undefined ? o.occl : (b.tex !== null && !alpha && solid && !o.emis);
    b.flags = (solid ? F_SOLID : 0) | (shoot ? F_SHOOT : 0) | (shadow ? F_SHADOW : 0) | (occl ? F_OCCL : 0);
    b.tint = o.tint || [1, 1, 1];
    if (o.tintF) { b.tintF = []; for (const k in o.tintF) b.tintF[k] = o.tintF[k]; }
    b.su = o.su || o.s || 2; b.sv = o.sv || o.s || 2;
    b.uo = o.uo || 0; b.vo = o.vo || 0;
    b.faceUV = o.faceUV; b.ru = o.ru; b.rv = o.rv;
    b.emis = o.emis || 0;
    b.clip = o.clip; b.noCull = o.noCull; b.sub = o.sub;
    b.mat = o.mat || 'concrete';
    return this.w.addBox(b);
  }
  // parede ao longo de X, centrada em z; gaps: [[a,b,top,bottom?]]
  wallX(z, x0, x1, y0, y1, o = {}) {
    const t = o.t || 0.4, gaps = (o.gaps || []).slice().sort((a, b) => a[0] - b[0]);
    let cur = x0;
    for (const g of gaps) {
      if (g[0] > cur) this.box(cur, y0, z - t / 2, g[0], y1, z + t / 2, o);
      if (g[2] < y1) this.box(g[0], g[2], z - t / 2, g[1], y1, z + t / 2, o);
      if (g[3] !== undefined && g[3] > y0) this.box(g[0], y0, z - t / 2, g[1], g[3], z + t / 2, o);
      cur = g[1];
    }
    if (cur < x1) this.box(cur, y0, z - t / 2, x1, y1, z + t / 2, o);
  }
  wallZ(x, z0, z1, y0, y1, o = {}) {
    const t = o.t || 0.4, gaps = (o.gaps || []).slice().sort((a, b) => a[0] - b[0]);
    let cur = z0;
    for (const g of gaps) {
      if (g[0] > cur) this.box(x - t / 2, y0, cur, x + t / 2, y1, g[0], o);
      if (g[2] < y1) this.box(x - t / 2, g[2], g[0], x + t / 2, y1, g[1], o);
      if (g[3] !== undefined && g[3] > y0) this.box(x - t / 2, y0, g[0], x + t / 2, g[3], g[1], o);
      cur = g[1];
    }
    if (cur < z1) this.box(x - t / 2, y0, cur, x + t / 2, y1, z1, o);
  }
  clipBox(x0, y0, z0, x1, y1, z1) { return this.box(x0, y0, z0, x1, y1, z1, { tex: null, shoot: false, shadow: false, occl: false }); }
  light(x, y, z, r, col, i = 1, glow = 0) {
    this.w.lights.push({ x, y, z, r, cr: col[0], cg: col[1], cb: col[2], i });
    if (glow) this.glows.push({ x, y, z, s: glow, c: col });
  }
  // luminária fluorescente de teto
  lamp(x, z, o = {}) {
    const y = o.y !== undefined ? o.y : 4;
    const col = o.col || [0.85, 0.95, 1.0];
    if (!o.off) {
      this.box(x - 0.7, y - 0.12, z - 0.18, x + 0.7, y, z + 0.18, { tex: 'light_panel', emis: 1, tint: col, solid: false, shadow: false });
      this.light(x, y - 0.35, z, o.r || 9, col, o.i || 1.0, o.glow === undefined ? 1.2 : o.glow);
    } else {
      this.box(x - 0.7, y - 0.12, z - 0.18, x + 0.7, y, z + 0.18, { tex: 'metal_dark', solid: false, shadow: false });
    }
  }
  streetLamp(x, z, dir, on = true) {
    this.box(x - 0.12, 0, z - 0.12, x + 0.12, 7.2, z + 0.12, { tex: 'metal_dark' });
    const hx = x + dir * 2.4;
    this.box(Math.min(x, hx), 7.0, z - 0.07, Math.max(x, hx), 7.14, z + 0.07, { tex: 'metal_dark', solid: false });
    if (on) {
      this.box(hx - 0.4, 6.82, z - 0.22, hx + 0.4, 7.0, z + 0.22, { tex: 'lamp_orange', emis: 1, solid: false, shadow: false });
      this.light(hx, 6.4, z, 17, [1.0, 0.62, 0.3], 1.3, 2.2);
    } else this.box(hx - 0.4, 6.82, z - 0.22, hx + 0.4, 7.0, z + 0.22, { tex: 'metal_dark', solid: false });
  }
  // placa/decalque fino numa parede. face: 'px','nx','pz','nz'
  sign(face, x0, y0, z0, x1, y1, z1, tex, o = {}) {
    const t = {}; t[face] = tex; t.o = o.frame || 'metal_dark';
    return this.box(x0, y0, z0, x1, y1, z1, Object.assign({ tex: t, faceUV: true, solid: false, shoot: false }, o));
  }
  car(x, z, tint, burnt = false) {
    const body = burnt ? 'car_burnt' : 'car_paint', side = burnt ? 'car_burnt' : 'car_side';
    this.box(x - 0.9, 0.3, z - 2.15, x + 0.9, 1.0, z + 2.15, { tex: body, tint, s: 1.5 });
    this.box(x - 0.8, 1.0, z - 1.0, x + 0.8, 1.52, z + 1.1, { tex: { px: side, nx: side, pz: burnt ? body : 'window', nz: burnt ? body : 'window', top: body }, faceUV: true, tint });
    for (const [dx, dz] of [[-0.95, -1.4], [0.95, -1.4], [-0.95, 1.4], [0.95, 1.4]]) this.box(x + dx - 0.13, 0, z + dz - 0.33, x + dx + 0.13, 0.62, z + dz + 0.33, { tex: 'tire', solid: false });
    // parachoques e faróis
    this.box(x - 0.95, 0.35, z - 2.25, x + 0.95, 0.6, z - 2.15, { tex: 'metal_dark' });
    this.box(x - 0.95, 0.35, z + 2.15, x + 0.95, 0.6, z + 2.25, { tex: 'metal_dark' });
    if (!burnt) {
      this.box(x - 0.8, 0.7, z - 2.17, x - 0.45, 0.85, z - 2.14, { tex: 'white', tint: [1, 0.95, 0.7], emis: 0.6, solid: false });
      this.box(x + 0.45, 0.7, z - 2.17, x + 0.8, 0.85, z - 2.14, { tex: 'white', tint: [1, 0.95, 0.7], emis: 0.6, solid: false });
    }
  }
  crate(x, y, z, s = 1) { this.box(x - s / 2, y, z - s / 2, x + s / 2, y + s, z + s / 2, { tex: 'crate', faceUV: true }); }
  // cilindro decorativo com colisão AABB
  cylinder(x, y, z, r, h, texSide, texTop, tint = [1, 1, 1], segs = 10, solid = true) {
    const M = M34.mul(M34.trans(x, y + h / 2, z), M34.scale(r * 2, h, r * 2));
    const P = [];
    for (let i = 0; i <= segs; i++) { const a = i / segs * TAU; P.push([Math.cos(a) * 0.5, Math.sin(a) * 0.5]); }
    for (let i = 0; i < segs; i++) {
      const a = P[i], b = P[i + 1];
      const A = M34.apply(M, a[0], -0.5, a[1]), B = M34.apply(M, b[0], -0.5, b[1]), Cc = M34.apply(M, b[0], 0.5, b[1]), D = M34.apply(M, a[0], 0.5, a[1]);
      const m = (i + 0.5) / segs * TAU;
      this.w.quads.push({ p: [...B, ...A, ...D, ...Cc], n: [Math.cos(m), 0, Math.sin(m)], uv: [i / segs * 2, 0, (i + 1) / segs * 2, 1], layer: T[texSide], tint });
    }
    const top = M34.apply(M, 0, 0.5, 0);
    for (let i = 0; i < segs; i += 2) {
      const a = P[i], b = P[i + 1], d = P[Math.min(i + 2, segs)];
      const A = M34.apply(M, a[0], 0.5, a[1]), B = M34.apply(M, b[0], 0.5, b[1]), D = M34.apply(M, d[0], 0.5, d[1]);
      this.w.quads.push({ p: [...top, ...D, ...B, ...A], n: [0, 1, 0], uv: [0, 0, 1, 1], layer: T[texTop], tint });
    }
    if (solid) this.box(x - r * 0.8, y, z - r * 0.8, x + r * 0.8, y + h, z + r * 0.8, { tex: null, shadow: true });
  }
  ent(type, x, y, z, props = {}) { this.ents.push(Object.assign({ type, x, y, z }, props)); }
  enemy(etype, x, y, z, yaw = 0, props = {}) { this.ent('enemy', x, y, z, Object.assign({ etype, yaw }, props)); }
  item(itype, x, y, z, props = {}) { this.ent('item', x, y, z, Object.assign({ itype }, props)); }
  door(id, x0, y0, z0, x1, y1, z1, tex, key = null, o = {}) { this.doors.push(Object.assign({ id, box: [x0, y0, z0, x1, y1, z1], tex, key }, o)); }
  trigger(x0, y0, z0, x1, y1, z1, event, o = {}) { this.triggers.push(Object.assign({ box: [x0, y0, z0, x1, y1, z1], event, once: true }, o)); }
  line(x0, z0, x1, z1) { this.box(x0, 0, z0, x1, 0.014, z1, { tex: 'white', tint: [0.9, 0.92, 0.88], solid: false, shoot: false, shadow: false, occl: false, sub: 4 }); }
}

// alturas das arquibancadas
const standNY = (z) => z > -26.3 ? 0 : 0.45 * (Math.min(11, Math.floor((-26.3 - z) / 1.5)) + 1);
const standSY = (z) => z < 26.3 ? 0 : 0.5 * (Math.min(7, Math.floor((z - 26.3) / 1.5)) + 1);
const standEY = (x) => x < 38.3 ? 0 : 0.45 * (Math.min(7, Math.floor((x - 38.3) / 1.5)) + 1);
const nStepZ = (i) => -26.3 - 1.5 * (i + 0.5);
const sStepZ = (i) => 26.3 + 1.5 * (i + 0.5);
const eStepX = (i) => 38.3 + 1.5 * (i + 0.5);

function buildSerrinha(world) {
  const L = new LevelBuilder(world);
  const W_INT = { tex: { o: 'wall_int', top: 'concrete' }, su: 4, sv: 4, vo: 1 };
  const GREEN = [0.25, 0.7, 0.38], WHITE = [1, 1, 1];

  // =====================================================================
  // RUA (lado de fora, oeste)
  // =====================================================================
  L.box(-96, -0.5, -42.5, -82, 0.15, 42.5, { tex: { top: 'sidewalk', o: 'concrete' } });
  L.box(-82, -0.5, -42.5, -66, 0, 42.5, { tex: { top: 'asphalt', o: 'concrete' }, s: 3 });
  L.box(-66, -0.5, -42.5, -62.25, 0.15, 42.5, { tex: { top: 'sidewalk', o: 'concrete' } });
  for (let z = -40; z < 40; z += 5) L.box(-74.1, 0, z, -73.9, 0.012, z + 2.5, { tex: 'white', tint: [0.95, 0.78, 0.2], solid: false, shoot: false, shadow: false, occl: false });
  // lojas do outro lado da rua
  const shops = [
    { z0: -42.5, z1: -36, h: 5.0, tex: 'brick' },
    { z0: -36, z1: -24, h: 4.2, tex: 'plaster', tint: [1, 0.88, 0.5], sign: 'sign_bar', awn: [0.9, 0.3, 0.2] },
    { z0: -24, z1: -10, h: 6.5, tex: 'plaster', tint: [0.7, 0.86, 1], sign: 'sign_pamonha', awn: [0.4, 0.8, 0.3] },
    { z0: -10, z1: 4, h: 4.6, tex: 'plaster', tint: [1, 0.72, 0.78], sign: 'sign_pitdog', awn: [1, 0.6, 0.1] },
    { z0: 4, z1: 20, h: 5.6, tex: 'plaster', tint: [0.78, 1, 0.76], house: true },
    { z0: 20, z1: 32, h: 7.0, tex: 'brick', sign: 'sign_oficina' },
    { z0: 32, z1: 42.5, h: 5.0, tex: 'graffiti_verdao' },
  ];
  for (const s of shops) {
    L.box(-96, 0, s.z0, -86, s.h, s.z1, { tex: { top: 'roof_top', o: s.tex }, tint: s.tint, su: s.tex === 'graffiti_verdao' ? 4 : 2, sv: s.tex === 'graffiti_verdao' ? 4 : 2, vo: s.tex === 'graffiti_verdao' ? 1 : 0 });
    const zc = (s.z0 + s.z1) / 2;
    if (s.sign) {
      L.box(-86, 0.15, zc - 1.6, -85.92, 2.75, zc + 1.6, { tex: { px: 'door_shop', o: 'metal_dark' }, faceUV: true });
      L.sign('px', -86, 3.0, s.z0 + 1, -85.8, 3.95, s.z1 - 1, s.sign);
      if (s.awn) L.box(-86, 2.8, s.z0 + 0.5, -84.2, 2.9, s.z1 - 0.5, { tex: 'canvas', tint: s.awn, solid: true, keepBottom: true });
      L.sign('px', -86, 1.0, s.z0 + 0.8, -85.95, 2.4, zc - 2.2, 'window_lit', { emis: 0.35 });
    }
    if (s.house) {
      for (const wz of [7, 11, 15]) {
        L.sign('px', -86, 1.2, wz, -85.95, 2.6, wz + 2.4, 'window');
        L.sign('px', -85.95, 1.2, wz, -85.85, 2.6, wz + 2.4, 'grade');
        L.sign('px', -86, 3.5, wz, -85.95, 4.9, wz + 2.4, 'window');
      }
    }
  }
  // telhado do Bar do Zé (segredo 1)
  L.box(-93.5, 4.2, -33.5, -90.5, 5.7, -30.5, { tex: { o: 'tank_blue', top: 'tank_blue' } });
  L.box(-93.7, 5.7, -33.7, -90.3, 5.85, -30.3, { tex: 'tank_blue', tint: [0.8, 0.8, 0.9] });
  L.box(-88.2, 4.2, -26, -88, 6.8, -25.8, { tex: 'metal_dark' }); // antena
  L.trigger(-96, 4.0, -36, -86, 9, -24, 'secret', { secret: 1 });
  // fundo e tapumes
  L.box(-96, 0, -43, -62.25, 3.5, -42.5, { tex: 'tapume', s: 3.5 });
  L.box(-96, 0, 42.5, -62.25, 3.5, 43, { tex: 'tapume', s: 3.5 });
  L.clipBox(-96, 3.5, -43.5, -62.25, 40, -42.5);
  L.clipBox(-96, 3.5, 42.5, -62.25, 40, 43.5);
  L.clipBox(-97.5, -1, -44, -96, 40, 44);
  // ônibus da torcida adversária
  L.box(-83, 0.45, -37, -71, 3.2, -34, { tex: { pz: 'bus_side', nz: 'bus_side', px: 'bus_front', nx: 'bus_front', top: 'roof_metal' }, faceUV: true });
  for (const wx of [-81.5, -73]) for (const wz of [-37.05, -34.25]) L.box(wx - 0.5, 0, wz - 0.1, wx + 0.5, 0.95, wz + 0.4, { tex: 'tire', solid: false });
  L.crate(-70.4, 0, -35.7); L.crate(-70.4, 1, -35.7); L.crate(-69.3, 0, -35.7);
  L.crate(-67.5, 0, -39);
  // carros
  L.car(-67.2, 22, [0.9, 0.9, 0.95]);
  L.car(-67.2, -10, [0.25, 0.3, 0.5]);
  L.car(-80.7, 10, [0.55, 0.55, 0.58]);
  L.car(-77, -18, [1, 1, 1], true); // carro queimado
  L.car(-80.7, -8, [0.12, 0.12, 0.13]);
  // cavaletes de polícia
  L.box(-80, 0, 38, -76.5, 1.05, 38.25, { tex: 'metal', tint: [1, 0.85, 0.4] });
  L.box(-71, 0, 38.5, -68, 1.05, 38.75, { tex: 'metal', tint: [1, 0.85, 0.4] });
  // postes
  for (const z of [-30, -12, 6, 24]) L.streetLamp(-64.6, z, -1, z !== 6);
  for (const z of [-22, 14, 34]) L.streetLamp(-83.8, z, 1, z !== 14);
  // pichações na fachada
  L.sign('nx', -62.32, 0.3, 7, -62.25, 3.0, 11, 'graffiti_fjg', { frame: 'concrete' });
  L.sign('nx', -62.32, 0.3, -12, -62.25, 3.0, -8, 'graffiti_vila', { frame: 'concrete' });
  L.sign('nx', -62.32, 0.3, 18, -62.25, 3.0, 22, 'graffiti_vila', { frame: 'concrete' });
  L.sign('nx', -62.32, 0.3, -24, -62.25, 3.0, -20, 'graffiti_fjg', { frame: 'concrete' });
  L.sign('nx', -62.45, 3.55, -6, -62.25, 4.95, 6, 'sign_estadio', { frame: 'paint' });
  L.sign('px', -86, 0.4, 34, -85.9, 2.8, 40, 'banner_tigre');
  // fogueira dos invasores + sinalizadores
  L.ent('emitter', -72, 0, -24, { kind: 'fire' });
  L.box(-72.5, 0, -24.5, -71.5, 0.4, -23.5, { tex: 'car_burnt', solid: true });
  L.ent('emitter', -77, 1.1, -18, { kind: 'fire', small: true });
  L.ent('emitter', -68.5, 0.15, -3, { kind: 'flare' });
  L.ent('emitter', -84, 0.15, -14, { kind: 'flare' });

  // =====================================================================
  // PRÉDIO (bilheteria, corredores, lanchonete, vestiário, túnel)
  // =====================================================================
  const room = (x0, z0, x1, z1, floor, ceil = 'ceiling') => {
    L.box(x0, -0.5, z0, x1, 0, z1, { tex: { top: floor, o: 'concrete' }, keepBottom: false });
    L.box(x0, 4, z0, x1, 4.6, z1, { tex: { bottom: ceil, top: 'roof_top', o: 'concrete' } });
  };
  room(-62.25, -8, -50, 8, 'floor_gran');        // hall
  room(-62.25, -30.25, -56, -8, 'floor_gran');   // corredor N
  room(-62.25, 8, -56, 30.25, 'floor_gran');     // corredor S
  room(-56, -30.25, -37.75, -12, 'floor_red');   // lanchonete
  room(-56, -12, -50, -8, 'concrete_dark');
  room(-50, -12, -37.75, -2.5, 'concrete_dark');
  room(-50, -2.5, -37.75, 2.5, 'concrete', 'concrete_dark'); // túnel
  room(-50, 2.5, -37.75, 12, 'concrete_dark');
  room(-56, 8, -50, 12, 'concrete_dark');
  room(-56, 12, -37.75, 22, 'tile_floor');       // vestiário
  room(-56, 22, -44, 30.25, 'tile_floor');       // chuveiros
  room(-44, 22, -37.75, 30.25, 'concrete_dark'); // sala secreta
  // paredes externas
  const FAC = (out, inn) => { const t = { top: 'concrete', o: 'concrete' }; t[out] = 'facade'; t[inn] = 'wall_int'; return { tex: t, t: 0.5, su: 4, sv: 4, vo: 1 }; };
  L.wallZ(-62, -30.25, 30.25, 0, 5.2, Object.assign(FAC('nx', 'px'), { gaps: [[-1.5, 1.5, 3.2]] }));
  L.wallZ(-38, -30.25, 30.25, 0, 5.2, Object.assign(FAC('px', 'nx'), { gaps: [[-2.5, 2.5, 3.5]] }));
  L.wallX(-30, -62.25, -37.75, 0, 5.2, FAC('nz', 'pz'));
  L.wallX(30, -62.25, -37.75, 0, 5.2, FAC('pz', 'nz'));
  L.clipBox(-62.25, 5.2, -30.75, -37.75, 40, -30.25);
  L.clipBox(-62.25, 5.2, 30.25, -37.75, 40, 30.75);
  // paredes internas
  L.wallX(-8, -56, -50, 0, 4, W_INT);
  L.wallX(8, -56, -50, 0, 4, W_INT);
  L.wallZ(-50, -12, 12, 0, 4, Object.assign({ gaps: [[-2.5, 2.5, 3.5]] }, W_INT));
  L.wallZ(-56, -30.25, -8, 0, 4, Object.assign({ gaps: [[-22, -18, 3]] }, W_INT));
  L.wallX(-12, -56, -37.75, 0, 4, W_INT);
  L.wallX(-2.5, -50, -37.75, 0, 4, W_INT);
  L.wallX(2.5, -50, -37.75, 0, 4, W_INT);
  L.wallZ(-56, 8, 22, 0, 4, Object.assign({ gaps: [[15, 19, 3]] }, W_INT));
  L.wallZ(-56, 22, 30.25, 0, 4, { tex: { px: 'tile_white', o: 'wall_int', top: 'concrete' }, su: 4, sv: 4, vo: 1 });
  L.wallX(12, -56, -37.75, 0, 4, W_INT);
  L.wallX(22, -56, -37.75, 0, 4, { tex: { pz: 'tile_white', o: 'wall_int', top: 'concrete' }, su: 4, sv: 4, vo: 1, gaps: [[-54, -50, 3]] });
  // parede dos chuveiros com trecho falso (segredo 2)
  const SH = { tex: { nx: 'tile_white', px: 'concrete_dark', o: 'concrete', top: 'concrete' }, su: 4, sv: 4, vo: 1 };
  L.wallZ(-44, 22, 24.5, 0, 4, SH);
  L.wallZ(-44, 27.5, 30.25, 0, 4, SH);
  L.box(-44.2, 3, 24.5, -43.8, 4, 27.5, SH);
  L.box(-44.2, 0, 24.5, -43.8, 3, 27.5, { tex: { nx: 'tile_fake', px: 'concrete_dark', o: 'concrete' }, su: 4, sv: 4, vo: 1, solid: false, shoot: true, fake: true, occl: false });
  L.trigger(-43.5, 0, 22.5, -38.2, 3, 29.8, 'secret', { secret: 2 });
  L.light(-41, 3, 26, 6, [1, 0.25, 0.2], 0.9, 0.8);
  L.box(-41.3, 3.6, 29.9, -40.7, 3.9, 30.05, { tex: 'white', tint: [1, 0.2, 0.15], emis: 1, solid: false });

  // --- hall / bilheteria ---
  for (const [a, b] of [[-7.6, -5.2], [-4.4, -2.0], [2.0, 4.4], [5.2, 7.6]]) L.box(-57.3, 0, a, -56.7, 1.05, b, { tex: { o: 'metal', top: 'metal_dark' }, s: 1 });
  L.box(-61.75, 0, -7.75, -60.2, 1.1, -3, { tex: { o: 'counter', top: 'metal' }, s: 1.5 });
  L.box(-61.75, 1.1, -7.75, -60.2, 1.15, -3, { tex: 'metal_dark' });
  L.sign('px', -61.75, 2.2, -7.0, -61.7, 3.2, -3.2, 'sign_bilheteria');
  L.sign('nx', -50.25, 1.3, 4.0, -50.2, 3.0, 5.5, 'poster_goias');
  L.sign('nx', -50.25, 1.3, -5.5, -50.2, 3.0, -4.0, 'poster_jogo');
  L.sign('nx', -50.25, 3.52, -2.4, -50.2, 3.98, 2.4, 'sign_tunnel');
  L.sign('pz', -54, 1.4, -7.8, -52.5, 3.0, -7.75, 'poster_goias');
  L.lamp(-56, -4); L.lamp(-56, 4);
  L.trigger(-61.5, 0, -2.5, -58.5, 3, 2.5, 'hall');
  // --- corredor norte ---
  L.lamp(-59, -14); L.lamp(-59, -26, { off: true });
  L.sign('nx', -56.25, 3.05, -21.8, -56.2, 3.6, -18.2, 'sign_lanch');
  L.sign('px', -61.75, 1.3, -18, -61.7, 3.0, -16.5, 'poster_jogo');
  L.box(-61.7, 0, -12, -61.2, 0.45, -9, { tex: 'wood' });
  // --- lanchonete ---
  L.box(-54, 0, -25, -42, 1.1, -24.2, { tex: { o: 'counter', top: 'metal' }, s: 1.5 });
  L.box(-53.5, 0, -29.95, -50.5, 2.2, -29.1, { tex: { pz: 'fridge', o: 'metal' }, faceUV: { 4: true } });
  L.box(-50.3, 0, -29.95, -47.3, 2.2, -29.1, { tex: { pz: 'fridge', o: 'metal' }, faceUV: { 4: true } });
  L.sign('pz', -45, 2.2, -29.8, -40, 3.4, -29.75, 'sign_lanch');
  for (const [tx, tz] of [[-52, -17], [-47, -15.5], [-42, -17.5]]) {
    L.box(tx - 0.6, 0.72, tz - 0.6, tx + 0.6, 0.8, tz + 0.6, { tex: 'wood' });
    L.box(tx - 0.08, 0, tz - 0.08, tx + 0.08, 0.72, tz + 0.08, { tex: 'metal_dark' });
  }
  L.sign('nx', -38.3, 2.2, -22, -38.25, 3.4, -20, 'tv', { emis: 0.7 });
  L.lamp(-50, -18); L.lamp(-43, -26); L.lamp(-43, -15);
  // --- corredor sul ---
  L.lamp(-59, 13); L.lamp(-59, 25);
  L.sign('nx', -56.25, 3.05, 15.2, -56.2, 3.6, 18.8, 'sign_vest');
  L.box(-61.7, 0, 10, -61.2, 0.45, 13, { tex: 'wood' });
  // --- vestiário ---
  L.box(-55.5, 0, 12.2, -39, 2.1, 12.85, { tex: { pz: 'lockers', o: 'metal', top: 'metal' }, su: 1.2, sv: 2.1, vo: 1 });
  L.box(-53, 0, 16.2, -43, 0.45, 16.9, { tex: 'wood' });
  L.box(-53, 0, 18.6, -43, 0.45, 19.3, { tex: 'wood' });
  for (const sx of [-54, -50.5, -47, -43.5]) L.sign('pz', sx, 1.0, 12.85, sx + 0.55, 1.75, 12.9, 'manto');
  L.sign('nz', -50, 1.2, 21.75, -46, 2.8, 21.8, 'blackboard');
  L.box(-41, 0, 15.2, -39.2, 0.85, 18.8, { tex: { top: 'white', o: 'metal_dark' }, tint: [0.85, 0.95, 0.9] });
  L.sign('px', -55.8, 1.2, 14, -55.75, 2.6, 16, 'mirror');
  L.lamp(-50, 17); L.lamp(-43, 17);
  // --- chuveiros ---
  for (const sx of [-54, -51, -48]) {
    L.box(sx - 0.1, 2.1, 29.6, sx + 0.1, 2.3, 29.8, { tex: 'metal', solid: false });
    L.box(sx - 0.03, 2.3, 29.72, sx + 0.03, 4, 29.8, { tex: 'metal', solid: false });
  }
  L.lamp(-50, 26, { i: 0.5, col: [0.7, 0.85, 1] });
  // --- túnel ---
  L.sign('pz', -47, 1.2, -2.3, -41, 2.7, -2.25, 'banner_serrinha');
  L.sign('nz', -47, 1.2, 2.25, -41, 2.7, 2.3, 'banner_verdao');
  L.lamp(-45.5, 0, { col: [0.6, 1, 0.7], i: 0.8 }); L.lamp(-40.5, 0, { col: [0.6, 1, 0.7], i: 0.8 });
  L.trigger(-48.5, 0, -2.4, -45, 3, 2.4, 'tunnel');

  // =====================================================================
  // ESTÁDIO: gramado, pista, alambrados
  // =====================================================================
  L.box(-37.75, -0.5, -26, 38.3, 0, -20, { tex: { top: 'concrete', o: 'concrete' } });
  L.box(-37.75, -0.5, 20, 38.3, 0, 26, { tex: { top: 'concrete', o: 'concrete' } });
  L.box(-37.75, -0.5, -20, -30, 0, 20, { tex: { top: 'concrete', o: 'concrete' } });
  L.box(30, -0.5, -20, 38.3, 0, 20, { tex: { top: 'concrete', o: 'concrete' } });
  for (let i = 0; i < 12; i++) L.box(-30 + 5 * i, -0.5, -20, -25 + 5 * i, 0, 20, { tex: { top: i % 2 ? 'grass2' : 'grass', o: 'concrete' }, s: 3, sub: 2 });
  // linhas
  L.line(-30, -20.06, 30, -19.94); L.line(-30, 19.94, 30, 20.06);
  L.line(-30.06, -20, -29.94, 20); L.line(29.94, -20, 30.06, 20);
  L.line(-0.06, -20, 0.06, 20);
  for (const s of [-1, 1]) {
    const gx = 30 * s;
    L.line(Math.min(gx, gx - s * 9) - 0.0, -12.06, Math.max(gx, gx - s * 9), -11.94);
    L.line(Math.min(gx, gx - s * 9), 11.94, Math.max(gx, gx - s * 9), 12.06);
    L.line(gx - s * 9 - 0.06, -12, gx - s * 9 + 0.06, 12);
    L.line(Math.min(gx, gx - s * 3.5), -5.56, Math.max(gx, gx - s * 3.5), -5.44);
    L.line(Math.min(gx, gx - s * 3.5), 5.44, Math.max(gx, gx - s * 3.5), 5.56);
    L.line(gx - s * 3.5 - 0.06, -5.5, gx - s * 3.5 + 0.06, 5.5);
    L.line(gx - s * 6.5 - 0.15, -0.15, gx - s * 6.5 + 0.15, 0.15);
  }
  L.line(-0.15, -0.15, 0.15, 0.15);
  // círculo central
  const segs = 40;
  for (let i = 0; i < segs; i++) {
    const a = i / segs * TAU, b = (i + 1) / segs * TAU, r0 = 5.14, r1 = 5.26, y = 0.013;
    const P = (r, t) => [Math.cos(t) * r, y, Math.sin(t) * r];
    world.quads.push({ p: [...P(r0, b), ...P(r1, b), ...P(r1, a), ...P(r0, a)], n: [0, 1, 0], uv: [0, 0, 1, 1], layer: T.white, tint: [0.9, 0.92, 0.88] });
  }
  // traves
  for (const s of [-1, 1]) {
    const gx = 30 * s, bx = gx + s * 2;
    const X = (a, b) => [Math.min(a, b), Math.max(a, b)];
    const [px0, px1] = X(gx, gx + s * 0.12);
    L.box(px0, 0, -3.78, px1, 2.44, -3.66, { tex: 'white', tint: [0.95, 0.95, 0.95] });
    L.box(px0, 0, 3.66, px1, 2.44, 3.78, { tex: 'white', tint: [0.95, 0.95, 0.95] });
    L.box(px0, 2.44, -3.78, px1, 2.56, 3.78, { tex: 'white', tint: [0.95, 0.95, 0.95] });
    const [nx0, nx1] = X(bx, bx + s * 0.05);
    L.box(nx0, 0, -3.7, nx1, 2.44, 3.7, { tex: 'net', s: 1, noCull: true });
    const [sx0, sx1] = X(gx + s * 0.12, bx);
    L.box(sx0, 0, -3.72, sx1, 2.44, -3.66, { tex: 'net', s: 1, noCull: true });
    L.box(sx0, 0, 3.66, sx1, 2.44, 3.72, { tex: 'net', s: 1, noCull: true });
    L.box(Math.min(gx, bx), 2.44, -3.7, Math.max(gx, bx), 2.47, 3.7, { tex: 'net', s: 1, noCull: true, keepBottom: true });
  }
  // placas de publicidade
  const ads = ['ad1', 'ad2', 'ad3', 'ad4', 'ad5', 'ad6', 'ad7'];
  let ai = 0;
  for (const [a, b] of [[-28, -24], [-22, -18], [-16, -12], [-6, -2], [2, 6], [12, 16], [18, 22], [24, 28]]) {
    L.box(a, 0, -22.4, b, 1.0, -22.2, { tex: { pz: ads[ai++ % 7], nz: 'metal_dark', o: 'metal_dark' }, faceUV: { 4: true } });
    L.box(a, 0, 22.2, b, 1.0, 22.4, { tex: { nz: ads[ai++ % 7], pz: 'metal_dark', o: 'metal_dark' }, faceUV: { 5: true } });
  }
  for (const [a, b] of [[-14, -10], [-10, -6], [6, 10], [10, 14]]) {
    L.box(33, 0, a, 33.2, 1.0, b, { tex: { nx: ads[ai++ % 7], o: 'metal_dark' }, faceUV: { 1: true } });
    L.box(-33.2, 0, a, -33, 1.0, b, { tex: { px: ads[ai++ % 7], o: 'metal_dark' }, faceUV: { 0: true } });
  }
  // bancos de reservas
  for (const [a, b] of [[-12, -6], [6, 12]]) {
    L.box(a, 0, 25.4, b, 2.3, 25.6, { tex: 'metal', tint: [0.8, 0.9, 0.85] });
    L.box(a, 2.3, 23, b, 2.4, 25.6, { tex: 'metal', tint: [0.8, 0.9, 0.85], keepBottom: true });
    L.box(a, 0, 23.4, a + 0.1, 2.3, 25.4, { tex: 'window' });
    L.box(b - 0.1, 0, 23.4, b, 2.3, 25.4, { tex: 'window' });
    L.box(a + 0.2, 0, 24.7, b - 0.2, 0.45, 25.4, { tex: 'wood', tint: GREEN });
  }
  // muretas + alambrado
  const MUR = { tex: { o: 'paint_green', top: 'concrete' } };
  const FEN = { tex: 'fence', s: 1.5, shoot: false, noCull: true };
  for (const [a, b] of [[-37.75, -2], [2, 38.3]]) { L.box(a, 0, -26.3, b, 1.2, -26, MUR); L.box(a, 1.2, -26.2, b, 3.6, -26.1, FEN); }
  for (const [a, b] of [[-37.75, -17], [-13, 13], [17, 38.3]]) { L.box(a, 0, 26, b, 1.2, 26.3, MUR); L.box(a, 1.2, 26.1, b, 3.6, 26.2, FEN); }
  for (const [a, b] of [[-26, -4], [4, 26]]) { L.box(38, 0, a, 38.3, 1.2, b, MUR); L.box(38.1, 1.2, a, 38.2, 3.6, b, FEN); }
  // faixas dos vileiros no alambrado norte
  L.sign('pz', -30, 1.3, -26.0, -24, 2.8, -25.95, 'banner_tigre');
  L.sign('pz', 10, 1.3, -26.0, 16, 2.8, -25.95, 'banner_tigre');
  L.sign('nz', -10, 1.3, 25.95, -4, 2.8, 26.0, 'banner_verdao');
  L.sign('nz', 4, 1.3, 25.95, 10, 2.8, 26.0, 'banner_fjg');

  // =====================================================================
  // ARQUIBANCADA NORTE (Geral)
  // =====================================================================
  for (let i = 0; i < 12; i++) {
    const za = -26.3 - 1.5 * (i + 1), zb = -26.3 - 1.5 * i, top = 0.45 * (i + 1);
    const tf = {}; tf[4] = i % 2 ? GREEN : WHITE;
    L.box(-37.75, 0, za, 38, top, zb, { tex: { top: 'stand_top', pz: 'paint', o: 'concrete' }, tintF: tf, clip: { 4: top - 0.45 }, sub: 1.5 });
  }
  L.box(-37.75, 0, -47.3, 38, 5.4, -44.3, { tex: { top: 'concrete', o: 'concrete' } });
  L.box(-38.5, 0, -48, 38.75, 9, -47.3, { tex: { pz: 'paint', o: 'concrete' }, tint: [0.85, 0.85, 0.85] });
  L.box(-38.5, 0, -47.3, -37.75, 9, -30.25, { tex: 'concrete' });
  L.box(38, 0, -47.3, 38.75, 9, -26.3, { tex: 'concrete' });
  L.clipBox(-39, 9, -48.5, 39, 45, -47.3);
  L.clipBox(-39, 9, -47.3, -37.75, 45, -30.25);
  L.clipBox(38, 9, -47.3, 39, 45, -26.3);
  const bn = [['banner_goias', -34], ['banner_fjg', -22], ['banner_tigre', -10], ['banner_verdao', 2], ['banner_fjg', 14], ['banner_serrinha', 26]];
  for (const [t, x] of bn) L.sign('pz', x, 6, -47.3, x + 8, 8, -47.2, t);
  // bateria da torcida no topo + pedestal do lança-rojão
  L.box(-1, 5.4, -46.6, 1, 5.9, -45.0, { tex: { top: 'metal', o: 'paint' }, tint: GREEN });
  for (const [dx, dz, r] of [[-3, -46, 0.4], [-4.2, -45.4, 0.35], [3, -46, 0.4], [4.3, -45.5, 0.3], [-2.4, -44.8, 0.28]]) L.cylinder(dx, 5.4, dz, r, 0.6 + r, 'drum', 'drum_top');
  // sinalizadores dos invasores na arquibancada
  L.ent('emitter', -20, standNY(nStepZ(3)), nStepZ(3), { kind: 'flare' });
  L.ent('emitter', 22, standNY(nStepZ(6)), nStepZ(6), { kind: 'flare' });
  L.ent('emitter', -5, standNY(nStepZ(9)), nStepZ(9), { kind: 'flare' });

  // =====================================================================
  // ARQUIBANCADA SUL (coberta, cadeiras) + cabines de imprensa
  // =====================================================================
  for (let i = 0; i < 8; i++) {
    const za = 26.3 + 1.5 * i, zb = za + 1.5, top = 0.5 * (i + 1);
    const tf = {}; tf[5] = i % 2 ? GREEN : WHITE;
    L.box(-37.75, 0, za, 38, top, zb, { tex: { top: 'stand_top', nz: 'paint', o: 'concrete' }, tintF: tf, clip: { 5: top - 0.5 }, sub: 1.5 });
    for (const [a, b, tint] of [[-37.5, -6, GREEN], [-6, 6, WHITE], [6, 37.75, GREEN]]) {
      L.box(a, top, zb - 0.36, b, top + 0.5, zb - 0.28, { tex: { nz: 'seats', pz: 'seats', o: -1 }, faceUV: true, ru: (b - a) / 1.2, rv: 1, solid: false, shoot: false, shadow: false, occl: false, tint, keepBottom: true, noCull: true });
      L.box(a, top + 0.36, zb - 0.8, b, top + 0.41, zb - 0.36, { tex: { top: 'seat_pan', o: -1 }, faceUV: true, ru: (b - a) / 1.2, rv: 1, solid: false, shoot: false, shadow: false, occl: false, tint, keepBottom: true, noCull: true });
    }
  }
  L.box(-37.75, 0, 38.3, 38, 4, 45, { tex: { top: 'concrete', o: 'concrete' } });
  L.box(-38.5, 0, 45, 38.75, 11, 45.7, { tex: { nz: 'paint', o: 'concrete' }, tint: [0.85, 0.85, 0.85] });
  L.box(-38.5, 0, 30.25, -37.75, 10.5, 45, { tex: 'concrete' });
  L.box(38, 0, 26.3, 38.75, 10.5, 45, { tex: 'concrete' });
  L.box(-38.5, 10.5, 26, 38.75, 11, 45.7, { tex: { bottom: 'roof_metal', top: 'roof_metal', o: 'metal_dark' }, s: 3 });
  for (const x of [-24, -8, 8, 24]) L.box(x - 0.2, 0, 33.8, x + 0.2, 10.5, 34.2, { tex: 'concrete' });
  for (const x of [-26, -13, 0, 13, 26]) for (const z of [31, 38]) {
    L.box(x - 0.5, 10.2, z - 0.25, x + 0.5, 10.5, z + 0.25, { tex: 'light_panel', emis: 1, tint: [1, 0.95, 0.85], solid: false, shadow: false });
    L.light(x, 9.8, z, 13, [1, 0.93, 0.8], 0.85, 1.5);
  }
  // cabines de imprensa
  const CAB = { tex: { o: 'paint', top: 'concrete' }, tint: [0.8, 0.84, 0.9], t: 0.3 };
  L.wallX(40.45, -16, 16, 4, 7.2, Object.assign({ gaps: [[-14, -3, 6.6, 5.2], [-1.5, 1.5, 6.5], [3, 14, 6.6, 5.2]] }, CAB));
  L.wallZ(-16, 40.3, 45, 4, 7.2, CAB);
  L.wallZ(16, 40.3, 45, 4, 7.2, CAB);
  L.box(-16.15, 7.2, 40.3, 16.15, 7.5, 45, { tex: { bottom: 'ceiling', o: 'concrete' }, keepBottom: true });
  L.box(-15, 4, 40.6, -3.5, 4.8, 41.3, { tex: 'wood' });
  L.box(3.5, 4, 40.6, 15, 4.8, 41.3, { tex: 'wood' });
  for (const mx of [-13, -9, -5, 5, 9, 13]) L.box(mx - 0.3, 4.8, 40.8, mx + 0.3, 5.25, 40.95, { tex: { nz: 'metal_dark', pz: 'tv', o: 'metal_dark' }, faceUV: true, emis: 0.4 });
  L.box(-0.7, 4, 43, 0.7, 4.8, 44, { tex: 'wood' });
  L.sign('nz', -3, 6.55, 40.25, 3, 7.15, 40.3, 'sign_imprensa');
  L.lamp(-8, 42.6, { y: 7.2 }); L.lamp(8, 42.6, { y: 7.2 });
  L.trigger(-15.5, 4, 40.7, 15.5, 7, 44.8, 'press');

  // =====================================================================
  // ARQUIBANCADA LESTE (visitantes) + túnel + placar
  // =====================================================================
  for (let i = 0; i < 8; i++) {
    const xa = 38.3 + 1.5 * i, xb = xa + 1.5, top = 0.45 * (i + 1);
    const tf = {}; tf[1] = i % 2 ? [0.75, 0.2, 0.2] : WHITE;
    for (const [z0, z1] of [[-26.3, -4.5], [4.5, 26.3]]) L.box(xa, 0, z0, xb, top, z1, { tex: { top: 'stand_top', nx: 'paint', o: 'concrete' }, tintF: tf, clip: { 1: top - 0.45 }, sub: 1.5 });
  }
  for (const [z0, z1] of [[-26.3, -4.5], [4.5, 26.3]]) {
    L.box(50.3, 0, z0, 52.3, 3.6, z1, { tex: 'concrete' });
    L.box(52.3, 0, z0, 53, 4.8, z1, { tex: { nx: 'paint', o: 'concrete' }, tint: [0.8, 0.8, 0.8] });
  }
  L.box(38.75, 0, -27, 53, 6, -26.3, { tex: 'concrete' });
  L.box(38.75, 0, 26.3, 53, 6, 27, { tex: 'concrete' });
  L.box(38.3, 0, -4.5, 54, 5, -4, { tex: { o: 'concrete', pz: 'wall_int' }, su: 4, sv: 4, vo: 1 });
  L.box(38.3, 0, 4, 54, 5, 4.5, { tex: { o: 'concrete', nz: 'wall_int' }, su: 4, sv: 4, vo: 1 });
  L.box(38.3, -0.5, -4, 62.5, 0, 4, { tex: { top: 'concrete', o: 'concrete' } });
  // sala do chefe (portão dos visitantes)
  L.box(54, 0, -4.5, 62.5, 8, -4, { tex: 'concrete' });
  L.box(54, 0, 4, 62.5, 8, 4.5, { tex: 'concrete' });
  L.box(62.5, 0, -4.5, 63, 8, 4.5, { tex: 'concrete' });
  L.box(62.4, 0, -4, 62.5, 8, 4, { tex: 'concrete_dark' });
  L.sign('nx', 62.33, 0, -3.8, 62.4, 5, 3.8, 'gate_red', { frame: -1 });
  L.sign('nx', 62.33, 5.2, -3, 62.4, 6.7, 3, 'sign_visit');
  L.light(58, 6, 0, 10, [1, 0.3, 0.2], 1.0, 1.0);
  L.clipBox(53, 8, -4.5, 63, 40, 4.5);
  L.clipBox(38.3, 5, -4.5, 54, 40, -4);
  L.clipBox(38.3, 5, 4, 54, 40, 4.5);
  // placar
  L.box(53, 5.5, -6, 54, 11.5, 6, { tex: { nx: 'scoreboard', o: 'metal_dark' }, faceUV: { 1: true }, emis: 0 });
  L.box(53.2, 0, -6.6, 53.8, 5.5, -6, { tex: 'metal_dark' });
  L.box(53.2, 0, 6, 53.8, 5.5, 6.6, { tex: 'metal_dark' });
  // plataforma de serviço (segredo 3)
  L.box(53, 0, 11, 56, 5.0, 15, { tex: { top: 'metal', o: 'concrete_dark' } });
  L.clipBox(56, 5, 10.5, 56.5, 40, 15.5);
  L.clipBox(53, 5, 10.5, 56, 40, 11);
  L.clipBox(53, 5, 15, 56, 40, 15.5);
  L.clipBox(53, 4.8, -26.3, 53.5, 40, -6.6);
  L.clipBox(53, 4.8, 6.6, 53.5, 40, 11);
  L.clipBox(53, 4.8, 15, 53.5, 40, 26.3);
  L.clipBox(38.75, 6, -27.5, 53.5, 40, -27);
  L.clipBox(38.75, 6, 27, 53.5, 40, 27.5);
  L.trigger(53, 4.6, 11, 56, 9, 15, 'secret', { secret: 3 });
  L.light(54.5, 7.2, 13, 7, [0.4, 1, 0.5], 0.8, 0.8);

  // =====================================================================
  // Refletores (torres)
  // =====================================================================
  const tower = (x, z, dir, on) => {
    L.box(x - 0.6, 0, z - 0.6, x + 0.6, 28, z + 0.6, { tex: 'metal_dark', s: 3 });
    L.box(x - 3.2, 27.6, z - 0.5, x + 3.2, 31.2, z + 0.5, { tex: 'metal_dark' });
    const f = dir > 0 ? 'pz' : 'nz', pz = z + dir * 0.55;
    const t = {}; t[f] = on ? 'floodlight' : 'floodlight_off'; t.o = -1;
    L.box(x - 3, 27.8, Math.min(z + dir * 0.5, pz), x + 3, 31, Math.max(z + dir * 0.5, pz), { tex: t, faceUV: true, emis: on ? 1 : 0, solid: false, shadow: false, tint: on ? [1, 1, 0.95] : [1, 1, 1] });
    if (on) L.light(x, 29.4, z + dir * 3, 118, [1, 0.96, 0.86], 1.08, 14);
  };
  tower(-44, -52, 1, true); tower(44, -52, 1, true);
  tower(-44, 50, -1, true); tower(44, 50, -1, false);

  // =====================================================================
  // Portas
  // =====================================================================
  L.door('entrance', -62.2, 0, -1.5, -61.8, 3.2, 1.5, 'door_metal');
  L.door('lanch', -56.15, 0, -22, -55.85, 3, -18, 'door_metal');
  L.door('vest', -56.15, 0, 15, -55.85, 3, 19, 'door_metal');
  L.door('green', -50.15, 0, -2.5, -49.85, 3.5, 2.5, 'door_green', 'green');
  L.door('northgate', -2, 0, -26.25, 2, 3.6, -26.05, 'gate', 'white');
  L.door('visitors', 38.05, 0, -4, 38.25, 3.6, 4, 'gate_red', 'script');
  L.door('press', -1.5, 4, 40.3, 1.5, 6.5, 40.6, 'door_metal');

  // =====================================================================
  // Barris (botijões explosivos)
  // =====================================================================
  for (const [x, y, z] of [[-79.5, 0, -31], [-69, 0.15, 4], [-60.8, 0, 6.8], [-40.5, 0, -28.5], [34, 0, 12], [-34, 0, -13], [35.5, 0, -23.5], [-30, standNY(nStepZ(5)), nStepZ(5)], [20, 4, 44.2]]) L.barrels.push({ x, y, z });

  // =====================================================================
  // Jogador, itens e inimigos
  // =====================================================================
  L.ent('player', -74, 0, 37, { yaw: 0 });
  // rua
  L.item('shotgun', -84, 0.15, 12);
  L.item('shells', -83.3, 0.15, 14.4);
  L.item('pequi', -71, 0, 30); L.item('pequi', -71, 0, 28);
  L.item('bullets', -63.5, 0.15, 5);
  L.item('pamonha', -64.5, 0.15, -20);
  L.item('shells', -78.5, 0, -26);
  L.item('camisa', -63.5, 0.15, -38);
  L.item('empadao', -92, 4.2, -27);
  L.item('shellsBig', -89, 4.2, -34.5);
  L.item('bulletsBig', -88, 4.2, -30);
  L.enemy('vileiro', -72, 0, 12, 0.3);
  L.enemy('vileiro', -78.5, 0, 1, -0.4);
  L.enemy('vileiro', -68, 0, -8, 0.4);
  L.enemy('vileiro', -74.5, 0, -21, Math.PI);
  L.enemy('vileiro', -80, 0, -27, 2.6);
  L.enemy('arremessador', -77, 3.2, -35.5, Math.PI);
  L.enemy('arremessador', -65, 0.15, -30, Math.PI);
  L.enemy('rojoeiro', -64, 0.15, -1, 2.2, { minDiff: 1 });
  L.enemy('vileiro', -84, 0.15, -5, 1.5, { minDiff: 2 });
  L.enemy('brutamonte', -74, 0, -31, Math.PI, { minDiff: 2 });
  // hall
  L.enemy('vileiro', -58.5, 0, 4.5, 1.57);
  L.enemy('vileiro', -53, 0, -5, 1.2);
  L.enemy('arremessador', -52, 0, 5.5, 1.57);
  L.item('shells', -60.8, 0, 3.5);
  // corredor N + lanchonete
  L.enemy('vileiro', -59, 0, -20, 0);
  L.item('bullets', -61, 0, -28.5);
  L.item('pequi', -58, 0, -10);
  L.enemy('vileiro', -45, 0, -20, 1.57);
  L.enemy('arremessador', -48, 0, -27.5, Math.PI);
  L.enemy('brutamonte', -40.5, 0, -15, 1.57, { minDiff: 2 });
  L.enemy('vileiro', -52, 0, -14, 1.57, { minDiff: 1 });
  L.item('pistol', -47, 0.8, -15.5);
  L.item('pamonha', -52, 1.1, -24.6); L.item('pamonha', -48, 1.1, -24.6); L.item('pamonha', -44, 1.1, -24.6);
  L.item('bullets', -41, 0, -28.5);
  // corredor S + vestiário + chuveiro
  L.enemy('vileiro', -59, 0, 24, Math.PI);
  L.item('camisa', -61, 0, 28.5);
  L.enemy('vileiro', -44, 0, 15, 1.57);
  L.enemy('vileiro', -52, 0, 20.5, 1.57);
  L.enemy('arremessador', -40, 0, 20.8, 1.57);
  L.enemy('rojoeiro', -48, 0, 27, Math.PI, { minDiff: 2 });
  L.item('key_green', -40.1, 0.85, 17);
  L.item('shells', -54, 0, 14);
  L.item('pequi', -52, 0, 28); L.item('pequi', -50, 0, 28);
  L.item('manto', -41, 0, 26);
  L.item('shellsBig', -39.5, 0, 28.8);
  L.item('pamonha', -42.5, 0, 23.5);
  // túnel
  L.enemy('vileiro', -41, 0, 0.8, 1.57);
  // gramado
  L.item('rifle', -35.5, 0, 0);
  L.item('bulletsBig', -35.5, 0, 3.2);
  L.item('ssg', 0, 0, 0);
  L.item('shells', -22.5, 0, 0); L.item('shells', 22.5, 0, 0);
  L.item('pamonha', -9, 0.45, 25); L.item('pamonha', 9, 0.45, 25);
  L.item('bullets', -35, 0, -24); L.item('bullets', 35, 0, 24);
  L.item('rockets', -35, 0, 24); L.item('rockets', 35, 0, -24.5);
  L.item('pequi', -20, 0, 18); L.item('pequi', 20, 0, -18);
  L.item('camisa', 36, 0, 0);
  L.enemy('vileiro', -15, 0, -8, 1.57);
  L.enemy('vileiro', -10, 0, 10, 1.57);
  L.enemy('vileiro', 6, 0, -12, 1.57);
  L.enemy('vileiro', 14, 0, 7, 1.57, { minDiff: 1 });
  L.enemy('arremessador', eStepX(2), standEY(eStepX(2)), -15, -1.57);
  L.enemy('arremessador', eStepX(2), standEY(eStepX(2)), 15, -1.57);
  L.enemy('arremessador', -14, standSY(sStepZ(3)), sStepZ(3), 0, { minDiff: 1 });
  // arquibancada sul + cabine
  L.enemy('vileiro', 20, standSY(sStepZ(2)), sStepZ(2), 0);
  L.enemy('rojoeiro', -24, standSY(sStepZ(6)), sStepZ(6), 0);
  L.enemy('vileiro', -10, 4, 43, 0);
  L.enemy('rojoeiro', 9, 4, 43.5, 0);
  L.enemy('vileiro', 2.5, 4, 44.2, 0, { minDiff: 1 });
  L.item('key_white', 0, 4.8, 43.5);
  L.item('shellsBig', -12, 4, 44); L.item('pamonha', 12, 4, 44);
  L.item('empadao', 30, 4, 42);
  L.item('bullets', -30, 4, 42);
  // arquibancada norte (acordam ao abrir o portão)
  const dm = { dormant: true };
  L.enemy('vileiro', -12, standNY(nStepZ(2)), nStepZ(2), Math.PI, dm);
  L.enemy('vileiro', 12, standNY(nStepZ(3)), nStepZ(3), Math.PI, dm);
  L.enemy('vileiro', -25, standNY(nStepZ(6)), nStepZ(6), Math.PI, dm);
  L.enemy('vileiro', 25, standNY(nStepZ(5)), nStepZ(5), Math.PI, dm);
  L.enemy('arremessador', -6, standNY(nStepZ(8)), nStepZ(8), Math.PI, dm);
  L.enemy('arremessador', 18, standNY(nStepZ(9)), nStepZ(9), Math.PI, dm);
  L.enemy('arremessador', -30, standNY(nStepZ(10)), nStepZ(10), Math.PI, Object.assign({ minDiff: 1 }, dm));
  L.enemy('rojoeiro', -14, 5.4, -45.5, Math.PI, dm);
  L.enemy('rojoeiro', 14, 5.4, -45.5, Math.PI, dm);
  L.enemy('brutamonte', 0, standNY(nStepZ(4)), nStepZ(4), Math.PI, Object.assign({ minDiff: 1 }, dm));
  L.item('rocket', 0, 5.9, -45.8);
  L.item('rockets', -6, 5.4, -46.3); L.item('rockets', 6, 5.4, -46.3);
  L.item('pamonha', -30, standNY(nStepZ(4)), nStepZ(4)); L.item('shells', 30, standNY(nStepZ(4)), nStepZ(4));
  L.item('manto', 34, 5.4, -46);
  // segredo 3
  L.item('rockets', 54, 5, 12.3); L.item('pamonha', 55, 5, 13.8); L.item('camisa', 54, 5, 14);

  // gatilhos principais
  L.trigger(-3, 0, -30, 3, 4, -26.4, 'northstand');
  L.trigger(-37.5, 0, -2.6, -34, 3.5, 2.6, 'pitch');

  return L;
}

// ---------------------------------------------------------------------------
// Eventos roteirizados da fase
// ---------------------------------------------------------------------------
const LEVEL_EVENTS = {
  hall(g) { g.checkpoint('BILHETERIA'); g.message('BILHETERIA DA SERRINHA', 'big'); },
  tunnel(g) { g.checkpoint('TÚNEL'); },
  pitch(g) {
    g.message('O GRAMADO FOI INVADIDO!', 'big');
    g.checkpoint('GRAMADO');
    AUDIO.chant(0.12);
  },
  key_green(g) {
    g.message('EMBOSCADA NO VESTIÁRIO!', 'big');
    g.message('A CHAVE VERDE ABRE O ACESSO AO GRAMADO, NA BILHETERIA', 'small');
    g.spawnGroup([
      ['vileiro', -59, 0, 20], ['vileiro', -59, 0, 12], ['vileiro', -54, 0, 5],
      ['arremessador', -60, 0, 26], ['rojoeiro', -58, 0, -3, { minDiff: 1 }], ['vileiro', -53, 0, 20, { minDiff: 2 }],
    ]);
  },
  ssg(g) {
    g.message('É CILADA! OS VILEIROS CERCARAM O GRAMADO!', 'big');
    MUSIC.setIntensity(1);
    g.wave = { n: 1 };
    g.spawnGroup([
      ['vileiro', -34, 0, -23], ['vileiro', 34, 0, -23], ['vileiro', -34, 0, 23], ['vileiro', 34, 0, 23],
      ['vileiro', 0, 0, -24], ['vileiro', 2, 0, 24],
      ['arremessador', -8, standNY(nStepZ(1)), nStepZ(1)], ['arremessador', 8, standNY(nStepZ(1)), nStepZ(1)],
      ['vileiro', -20, 0, 24, { minDiff: 1 }], ['vileiro', 20, 0, -24, { minDiff: 2 }],
    ], 'waveA');
  },
  waveA_low(g) {
    g.message('MAIS VILEIROS PULARAM O ALAMBRADO!', 'small');
    g.spawnGroup([
      ['brutamonte', 35, 0, -10], ['rojoeiro', -20, standSY(sStepZ(1)), sStepZ(1)], ['rojoeiro', 20, standSY(sStepZ(1)), sStepZ(1)],
      ['vileiro', -34, 0, 10], ['vileiro', -34, 0, -10], ['arremessador', 45, standEY(45), 8, { minDiff: 1 }],
      ['brutamonte', -35, 0, 20, { minDiff: 2 }],
    ], 'waveB');
  },
  waveB_clear(g) {
    g.message('A BARRA TÁ LIMPA... POR ENQUANTO. PEGUE A CHAVE BRANCA NAS CABINES!', 'small');
    MUSIC.setIntensity(0.3);
    g.checkpoint('CENTRO DO GRAMADO', [0, 0, 0]);
  },
  press(g) { g.message('CABINES DE IMPRENSA', 'small'); g.checkpoint('CABINES'); },
  key_white(g) {
    g.message('OS VILEIROS SUBIRAM A ARQUIBANCADA SUL!', 'big');
    g.message('A CHAVE BRANCA ABRE O PORTÃO DA ARQUIBANCADA NORTE', 'small');
    g.spawnGroup([
      ['rojoeiro', -30, standSY(sStepZ(7)), sStepZ(7)], ['rojoeiro', 30, standSY(sStepZ(7)), sStepZ(7)],
      ['vileiro', -20, 4, 42], ['vileiro', 20, 4, 42], ['vileiro', -30, standSY(sStepZ(3)), sStepZ(3)],
      ['brutamonte', 25, 0, 23, { minDiff: 1 }],
    ]);
  },
  northstand(g) {
    g.message('ARQUIBANCADA NORTE — A CASA DA FORÇA JOVEM', 'big');
    g.checkpoint('ARQUIBANCADA NORTE');
    g.wakeDormant();
    MUSIC.setIntensity(1);
  },
  rocket(g) { g.startBoss(); },
};
