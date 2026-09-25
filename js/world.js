'use strict';
// ---------------------------------------------------------------------------
// Mundo: caixas (AABB) estáticas, grade espacial, raycast, colisão de atores,
// "bake" de iluminação por vértice (com sombras e AO), grade de navegação 2.5D
// e sondas de luz para entidades.
// ---------------------------------------------------------------------------
const F_SOLID = 1, F_SHOOT = 2, F_SHADOW = 4, F_OCCL = 8;
const FACES = [
  { n: [1, 0, 0], R: [0, 0, -1], U: [0, 1, 0] },
  { n: [-1, 0, 0], R: [0, 0, 1], U: [0, 1, 0] },
  { n: [0, 1, 0], R: [1, 0, 0], U: [0, 0, -1] },
  { n: [0, -1, 0], R: [1, 0, 0], U: [0, 0, 1] },
  { n: [0, 0, 1], R: [1, 0, 0], U: [0, 1, 0] },
  { n: [0, 0, -1], R: [-1, 0, 0], U: [0, 1, 0] },
];
const FACE_KEYS = ['px', 'nx', 'py', 'ny', 'pz', 'nz'];
const NAV_CLIMB = 0.62, NAV_DROP = 6.0;

// hemisfério para AO/céu (y = ao longo da normal), pesos iguais
const HEMI = (() => {
  const dirs = [[0, 1, 0]];
  const ring = 7;
  for (let i = 0; i < ring; i++) {
    const a = i / ring * TAU, el = 40 * DEG;
    dirs.push([Math.cos(a) * Math.cos(el), Math.sin(el), Math.sin(a) * Math.cos(el)]);
  }
  for (let i = 0; i < 4; i++) {
    const a = (i + 0.5) / 4 * TAU, el = 12 * DEG;
    dirs.push([Math.cos(a) * Math.cos(el), Math.sin(el), Math.sin(a) * Math.cos(el)]);
  }
  return dirs;
})();

class World {
  constructor() {
    this.boxes = [];
    this.quads = [];   // quads decorativos estáticos
    this.lights = [];  // luzes estáticas (assadas)
    this.dyn = [];     // sólidos dinâmicos (portas, botijões)
    this.stamp = 1;
    this.cs = 4;       // tamanho da célula da grade
    this.env = {
      skyAmb: [0.13, 0.15, 0.21], minAmb: [0.035, 0.035, 0.045],
      moonDir: V3.norm([0.45, 0.75, 0.35]), moonCol: [0.10, 0.12, 0.17],
      fog: [0.055, 0.06, 0.08], fogD: 0.0125,
    };
    this.SUB = 1.25;
    this._hits = [];
  }
  addBox(b) {
    b.id = this.boxes.length; b.stamp = 0;
    this.boxes.push(b);
    return b;
  }
  // ---------------- grade espacial ----------------
  buildGrid() {
    let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
    for (const b of this.boxes) { x0 = Math.min(x0, b.x0); z0 = Math.min(z0, b.z0); x1 = Math.max(x1, b.x1); z1 = Math.max(z1, b.z1); }
    this.gx0 = Math.floor(x0) - 8; this.gz0 = Math.floor(z0) - 8;
    this.gw = Math.ceil((x1 - this.gx0 + 8) / this.cs); this.gh = Math.ceil((z1 - this.gz0 + 8) / this.cs);
    this.cells = new Array(this.gw * this.gh);
    for (let i = 0; i < this.cells.length; i++) this.cells[i] = [];
    for (const b of this.boxes) this.insertGrid(b);
  }
  insertGrid(b) {
    const cs = this.cs;
    const ax = clamp(Math.floor((b.x0 - this.gx0) / cs), 0, this.gw - 1), bx = clamp(Math.floor((b.x1 - this.gx0) / cs), 0, this.gw - 1);
    const az = clamp(Math.floor((b.z0 - this.gz0) / cs), 0, this.gh - 1), bz = clamp(Math.floor((b.z1 - this.gz0) / cs), 0, this.gh - 1);
    for (let z = az; z <= bz; z++) for (let x = ax; x <= bx; x++) this.cells[z * this.gw + x].push(b);
  }
  // caixas que sobrepõem um AABB (estrito), incluindo dinâmicas ativas
  overlaps(x0, y0, z0, x1, y1, z1, mask, out) {
    out.length = 0;
    const st = ++this.stamp, cs = this.cs, e = 1e-4;
    const ax = clamp(Math.floor((x0 - this.gx0) / cs), 0, this.gw - 1), bx = clamp(Math.floor((x1 - this.gx0) / cs), 0, this.gw - 1);
    const az = clamp(Math.floor((z0 - this.gz0) / cs), 0, this.gh - 1), bz = clamp(Math.floor((z1 - this.gz0) / cs), 0, this.gh - 1);
    for (let z = az; z <= bz; z++) for (let x = ax; x <= bx; x++) {
      const cell = this.cells[z * this.gw + x];
      for (let i = 0; i < cell.length; i++) {
        const b = cell[i];
        if (b.stamp === st) continue;
        b.stamp = st;
        if (!(b.flags & mask)) continue;
        if (b.x0 < x1 - e && b.x1 > x0 + e && b.y0 < y1 - e && b.y1 > y0 + e && b.z0 < z1 - e && b.z1 > z0 + e) out.push(b);
      }
    }
    for (const b of this.dyn) {
      if (!b.active || !(b.flags & mask)) continue;
      if (b.x0 < x1 - e && b.x1 > x0 + e && b.y0 < y1 - e && b.y1 > y0 + e && b.z0 < z1 - e && b.z1 > z0 + e) out.push(b);
    }
    return out;
  }
  // ---------------- raycast ----------------
  // retorna distância do primeiro impacto (ou Infinity). Preenche this.hit {t,nx,ny,nz,box}
  raycast(ox, oy, oz, dx, dy, dz, maxT, mask, anyHit = false, useDyn = true) {
    const hit = this.hit || (this.hit = { t: Infinity, nx: 0, ny: 0, nz: 0, box: null });
    hit.t = Infinity; hit.box = null;
    let best = maxT;
    const st = ++this.stamp, cs = this.cs;
    const idx = 1 / (Math.abs(dx) < 1e-9 ? 1e-9 : dx), idy = 1 / (Math.abs(dy) < 1e-9 ? 1e-9 : dy), idz = 1 / (Math.abs(dz) < 1e-9 ? 1e-9 : dz);
    const test = (b) => {
      let t1 = (b.x0 - ox) * idx, t2 = (b.x1 - ox) * idx;
      let tmin = Math.min(t1, t2), tmax = Math.max(t1, t2), ax = 0;
      t1 = (b.y0 - oy) * idy; t2 = (b.y1 - oy) * idy;
      let ymin = Math.min(t1, t2), ymax = Math.max(t1, t2);
      if (ymin > tmin) { tmin = ymin; ax = 1; }
      if (ymax < tmax) tmax = ymax;
      t1 = (b.z0 - oz) * idz; t2 = (b.z1 - oz) * idz;
      let zmin = Math.min(t1, t2), zmax = Math.max(t1, t2);
      if (zmin > tmin) { tmin = zmin; ax = 2; }
      if (zmax < tmax) tmax = zmax;
      if (tmax <= Math.max(tmin, 0) + 1e-6) return false;
      const t = Math.max(tmin, 0);
      if (t < best) {
        best = t; hit.t = t; hit.box = b;
        hit.nx = ax === 0 ? -Math.sign(dx) : 0; hit.ny = ax === 1 ? -Math.sign(dy) : 0; hit.nz = ax === 2 ? -Math.sign(dz) : 0;
        if (tmin < 0) { hit.nx = -dx; hit.ny = -dy; hit.nz = -dz; }
        return true;
      }
      return false;
    };
    if (useDyn) for (const b of this.dyn) { if (b.active && (b.flags & mask)) { if (test(b) && anyHit) return best; } }
    // DDA 2D em XZ
    let cx = Math.floor((ox - this.gx0) / cs), cz = Math.floor((oz - this.gz0) / cs);
    const stepX = dx > 0 ? 1 : -1, stepZ = dz > 0 ? 1 : -1;
    const tdx = Math.abs(cs * idx), tdz = Math.abs(cs * idz);
    let tmx = dx > 0 ? ((this.gx0 + (cx + 1) * cs) - ox) * idx : ((this.gx0 + cx * cs) - ox) * idx;
    let tmz = dz > 0 ? ((this.gz0 + (cz + 1) * cs) - oz) * idz : ((this.gz0 + cz * cs) - oz) * idz;
    if (Math.abs(dx) < 1e-9) tmx = Infinity;
    if (Math.abs(dz) < 1e-9) tmz = Infinity;
    for (let guard = 0; guard < 400; guard++) {
      if (cx >= 0 && cz >= 0 && cx < this.gw && cz < this.gh) {
        const cell = this.cells[cz * this.gw + cx];
        for (let i = 0; i < cell.length; i++) {
          const b = cell[i];
          if (b.stamp === st) continue;
          b.stamp = st;
          if (!(b.flags & mask)) continue;
          if (test(b) && anyHit) return best;
        }
      } else if ((cx < 0 && stepX < 0) || (cz < 0 && stepZ < 0) || (cx >= this.gw && stepX > 0) || (cz >= this.gh && stepZ > 0)) break;
      const tn = Math.min(tmx, tmz);
      if (tn >= best || tn > maxT) break;
      if (tmx < tmz) { cx += stepX; tmx += tdx; } else { cz += stepZ; tmz += tdz; }
    }
    return hit.box ? hit.t : Infinity;
  }
  // ---------------- colisão de atores ----------------
  actorOverlaps(p, r, h, out) { return this.overlaps(p[0] - r, p[1], p[2] - r, p[0] + r, p[1] + h, p[2] + r, F_SOLID, out); }
  moveActor(e, dt, stepH) {
    e.stepped = 0; e.hitWall = false;
    const dx = e.vel[0] * dt, dy = e.vel[1] * dt, dz = e.vel[2] * dt;
    const steps = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dz)) / (e.r * 0.8)), Math.ceil(Math.abs(dy) / 0.4));
    const wasGround = e.onGround;
    for (let s = 0; s < steps; s++) {
      this.moveAxis(e, 0, dx / steps, stepH);
      this.moveAxis(e, 2, dz / steps, stepH);
    }
    // grudar no chão ao descer degraus
    if (wasGround && e.vel[1] <= 0 && stepH > 0) {
      const p = e.pos, hs = this.overlaps(p[0] - e.r, p[1] - stepH, p[2] - e.r, p[0] + e.r, p[1] - 0.001, p[2] + e.r, F_SOLID, this._hits);
      if (hs.length) {
        let top = -Infinity;
        for (const b of hs) if (b.y1 <= p[1] + 0.01) top = Math.max(top, b.y1);
        if (top > -Infinity && top < p[1]) { e.stepped = top - p[1]; p[1] = top; }
      }
    }
    e.onGround = false;
    for (let s = 0; s < steps; s++) this.moveAxis(e, 1, dy / steps, 0);
    // se não estava caindo, confirmar chão logo abaixo
    if (!e.onGround && e.vel[1] <= 0) {
      const p = e.pos, hs = this.overlaps(p[0] - e.r, p[1] - 0.02, p[2] - e.r, p[0] + e.r, p[1] - 0.0005, p[2] + e.r, F_SOLID, this._hits);
      if (hs.length) e.onGround = true;
    }
  }
  moveAxis(e, axis, d, stepH) {
    if (d === 0) return;
    const p = e.pos, old = p[axis];
    p[axis] += d;
    const hs = this.actorOverlaps(p, e.r, e.h, this._hits);
    if (!hs.length) return;
    if (axis !== 1 && stepH > 0 && (e.onGround || e.stepAir)) {
      let top = -Infinity;
      for (const b of hs) top = Math.max(top, b.y1);
      const rise = top - p[1];
      if (rise > 0 && rise <= stepH) {
        const oy = p[1];
        p[1] = top + 0.001;
        if (!this.actorOverlaps(p, e.r, e.h, this._hits).length) { e.stepped += p[1] - oy; return; }
        p[1] = oy;
        this.actorOverlaps(p, e.r, e.h, this._hits);
      }
    }
    const list = this._hits;
    if (axis === 1) {
      if (d < 0) {
        let top = -Infinity; for (const b of list) top = Math.max(top, b.y1);
        p[1] = Math.min(old, top + 0.0002); e.onGround = true;
      } else {
        let bot = Infinity; for (const b of list) bot = Math.min(bot, b.y0);
        p[1] = Math.max(old, bot - e.h - 0.0002);
      }
      e.vel[1] = 0;
      return;
    }
    const r = e.r;
    let np;
    if (d > 0) { np = Infinity; for (const b of list) np = Math.min(np, (axis === 0 ? b.x0 : b.z0) - r - 0.0002); if (np < old) np = old; }
    else { np = -Infinity; for (const b of list) np = Math.max(np, (axis === 0 ? b.x1 : b.z1) + r + 0.0002); if (np > old) np = old; }
    p[axis] = np;
    if (this.actorOverlaps(p, e.r, e.h, this._hits).length) p[axis] = old;
    e.vel[axis] = 0; e.hitWall = true;
  }
  // ---------------- iluminação assada ----------------
  bakeLight(px, py, pz, nx, ny, nz, out) {
    const env = this.env;
    const ox = px + nx * 0.05, oy = py + ny * 0.05, oz = pz + nz * 0.05;
    // base tangente
    let tx, ty, tz;
    if (Math.abs(ny) < 0.9) { tx = -nz; ty = 0; tz = nx; } else { tx = 1; ty = 0; tz = 0; }
    const tl = Math.hypot(tx, ty, tz); tx /= tl; ty /= tl; tz /= tl;
    const bx = ny * tz - nz * ty, by = nz * tx - nx * tz, bz = nx * ty - ny * tx;
    let vis = 0, occ = 0;
    for (const h of HEMI) {
      const dx = tx * h[0] + nx * h[1] + bx * h[2], dy = ty * h[0] + ny * h[1] + by * h[2], dz = tz * h[0] + nz * h[1] + bz * h[2];
      const t = this.raycast(ox, oy, oz, dx, dy, dz, 28, F_SHADOW, false, false);
      if (t === Infinity) vis += dy > 0 ? 1 : 0.35; // horizonte conta menos
      if (t < 1.6) occ += 1 - t / 1.6;
    }
    vis /= HEMI.length; occ /= HEMI.length;
    const ao = 1 - 0.6 * occ;
    let r = env.skyAmb[0] * vis * ao + env.minAmb[0], g = env.skyAmb[1] * vis * ao + env.minAmb[1], b = env.skyAmb[2] * vis * ao + env.minAmb[2];
    // lua
    const md = env.moonDir, ml = nx * md[0] + ny * md[1] + nz * md[2];
    if (ml > 0 && this.raycast(ox, oy, oz, md[0], md[1], md[2], 90, F_SHADOW, true, false) === Infinity) {
      r += env.moonCol[0] * ml; g += env.moonCol[1] * ml; b += env.moonCol[2] * ml;
    }
    const aoL = 1 - 0.25 * occ;
    for (const L of this.lights) {
      const dx = L.x - ox, dy = L.y - oy, dz = L.z - oz;
      const d2 = dx * dx + dy * dy + dz * dz;
      if (d2 > L.r * L.r) continue;
      const d = Math.sqrt(d2) || 0.001;
      const nd = (nx * dx + ny * dy + nz * dz) / d;
      if (nd <= -0.05) continue;
      if (this.raycast(ox, oy, oz, dx / d, dy / d, dz / d, d - 0.2, F_SHADOW, true, false) !== Infinity) continue;
      let a = 1 - d / L.r; a = a * a * L.i * (0.3 + 0.7 * Math.max(nd, 0)) * aoL;
      r += L.cr * a; g += L.cg * a; b += L.cb * a;
    }
    out[0] = r; out[1] = g; out[2] = b;
    return out;
  }
  // luz omnidirecional num ponto (sondas)
  probeLight(px, py, pz) {
    const env = this.env;
    let vis = 0;
    for (const h of HEMI) {
      if (this.raycast(px, py, pz, h[0], h[1], h[2], 28, F_SHADOW, true, false) === Infinity) vis += h[1] > 0.5 ? 1 : 0.6;
    }
    vis /= HEMI.length;
    let r = env.skyAmb[0] * vis * 1.1 + env.minAmb[0] * 1.5, g = env.skyAmb[1] * vis * 1.1 + env.minAmb[1] * 1.5, b = env.skyAmb[2] * vis * 1.1 + env.minAmb[2] * 1.5;
    const md = env.moonDir;
    if (this.raycast(px, py, pz, md[0], md[1], md[2], 90, F_SHADOW, true, false) === Infinity) { r += env.moonCol[0] * 0.6; g += env.moonCol[1] * 0.6; b += env.moonCol[2] * 0.6; }
    for (const L of this.lights) {
      const dx = L.x - px, dy = L.y - py, dz = L.z - pz;
      const d2 = dx * dx + dy * dy + dz * dz;
      if (d2 > L.r * L.r) continue;
      const d = Math.sqrt(d2) || 0.001;
      if (this.raycast(px, py, pz, dx / d, dy / d, dz / d, d - 0.2, F_SHADOW, true, false) !== Infinity) continue;
      let a = 1 - d / L.r; a = a * a * L.i * 0.75;
      r += L.cr * a; g += L.cg * a; b += L.cb * a;
    }
    return [r, g, b];
  }
  buildProbes() {
    const cs = 2;
    const P = this.probes = { x0: this.nav.x0, z0: this.nav.z0, cs, w: Math.ceil(this.nav.w / cs) + 1, h: Math.ceil(this.nav.h / cs) + 1 };
    P.data = new Float32Array(P.w * P.h * 3);
    for (let j = 0; j < P.h; j++) for (let i = 0; i < P.w; i++) {
      const x = P.x0 + i * cs + 0.5, z = P.z0 + j * cs + 0.5;
      let fy = this.navFloorAt(x, z);
      if (!isFinite(fy) || fy > 30) fy = 0;
      const c = this.probeLight(x, fy + 1.1, z);
      const o = (j * P.w + i) * 3;
      P.data[o] = c[0]; P.data[o + 1] = c[1]; P.data[o + 2] = c[2];
    }
  }
  sampleProbe(x, z, out) {
    const P = this.probes;
    if (!P) { out[0] = out[1] = out[2] = 1; return out; }
    const fx = clamp((x - P.x0 - 0.5) / P.cs, 0, P.w - 1.001), fz = clamp((z - P.z0 - 0.5) / P.cs, 0, P.h - 1.001);
    const i = Math.floor(fx), j = Math.floor(fz), tx = fx - i, tz = fz - j;
    const d = P.data, w = P.w;
    for (let k = 0; k < 3; k++) {
      const a = d[(j * w + i) * 3 + k], b = d[(j * w + i + 1) * 3 + k], c = d[((j + 1) * w + i) * 3 + k], e = d[((j + 1) * w + i + 1) * 3 + k];
      out[k] = lerp(lerp(a, b, tx), lerp(c, e, tx), tz);
    }
    return out;
  }
  // ---------------- malha estática ----------------
  faceHidden(b, f, fy0, fy1) {
    const e = 1e-3;
    let qx0, qx1, qy0, qy1, qz0, qz1;
    // região imediatamente fora da face
    switch (f) {
      case 0: qx0 = b.x1; qx1 = b.x1 + 0.01; qy0 = fy0; qy1 = fy1; qz0 = b.z0; qz1 = b.z1; break;
      case 1: qx0 = b.x0 - 0.01; qx1 = b.x0; qy0 = fy0; qy1 = fy1; qz0 = b.z0; qz1 = b.z1; break;
      case 2: qx0 = b.x0; qx1 = b.x1; qy0 = b.y1; qy1 = b.y1 + 0.01; qz0 = b.z0; qz1 = b.z1; break;
      case 3: qx0 = b.x0; qx1 = b.x1; qy0 = b.y0 - 0.01; qy1 = b.y0; qz0 = b.z0; qz1 = b.z1; break;
      case 4: qx0 = b.x0; qx1 = b.x1; qy0 = fy0; qy1 = fy1; qz0 = b.z1; qz1 = b.z1 + 0.01; break;
      default: qx0 = b.x0; qx1 = b.x1; qy0 = fy0; qy1 = fy1; qz0 = b.z0 - 0.01; qz1 = b.z0; break;
    }
    const cs = this.cs;
    const ax = clamp(Math.floor((qx0 - this.gx0) / cs), 0, this.gw - 1), bx = clamp(Math.floor((qx1 - this.gx0) / cs), 0, this.gw - 1);
    const az = clamp(Math.floor((qz0 - this.gz0) / cs), 0, this.gh - 1), bz = clamp(Math.floor((qz1 - this.gz0) / cs), 0, this.gh - 1);
    for (let z = az; z <= bz; z++) for (let x = ax; x <= bx; x++) {
      for (const o of this.cells[z * this.gw + x]) {
        if (o === b || !(o.flags & F_OCCL)) continue;
        if (o.x0 <= qx0 + e && o.x1 >= qx1 - e && o.y0 <= qy0 + e && o.y1 >= qy1 - e && o.z0 <= qz0 + e && o.z1 >= qz1 - e) return true;
      }
    }
    return false;
  }
  buildMesh(progress) {
    let cap = 60000;
    let data = new Float32Array(cap * 4 * VSTRIDE);
    let nq = 0;
    const ensure = () => {
      if (nq < cap) return;
      cap *= 2;
      const nd = new Float32Array(cap * 4 * VSTRIDE); nd.set(data); data = nd;
    };
    const lt = [0, 0, 0];
    const pushV = (x, y, z, u, v, l, lr, lg, lb, t, em) => {
      const o = this._vo; this._vo += VSTRIDE;
      data[o] = x; data[o + 1] = y; data[o + 2] = z; data[o + 3] = u; data[o + 4] = v; data[o + 5] = l;
      data[o + 6] = lr; data[o + 7] = lg; data[o + 8] = lb; data[o + 9] = t[0]; data[o + 10] = t[1]; data[o + 11] = t[2]; data[o + 12] = em;
    };
    this._vo = 0;
    const SUB = this.SUB;
    for (const b of this.boxes) {
      if (!b.tex) continue;
      const hx = (b.x1 - b.x0) / 2, hy = (b.y1 - b.y0) / 2, hz = (b.z1 - b.z0) / 2;
      const cx = (b.x0 + b.x1) / 2, cy = (b.y0 + b.y1) / 2, cz = (b.z0 + b.z1) / 2;
      for (let f = 0; f < 6; f++) {
        const layer = b.tex[f];
        if (layer === undefined || layer < 0) continue;
        const F = FACES[f];
        let fy0 = b.y0, fy1 = b.y1;
        if (b.clip && b.clip[f] !== undefined && F.U[1] === 1) fy0 = Math.max(fy0, b.clip[f]);
        if (fy1 - fy0 < 0.001) continue;
        if (!b.noCull && this.faceHidden(b, f, fy0, fy1)) continue;
        const n = F.n, Rv = F.R, Uv = F.U;
        const hr = Math.abs(Rv[0]) * hx + Math.abs(Rv[1]) * hy + Math.abs(Rv[2]) * hz;
        let hu = Math.abs(Uv[0]) * hx + Math.abs(Uv[1]) * hy + Math.abs(Uv[2]) * hz;
        let fc = [cx + n[0] * hx, cy + n[1] * hy, cz + n[2] * hz];
        if (Uv[1] === 1) { fc[1] = (fy0 + fy1) / 2; hu = (fy1 - fy0) / 2; }
        const sub = b.sub || SUB;
        const nr = b.emis ? 1 : Math.max(1, Math.ceil(hr * 2 / sub)), nu = b.emis ? 1 : Math.max(1, Math.ceil(hu * 2 / sub));
        const tint = b.tintF ? b.tintF[f] || b.tint : b.tint;
        const em = b.emis || 0;
        const faceUV = b.faceUV && (b.faceUV === true || b.faceUV[f]);
        const su = b.su || 2, sv = b.sv || 2;
        // pontos da grade
        const pts = [];
        for (let j = 0; j <= nu; j++) for (let i = 0; i <= nr; i++) {
          const rr = -hr + 2 * hr * i / nr, uu = -hu + 2 * hu * j / nu;
          const x = fc[0] + Rv[0] * rr + Uv[0] * uu, y = fc[1] + Rv[1] * rr + Uv[1] * uu, z = fc[2] + Rv[2] * rr + Uv[2] * uu;
          let u, v;
          if (faceUV) { u = (i / nr) * (b.ru || 1); v = (1 - j / nu) * (b.rv || 1); }
          else { u = (x * Rv[0] + y * Rv[1] + z * Rv[2]) / su + (b.uo || 0); v = -(x * Uv[0] + y * Uv[1] + z * Uv[2]) / sv + (b.vo || 0); }
          if (em >= 1) { lt[0] = lt[1] = lt[2] = 1; }
          else this.bakeLight(x, y, z, n[0], n[1], n[2], lt);
          pts.push([x, y, z, u, v, lt[0], lt[1], lt[2]]);
        }
        for (let j = 0; j < nu; j++) for (let i = 0; i < nr; i++) {
          ensure();
          const A = pts[j * (nr + 1) + i], B = pts[j * (nr + 1) + i + 1], Cc = pts[(j + 1) * (nr + 1) + i + 1], D = pts[(j + 1) * (nr + 1) + i];
          for (const P of [A, B, Cc, D]) pushV(P[0], P[1], P[2], P[3], P[4], layer, P[5], P[6], P[7], tint, em);
          nq++;
        }
      }
    }
    // quads decorativos
    for (const q of this.quads) {
      const sides = q.twoSided ? 2 : 1;
      for (let s = 0; s < sides; s++) {
        ensure();
        const p = q.p;
        const order = s === 0 ? [0, 1, 2, 3] : [1, 0, 3, 2];
        const uvs = [[q.uv[0], q.uv[3]], [q.uv[2], q.uv[3]], [q.uv[2], q.uv[1]], [q.uv[0], q.uv[1]]];
        const n = s === 0 ? q.n : [-q.n[0], -q.n[1], -q.n[2]];
        for (const k of order) {
          const x = p[k * 3], y = p[k * 3 + 1], z = p[k * 3 + 2];
          if ((q.emis || 0) >= 1) { lt[0] = lt[1] = lt[2] = 1; } else this.bakeLight(x, y, z, n[0], n[1], n[2], lt);
          pushV(x, y, z, uvs[k][0], uvs[k][1], q.layer, lt[0], lt[1], lt[2], q.tint || [1, 1, 1], q.emis || 0);
        }
        nq++;
      }
    }
    return { data: data.subarray(0, nq * 4 * VSTRIDE), quads: nq };
  }
  // ---------------- navegação 2.5D ----------------
  buildNav(x0, z0, x1, z1) {
    const N = this.nav = { x0, z0, w: Math.ceil(x1 - x0), h: Math.ceil(z1 - z0) };
    const n = N.w * N.h;
    N.floor = new Float32Array(n); N.blocked = new Uint8Array(n); N.dist = new Uint16Array(n); N.queue = new Int32Array(n);
    const iv = [];
    for (let j = 0; j < N.h; j++) for (let i = 0; i < N.w; i++) {
      const cx = x0 + i, cz = z0 + j;
      const hs = this.overlaps(cx + 0.06, -20, cz + 0.06, cx + 0.94, 200, cz + 0.94, F_SOLID, this._hits);
      iv.length = 0;
      for (const b of hs) iv.push([b.y0, b.y1]);
      iv.sort((a, b) => a[0] - b[0]);
      // mescla
      const m = [];
      for (const it of iv) {
        if (m.length && it[0] <= m[m.length - 1][1] + 0.05) m[m.length - 1][1] = Math.max(m[m.length - 1][1], it[1]);
        else m.push([it[0], it[1]]);
      }
      let fl = NaN;
      for (let k = 0; k < m.length; k++) {
        const top = m[k][1], next = k + 1 < m.length ? m[k + 1][0] : Infinity;
        if (next - top >= 1.9) { fl = top; break; }
      }
      N.floor[j * N.w + i] = fl;
    }
  }
  navCell(x, z) {
    const N = this.nav;
    const i = Math.floor(x - N.x0), j = Math.floor(z - N.z0);
    if (i < 0 || j < 0 || i >= N.w || j >= N.h) return -1;
    return j * N.w + i;
  }
  navFloorAt(x, z) { const c = this.navCell(x, z); return c < 0 ? NaN : this.nav.floor[c]; }
  setNavBlocked(x0, z0, x1, z1, v) {
    const N = this.nav;
    for (let z = Math.floor(z0 - 0.5); z <= Math.ceil(z1 + 0.5); z++) for (let x = Math.floor(x0 - 0.5); x <= Math.ceil(x1 + 0.5); x++) {
      const c = this.navCell(x + 0.5, z + 0.5);
      if (c >= 0 && x + 1 > x0 - 0.3 && x < x1 + 0.3 && z + 1 > z0 - 0.3 && z < z1 + 0.3) N.blocked[c] = v ? 1 : 0;
    }
  }
  // BFS a partir do alvo (distâncias "até o jogador")
  navFlow(tx, ty, tz) {
    const N = this.nav, W = N.w, H = N.h;
    N.dist.fill(65535);
    let start = this.navCell(tx, tz);
    if (start < 0) return;
    const fl = N.floor;
    // se célula inválida (parede), procurar vizinha válida
    if (!(fl[start] <= ty + 1.2) || N.blocked[start]) {
      let found = -1;
      const si = start % W, sj = Math.floor(start / W);
      for (let r = 1; r <= 2 && found < 0; r++) for (let dj = -r; dj <= r && found < 0; dj++) for (let di = -r; di <= r; di++) {
        const i = si + di, j = sj + dj;
        if (i < 0 || j < 0 || i >= W || j >= H) continue;
        const c = j * W + i;
        if (fl[c] <= ty + 1.2 && !N.blocked[c]) { found = c; break; }
      }
      if (found < 0) return;
      start = found;
    }
    const q = N.queue; let qh = 0, qt = 0;
    q[qt++] = start; N.dist[start] = 0;
    const DI = [1, -1, 0, 0, 1, 1, -1, -1], DJ = [0, 0, 1, -1, 1, -1, 1, -1];
    while (qh < qt) {
      const c = q[qh++];
      const ci = c % W, cj = (c - ci) / W, cf = fl[c], cd = N.dist[c];
      if (cd > 500) continue;
      for (let k = 0; k < 8; k++) {
        const ni = ci + DI[k], nj = cj + DJ[k];
        if (ni < 0 || nj < 0 || ni >= W || nj >= H) continue;
        const nc = nj * W + ni;
        if (N.dist[nc] !== 65535 || N.blocked[nc]) continue;
        const nf = fl[nc];
        if (nf !== nf) continue; // NaN
        // movimento do vizinho (nc) para a célula atual (c)
        if (cf - nf > NAV_CLIMB || nf - cf > NAV_DROP) continue;
        if (k >= 4) {
          const a = cj * W + ni, b = nj * W + ci;
          if (N.blocked[a] || N.blocked[b] || !(Math.abs(fl[a] - cf) <= NAV_CLIMB) || !(Math.abs(fl[b] - cf) <= NAV_CLIMB)) continue;
        }
        N.dist[nc] = cd + 1;
        q[qt++] = nc;
      }
    }
  }
  // próximo ponto a seguir a partir de (x,y,z)
  navNext(x, y, z) {
    const N = this.nav, W = N.w;
    const c = this.navCell(x, z);
    if (c < 0) return null;
    const ci = c % W, cj = (c - ci) / W;
    let best = N.dist[c] === 65535 ? 65535 : N.dist[c], bc = -1;
    for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
      if (!di && !dj) continue;
      const ni = ci + di, nj = cj + dj;
      if (ni < 0 || nj < 0 || ni >= W || nj >= N.h) continue;
      const nc = nj * W + ni;
      const nf = N.floor[nc];
      if (nf !== nf || N.blocked[nc]) continue;
      if (nf - y > NAV_CLIMB + 0.1 || y - nf > NAV_DROP) continue;
      const dd = N.dist[nc] + (di && dj ? 0.4 : 0);
      if (dd < best) { best = dd; bc = nc; }
    }
    if (bc < 0) return null;
    const bi = bc % W, bj = (bc - bi) / W;
    return [N.x0 + bi + 0.5, N.z0 + bj + 0.5, best];
  }
}
