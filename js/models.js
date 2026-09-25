'use strict';
// ---------------------------------------------------------------------------
// Modelos low-poly feitos de caixas + helpers de emissão de geometria dinâmica
// ---------------------------------------------------------------------------
const _bp = new Array(12);
function faceShade(nx, ny, nz) { return 0.72 + 0.28 * ny + 0.07 * nx - 0.03 * nz; }

// emite caixa unitária transformada por M (3x4). tex: layer (número) ou array[6] por face.
// light: [r,g,b]; tint: [r,g,b]; em: emissivo 0..1
function emitBox(batch, M, tex, light, tint, em = 0, shadeOn = true, vTop = 0) {
  for (let f = 0; f < 6; f++) {
    const layer = typeof tex === 'number' ? tex : tex[f];
    if (layer === undefined || layer < 0) continue;
    const F = FACES[f], n = F.n, Rv = F.R, Uv = F.U;
    for (let k = 0; k < 4; k++) {
      const sr = (k === 0 || k === 3) ? -0.5 : 0.5, su = (k < 2) ? -0.5 : 0.5;
      const lx = n[0] * 0.5 + Rv[0] * sr + Uv[0] * su, ly = n[1] * 0.5 + Rv[1] * sr + Uv[1] * su, lz = n[2] * 0.5 + Rv[2] * sr + Uv[2] * su;
      _bp[k * 3] = M[0] * lx + M[1] * ly + M[2] * lz + M[3];
      _bp[k * 3 + 1] = M[4] * lx + M[5] * ly + M[6] * lz + M[7];
      _bp[k * 3 + 2] = M[8] * lx + M[9] * ly + M[10] * lz + M[11];
    }
    let s = 1;
    if (shadeOn) {
      let wx = M[0] * n[0] + M[1] * n[1] + M[2] * n[2], wy = M[4] * n[0] + M[5] * n[1] + M[6] * n[2], wz = M[8] * n[0] + M[9] * n[1] + M[10] * n[2];
      const l = Math.hypot(wx, wy, wz) || 1;
      s = faceShade(wx / l, wy / l, wz / l);
    }
    batch.quad(_bp, 0, vTop, 1, 1, layer, light[0] * s, light[1] * s, light[2] * s, tint[0], tint[1], tint[2], em);
  }
}
// caixa por posição/tamanho num frame M: centro local (ox,oy,oz), tamanho (sx,sy,sz)
function emitPart(batch, M, ox, oy, oz, sx, sy, sz, tex, light, tint, em) {
  const B = M34.mul(M, [sx, 0, 0, ox, 0, sy, 0, oy, 0, 0, sz, oz]);
  emitBox(batch, B, tex, light, tint, em);
}
// cilindro (prisma) de eixo Y, raio 0.5 e altura 1 em espaço local
function emitCylinder(batch, M, segs, texSide, texTop, light, tint, em = 0) {
  const P = [];
  for (let i = 0; i <= segs; i++) { const a = i / segs * TAU; P.push([Math.cos(a) * 0.5, Math.sin(a) * 0.5]); }
  const tr = (x, y, z) => M34.apply(M, x, y, z);
  for (let i = 0; i < segs; i++) {
    const a = P[i], b = P[i + 1];
    const A = tr(a[0], -0.5, a[1]), B = tr(b[0], -0.5, b[1]), Cc = tr(b[0], 0.5, b[1]), D = tr(a[0], 0.5, a[1]);
    // normal para fora: ordem b->a para CCW visto de fora
    const nm = (i + 0.5) / segs * TAU;
    const wn = M34.applyDir(M, Math.cos(nm), 0, Math.sin(nm));
    const l = Math.hypot(wn[0], wn[1], wn[2]) || 1;
    const s = faceShade(wn[0] / l, wn[1] / l, wn[2] / l);
    const q = [B[0], B[1], B[2], A[0], A[1], A[2], D[0], D[1], D[2], Cc[0], Cc[1], Cc[2]];
    batch.quad(q, i / segs * 2, 0, (i + 1) / segs * 2, 1, texSide, light[0] * s, light[1] * s, light[2] * s, tint[0], tint[1], tint[2], em);
  }
  if (texTop >= 0) {
    const c = tr(0, 0.5, 0), cb = tr(0, -0.5, 0);
    for (let i = 0; i < segs; i += 2) {
      const a = P[i], b = P[i + 1], d = P[Math.min(i + 2, segs)];
      const A = tr(a[0], 0.5, a[1]), B = tr(b[0], 0.5, b[1]), D = tr(d[0], 0.5, d[1]);
      const uv = (p) => [p[0] + 0.5, p[1] + 0.5];
      // tampa superior (quad em leque c,D,B,A)
      batch.quad([c[0], c[1], c[2], D[0], D[1], D[2], B[0], B[1], B[2], A[0], A[1], A[2]], 0, 0, 1, 1, texTop, light[0], light[1], light[2], tint[0], tint[1], tint[2], em);
      const A2 = tr(a[0], -0.5, a[1]), B2 = tr(b[0], -0.5, b[1]), D2 = tr(d[0], -0.5, d[1]);
      batch.quad([cb[0], cb[1], cb[2], A2[0], A2[1], A2[2], B2[0], B2[1], B2[2], D2[0], D2[1], D2[2]], 0, 0, 1, 1, texTop, light[0] * 0.5, light[1] * 0.5, light[2] * 0.5, tint[0], tint[1], tint[2], em);
    }
  }
}
// esfera low-poly (raio 0.5 em espaço local)
function emitSphere(batch, M, segs, rings, tex, light, tint = [1, 1, 1], em = 0) {
  const P = (i, j) => {
    const th = j / rings * Math.PI, ph = i / segs * TAU;
    return M34.apply(M, Math.sin(th) * Math.cos(ph) * 0.5, Math.cos(th) * 0.5, Math.sin(th) * Math.sin(ph) * 0.5);
  };
  for (let j = 0; j < rings; j++) for (let i = 0; i < segs; i++) {
    const a = P(i, j + 1), b = P(i + 1, j + 1), c = P(i + 1, j), d = P(i, j);
    const ny = Math.cos((j + 0.5) / rings * Math.PI);
    const s = 0.72 + 0.28 * ny;
    batch.quad([...b, ...a, ...d, ...c], (i + 1) / segs * 2, j / rings, i / segs * 2, (j + 1) / rings, tex, light[0] * s, light[1] * s, light[2] * s, tint[0], tint[1], tint[2], em);
  }
}
// billboard voltado para a câmera
function emitBillboard(batch, cam, x, y, z, w, h, rot, layer, light, tint, em = 1, upright = false) {
  let rx = cam.r[0], ry = cam.r[1], rz = cam.r[2], ux = cam.u[0], uy = cam.u[1], uz = cam.u[2];
  if (upright) { const l = Math.hypot(cam.f[0], cam.f[2]) || 1; rx = -cam.f[2] / l; ry = 0; rz = cam.f[0] / l; ux = 0; uy = 1; uz = 0; }
  if (rot) {
    const c = Math.cos(rot), s = Math.sin(rot);
    const nrx = rx * c + ux * s, nry = ry * c + uy * s, nrz = rz * c + uz * s;
    const nux = -rx * s + ux * c, nuy = -ry * s + uy * c, nuz = -rz * s + uz * c;
    rx = nrx; ry = nry; rz = nrz; ux = nux; uy = nuy; uz = nuz;
  }
  const hw = w / 2, hh = h / 2;
  _bp[0] = x - rx * hw - ux * hh; _bp[1] = y - ry * hw - uy * hh; _bp[2] = z - rz * hw - uz * hh;
  _bp[3] = x + rx * hw - ux * hh; _bp[4] = y + ry * hw - uy * hh; _bp[5] = z + rz * hw - uz * hh;
  _bp[6] = x + rx * hw + ux * hh; _bp[7] = y + ry * hw + uy * hh; _bp[8] = z + rz * hw + uz * hh;
  _bp[9] = x - rx * hw + ux * hh; _bp[10] = y - ry * hw + uy * hh; _bp[11] = z - rz * hw + uz * hh;
  batch.quad(_bp, 0, 0, 1, 1, layer, light[0], light[1], light[2], tint[0], tint[1], tint[2], em);
}
// quad plano orientado por normal (decalques)
function emitDecal(batch, x, y, z, nx, ny, nz, size, rot, layer, light, tint) {
  let tx, ty, tz;
  if (Math.abs(ny) < 0.9) { tx = -nz; ty = 0; tz = nx; } else { tx = 1; ty = 0; tz = 0; }
  const tl = Math.hypot(tx, ty, tz); tx /= tl; ty /= tl; tz /= tl;
  let bx = ny * tz - nz * ty, by = nz * tx - nx * tz, bz = nx * ty - ny * tx;
  const c = Math.cos(rot), s = Math.sin(rot);
  const rx = tx * c + bx * s, ry = ty * c + by * s, rz = tz * c + bz * s;
  const ux = -tx * s + bx * c, uy = -ty * s + by * c, uz = -tz * s + bz * c;
  // garantir CCW visto pela normal: cross(R,U) deve = n
  const cxn = ry * uz - rz * uy, cyn = rz * ux - rx * uz, czn = rx * uy - ry * ux;
  const flip = (cxn * nx + cyn * ny + czn * nz) < 0 ? -1 : 1;
  const h = size / 2, o = 0.012;
  const px = x + nx * o, py = y + ny * o, pz = z + nz * o;
  const R0 = rx * h * flip, R1 = ry * h * flip, R2 = rz * h * flip, U0 = ux * h, U1 = uy * h, U2 = uz * h;
  _bp[0] = px - R0 - U0; _bp[1] = py - R1 - U1; _bp[2] = pz - R2 - U2;
  _bp[3] = px + R0 - U0; _bp[4] = py + R1 - U1; _bp[5] = pz + R2 - U2;
  _bp[6] = px + R0 + U0; _bp[7] = py + R1 + U1; _bp[8] = pz + R2 + U2;
  _bp[9] = px - R0 + U0; _bp[10] = py - R1 + U1; _bp[11] = pz - R2 + U2;
  batch.quad(_bp, 0, 0, 1, 1, layer, light[0], light[1], light[2], tint[0], tint[1], tint[2], 0);
}

// ---------------------------------------------------------------------------
// Modelo hierárquico
// ---------------------------------------------------------------------------
// tex spec: string | {px,nx,py,ny,pz,nz, front, back, top, bottom, left, right, side, o}
// strings começando com '$' são resolvidas pelo "look" da instância
function resolveTex(spec, look) {
  const res = (s) => {
    if (s === undefined || s === null) return undefined;
    if (typeof s === 'number') return s;
    if (s[0] === '$') s = look[s.slice(1)];
    return T[s] === undefined ? -1 : T[s];
  };
  if (typeof spec === 'string') { const l = res(spec); return [l, l, l, l, l, l]; }
  const o = spec.o;
  const side = spec.side !== undefined ? spec.side : o;
  return [
    res(spec.px !== undefined ? spec.px : spec.right !== undefined ? spec.right : side),
    res(spec.nx !== undefined ? spec.nx : spec.left !== undefined ? spec.left : side),
    res(spec.py !== undefined ? spec.py : spec.top !== undefined ? spec.top : o),
    res(spec.ny !== undefined ? spec.ny : spec.bottom !== undefined ? spec.bottom : o),
    res(spec.pz !== undefined ? spec.pz : spec.back !== undefined ? spec.back : side),
    res(spec.nz !== undefined ? spec.nz : spec.front !== undefined ? spec.front : side),
  ];
}

class Model {
  constructor(parts) {
    this.parts = parts;
    this.index = {};
    parts.forEach((p, i) => { this.index[p.n] = i; });
  }
  // pose: {nome: [rx, ry, rz, ox, oy, oz]}; retorna matrizes (para anexos)
  emit(batch, root, pose, look, light, opts = {}) {
    const mats = this._mats || (this._mats = new Array(this.parts.length));
    const tint1 = [1, 1, 1];
    for (let i = 0; i < this.parts.length; i++) {
      const p = this.parts[i];
      const parent = p.p ? mats[this.index[p.p]] : root;
      const q = pose[p.n];
      let m = M34.mul(parent, M34.trans(p.pivot[0], p.pivot[1], p.pivot[2]));
      if (q) {
        if (q[3] || q[4] || q[5]) m = M34.mul(m, M34.trans(q[3] || 0, q[4] || 0, q[5] || 0));
        if (q[0] || q[1] || q[2]) m = M34.mul(m, M34.rotYXZ(q[1] || 0, q[0] || 0, q[2] || 0));
      }
      mats[i] = m;
      if (!p.box || (opts.hide && opts.hide[p.n])) continue;
      if (p.cond && !look[p.cond]) continue;
      const texKey = p._texKey || (p._texKey = {});
      const lk = look._id || '';
      let tex = texKey[lk];
      if (!tex) tex = texKey[lk] = resolveTex(p.tex, look);
      let tint = p.tint ? (typeof p.tint === 'string' ? look[p.tint] || tint1 : p.tint) : tint1;
      if (opts.flash) tint = [1, 1, 1];
      const B = M34.mul(m, [p.box[0], 0, 0, p.off[0], 0, p.box[1], 0, p.off[1], 0, 0, p.box[2], p.off[2]]);
      emitBox(batch, B, tex, light, tint, opts.flash ? 0.7 : (p.em || opts.em || 0));
    }
    return mats;
  }
  mat(name) { return this._mats[this.index[name]]; }
}

// Humanoide base (1.85 m). Frente = -Z.
function humanoidParts(extra = []) {
  return [
    { n: 'hips', p: null, pivot: [0, 0.92, 0] },
    { n: 'torso', p: 'hips', pivot: [0, 0, 0], box: [0.52, 0.64, 0.28], off: [0, 0.32, 0], tex: { front: '$shirtF', back: '$shirtB', o: '$shirtS' }, tint: 'shirtTint' },
    { n: 'head', p: 'torso', pivot: [0, 0.64, 0], box: [0.3, 0.32, 0.3], off: [0, 0.17, 0], tex: { front: '$face', top: '$hairTex', back: '$hairTex', o: '$headSide' }, tint: 'skin' },
    { n: 'cap', p: 'head', pivot: [0, 0.33, 0], box: [0.33, 0.09, 0.33], off: [0, 0, 0], tex: 'cap', cond: 'cap' },
    { n: 'brim', p: 'head', pivot: [0, 0.3, -0.2], box: [0.3, 0.03, 0.16], off: [0, 0, 0], tex: 'cap', cond: 'cap' },
    { n: 'armR', p: 'torso', pivot: [0.34, 0.58, 0], box: [0.16, 0.34, 0.17], off: [0, -0.15, 0], tex: '$sleeve', tint: 'sleeveTint' },
    { n: 'foreR', p: 'armR', pivot: [0, -0.32, 0], box: [0.14, 0.32, 0.15], off: [0, -0.15, 0], tex: 'skin', tint: 'skin' },
    { n: 'handR', p: 'foreR', pivot: [0, -0.32, 0] },
    { n: 'armL', p: 'torso', pivot: [-0.34, 0.58, 0], box: [0.16, 0.34, 0.17], off: [0, -0.15, 0], tex: '$sleeve', tint: 'sleeveTint' },
    { n: 'foreL', p: 'armL', pivot: [0, -0.32, 0], box: [0.14, 0.32, 0.15], off: [0, -0.15, 0], tex: 'skin', tint: 'skin' },
    { n: 'handL', p: 'foreL', pivot: [0, -0.32, 0] },
    { n: 'legR', p: 'hips', pivot: [0.13, 0, 0], box: [0.21, 0.48, 0.23], off: [0, -0.23, 0], tex: '$pants' },
    { n: 'shinR', p: 'legR', pivot: [0, -0.46, 0], box: [0.19, 0.42, 0.21], off: [0, -0.2, 0], tex: '$shins', tint: 'shinTint' },
    { n: 'footR', p: 'shinR', pivot: [0, -0.41, 0], box: [0.2, 0.1, 0.32], off: [0, -0.02, -0.05], tex: 'shoes' },
    { n: 'legL', p: 'hips', pivot: [-0.13, 0, 0], box: [0.21, 0.48, 0.23], off: [0, -0.23, 0], tex: '$pants' },
    { n: 'shinL', p: 'legL', pivot: [0, -0.46, 0], box: [0.19, 0.42, 0.21], off: [0, -0.2, 0], tex: '$shins', tint: 'shinTint' },
    { n: 'footL', p: 'shinL', pivot: [0, -0.41, 0], box: [0.2, 0.1, 0.32], off: [0, -0.02, -0.05], tex: 'shoes' },
  ].concat(extra);
}
const MODELS = {};
function buildModels() {
  MODELS.human = new Model(humanoidParts([
    // armas nas mãos (condicionais)
    { n: 'stick', p: 'handR', pivot: [0, -0.02, 0], box: [0.06, 0.06, 0.85], off: [0, 0, -0.3], tex: 'wood', cond: 'stick' },
    { n: 'bottle', p: 'handR', pivot: [0, -0.04, 0], box: [0.08, 0.2, 0.08], off: [0, -0.02, 0], tex: 'glass_green', cond: 'bottle' },
    { n: 'tube', p: 'torso', pivot: [0.12, 0.42, -0.25], box: [0.13, 0.13, 0.85], off: [0, 0, -0.1], tex: 'pvc', tint: [0.9, 0.3, 0.3], cond: 'tube' },
    { n: 'tubeTip', p: 'tube', pivot: [0, 0, -0.55], box: [0.09, 0.09, 0.16], off: [0, 0, 0], tex: 'rojao_paper', cond: 'tube' },
  ]));
  MODELS.tiger = new Model(humanoidParts([
    { n: 'earL', p: 'head', pivot: [-0.11, 0.34, 0.02], box: [0.1, 0.1, 0.06], off: [0, 0, 0], tex: 'tiger_fur' },
    { n: 'earR', p: 'head', pivot: [0.11, 0.34, 0.02], box: [0.1, 0.1, 0.06], off: [0, 0, 0], tex: 'tiger_fur' },
    { n: 'snout', p: 'head', pivot: [0, 0.1, -0.17], box: [0.16, 0.1, 0.08], off: [0, 0, 0], tex: { front: 'tiger_belly', o: 'tiger_belly' } },
    { n: 'tail1', p: 'hips', pivot: [0, 0.05, 0.14], box: [0.08, 0.08, 0.4], off: [0, 0, 0.2], tex: 'tiger_fur' },
    { n: 'tail2', p: 'tail1', pivot: [0, 0, 0.4], box: [0.07, 0.07, 0.35], off: [0, 0, 0.17], tex: 'tiger_fur' },
  ]));
}
// "looks" de torcedores
const SKIN_TONES = [[1.0, 0.8, 0.64], [0.88, 0.64, 0.46], [0.66, 0.46, 0.32], [0.46, 0.31, 0.22]];
const HAIR_TINTS = [[0.4, 0.3, 0.25], [0.9, 0.9, 0.9], [0.6, 0.5, 0.3]];
let _lookId = 0;
function makeLook(type) {
  const L = { _id: 'L' + (++_lookId) };
  L.skin = choice(SKIN_TONES);
  L.shirtF = choice(['shirt_vila', 'shirt_vila', 'shirt_vila2']);
  L.shirtB = L.shirtF === 'shirt_vila' ? 'shirt_back' : 'shirt_vila2';
  L.shirtS = L.shirtF === 'shirt_vila' ? 'shirt_vila' : 'shirt_vila2';
  L.sleeve = L.shirtS;
  L.face = choice(['face_vila', 'face_bandana', 'face_beard']);
  L.hairTex = 'hair';
  L.headSide = 'skin';
  L.pants = choice(['jeans', 'jeans', 'shorts']);
  L.shins = L.pants === 'shorts' ? 'skin' : L.pants;
  L.shinTint = L.pants === 'shorts' ? L.skin : null;
  L.cap = Math.random() < 0.4;
  L.shirtTint = null; L.sleeveTint = null;
  if (type === 'vileiro') L.stick = true;
  if (type === 'arremessador') L.bottle = true;
  if (type === 'rojoeiro') { L.tube = true; L.face = 'face_bandana'; }
  if (type === 'brutamonte') {
    L.shirtF = L.shirtB = L.shirtS = 'torso_skin'; L.shirtTint = L.skin;
    L.sleeve = 'skin'; L.sleeveTint = L.skin; L.pants = 'shorts'; L.shins = 'skin'; L.shinTint = L.skin;
    L.cap = true; L.face = choice(['face_vila', 'face_beard']);
  }
  if (type === 'tigrao') {
    L.shirtF = 'tiger_belly'; L.shirtB = 'tiger_fur'; L.shirtS = 'tiger_fur'; L.sleeve = 'tiger_fur';
    L.face = 'tiger_face'; L.hairTex = 'tiger_fur'; L.headSide = 'tiger_fur'; L.pants = 'tiger_fur'; L.shins = 'tiger_fur';
    L.skin = [1, 1, 1]; L.cap = false; L.shinTint = null;
  }
  // skin nas mãos do tigre = pelo
  return L;
}

// ---------------------------------------------------------------------------
// Itens (modelos simples: lista de caixas)
// ---------------------------------------------------------------------------
const ITEM_MODELS = {
  pamonha: [{ s: [0.36, 0.13, 0.2], o: [0, 0, 0], t: 'pamonha' }, { s: [0.06, 0.15, 0.22], o: [0.1, 0, 0], t: 'white', tint: [0.9, 0.85, 0.7] }],
  pequi: [{ s: [0.15, 0.15, 0.15], o: [0, 0, 0], t: 'pequi' }, { s: [0.13, 0.13, 0.13], o: [0.14, -0.02, 0.05], t: 'pequi' }, { s: [0.12, 0.12, 0.12], o: [-0.08, -0.03, 0.12], t: 'pequi' }],
  empadao: [{ s: [0.5, 0.22, 0.5], o: [0, 0, 0], t: { top: 'empadao', o: 'metal' }, tint: [1, 1, 1] }],
  manto: [{ s: [0.5, 0.6, 0.08], o: [0, 0, 0], t: { front: 'manto', back: 'manto', o: 'sleeve_fjg' } }, { s: [0.2, 0.18, 0.08], o: [0.33, 0.18, 0], t: 'sleeve_fjg' }, { s: [0.2, 0.18, 0.08], o: [-0.33, 0.18, 0], t: 'sleeve_fjg' }],
  camisa: [{ s: [0.4, 0.46, 0.06], o: [0, 0, 0], t: { front: 'manto', back: 'manto', o: 'sleeve_fjg' }, tint: [0.8, 1, 0.8] }],
  bullets: [{ s: [0.3, 0.18, 0.2], o: [0, 0, 0], t: { front: 'ammo_box', back: 'ammo_box', o: 'metal_dark' } }],
  bulletsBig: [{ s: [0.5, 0.26, 0.3], o: [0, 0, 0], t: { front: 'ammo_box', back: 'ammo_box', o: 'metal_dark' } }],
  shells: [{ s: [0.3, 0.16, 0.2], o: [0, 0, 0], t: { front: 'shell_box', back: 'shell_box', o: 'shell_box' } }],
  shellsBig: [{ s: [0.46, 0.22, 0.3], o: [0, 0, 0], t: { front: 'shell_box', back: 'shell_box', o: 'shell_box' } }],
  rockets: [{ s: [0.44, 0.22, 0.28], o: [0, 0, 0], t: { front: 'rocket_box', back: 'rocket_box', o: 'metal_dark' } }],
  key_green: [{ s: [0.1, 0.1, 0.04], o: [0, 0.12, 0], t: 'key_green', em: 0.6 }, { s: [0.04, 0.26, 0.04], o: [0, -0.05, 0], t: 'key_green', em: 0.6 }, { s: [0.08, 0.04, 0.04], o: [0.05, -0.14, 0], t: 'key_green', em: 0.6 }, { s: [0.06, 0.04, 0.04], o: [0.04, -0.07, 0], t: 'key_green', em: 0.6 }],
  key_white: [{ s: [0.1, 0.1, 0.04], o: [0, 0.12, 0], t: 'key_white', em: 0.6 }, { s: [0.04, 0.26, 0.04], o: [0, -0.05, 0], t: 'key_white', em: 0.6 }, { s: [0.08, 0.04, 0.04], o: [0.05, -0.14, 0], t: 'key_white', em: 0.6 }, { s: [0.06, 0.04, 0.04], o: [0.04, -0.07, 0], t: 'key_white', em: 0.6 }],
  // armas no chão
  w_pistol: [{ s: [0.05, 0.05, 0.22], o: [0, 0.03, -0.04], t: 'gun_metal' }, { s: [0.04, 0.12, 0.06], o: [0, -0.04, 0.05], t: 'gun_metal' }],
  w_shotgun: [{ s: [0.05, 0.05, 0.75], o: [0, 0.03, -0.2], t: 'gun_metal' }, { s: [0.07, 0.08, 0.2], o: [0, 0, 0.1], t: 'gun_metal' }, { s: [0.07, 0.06, 0.16], o: [0, -0.02, -0.2], t: 'gun_wood' }, { s: [0.06, 0.1, 0.32], o: [0, -0.04, 0.35], t: 'gun_wood' }],
  w_ssg: [{ s: [0.1, 0.05, 0.6], o: [0, 0.03, -0.2], t: 'gun_metal' }, { s: [0.09, 0.08, 0.16], o: [0, 0, 0.14], t: 'gun_metal' }, { s: [0.08, 0.06, 0.22], o: [0, -0.02, -0.1], t: 'gun_wood' }, { s: [0.07, 0.11, 0.34], o: [0, -0.05, 0.36], t: 'gun_wood' }],
  w_rifle: [{ s: [0.06, 0.1, 0.4], o: [0, 0, 0], t: 'gun_metal' }, { s: [0.035, 0.035, 0.3], o: [0, 0.02, -0.33], t: 'gun_metal' }, { s: [0.05, 0.16, 0.07], o: [0, -0.12, -0.08], t: 'gun_metal' }, { s: [0.05, 0.1, 0.25], o: [0, -0.02, 0.3], t: 'gun_wood' }],
  w_rocket: [{ s: [0.15, 0.15, 0.9], o: [0, 0, 0], t: 'pvc' }, { s: [0.1, 0.1, 0.16], o: [0, 0, -0.5], t: 'rojao_paper' }, { s: [0.05, 0.14, 0.06], o: [0, -0.12, 0.05], t: 'gun_metal' }],
};
function emitItemModel(batch, M, name, light) {
  const list = ITEM_MODELS[name];
  if (!list) return;
  for (const b of list) {
    if (!b._tex) b._tex = resolveTex(b.t, {});
    emitPart(batch, M, b.o[0], b.o[1], b.o[2], b.s[0], b.s[1], b.s[2], b._tex, light, b.tint || [1, 1, 1], b.em || 0);
  }
}
