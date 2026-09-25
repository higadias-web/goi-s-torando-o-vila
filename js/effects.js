'use strict';
// ---------------------------------------------------------------------------
// Efeitos: partículas, projéteis, explosões, decalques, luzes dinâmicas,
// cápsulas, pedaços (gibs) e ondas de choque.
// ---------------------------------------------------------------------------
const FX = {
  parts: [], projs: [], decals: [], lights: [], debris: [], waves: [],
  decalMax: 220, partMax: 1800,
  reset() { this.parts.length = 0; this.projs.length = 0; this.decals.length = 0; this.lights.length = 0; this.debris.length = 0; this.waves.length = 0; },
  light(x, y, z, r, col, i, life, flicker = 0) { this.lights.push({ x, y, z, r, cr: col[0], cg: col[1], cb: col[2], i, i0: i, life, max: life, flicker }); },
  part(p) {
    if (this.parts.length >= this.partMax) this.parts.shift();
    p.max = p.life; p.rot = p.rot || 0; p.vr = p.vr || 0; p.drag = p.drag || 0; p.grav = p.grav || 0;
    p.size1 = p.size1 === undefined ? p.size : p.size1;
    if (!p.add && !p.em && !p.light) p.light = G.world.sampleProbe(p.x, p.z, [0, 0, 0]);
    this.parts.push(p);
    return p;
  },
  // ---------- spawners ----------
  sparks(x, y, z, n, col = [1, 0.85, 0.4], spd = 6) {
    for (let i = 0; i < n; i++) {
      this.part({ x, y, z, vx: rand(-1, 1) * spd, vy: rand(-0.3, 1.2) * spd, vz: rand(-1, 1) * spd, life: rand(0.15, 0.4), size: rand(0.06, 0.13), size1: 0.02, grav: 14, add: true, layer: T.spark, col, bright: 1.5 });
    }
  },
  dust(x, y, z, nx, ny, nz, n = 4, col = [0.55, 0.52, 0.48]) {
    for (let i = 0; i < n; i++) {
      const s = rand(1, 3);
      this.part({ x, y, z, vx: nx * s + rand(-0.8, 0.8), vy: ny * s + rand(-0.2, 1.2), vz: nz * s + rand(-0.8, 0.8), life: rand(0.3, 0.6), size: rand(0.12, 0.2), size1: rand(0.3, 0.5), grav: 1, drag: 3, layer: T.smoke, col });
    }
  },
  blood(x, y, z, dx, dy, dz, n = 8, spd = 4) {
    for (let i = 0; i < n; i++) {
      this.part({ x, y, z, vx: dx * spd * rand(0.3, 1) + rand(-1.5, 1.5), vy: dy * spd * rand(0.3, 1) + rand(0, 3), vz: dz * spd * rand(0.3, 1) + rand(-1.5, 1.5), life: rand(0.4, 0.9), size: rand(0.06, 0.14), grav: 18, layer: T.white, col: [0.55, 0.02, 0.03], blood: true });
    }
  },
  smoke(x, y, z, n = 1, col = [0.4, 0.4, 0.42], size = 0.6, life = 1.6, vy = 1.2) {
    for (let i = 0; i < n; i++) {
      this.part({ x: x + rand(-0.2, 0.2), y, z: z + rand(-0.2, 0.2), vx: rand(-0.4, 0.4), vy: vy * rand(0.6, 1.2), vz: rand(-0.4, 0.4), life: life * rand(0.7, 1.2), size: size * 0.6, size1: size * rand(1.4, 2.2), drag: 0.5, layer: T.smoke, col, rot: rand(0, TAU), vr: rand(-1, 1) });
    }
  },
  confetti(x, y, z, n, spread = 30) {
    for (let i = 0; i < n; i++) {
      const c = Math.random() < 0.5 ? [0.1, 0.75, 0.3] : [1, 1, 1];
      this.part({ x: x + rand(-spread, spread), y: y + rand(0, 6), z: z + rand(-spread * 0.7, spread * 0.7), vx: rand(-0.5, 0.5), vy: rand(-1.5, -0.8), vz: rand(-0.5, 0.5), life: rand(5, 9), size: 0.12, grav: 0, layer: T.white, col: c, em: 0.3, rot: rand(0, TAU), vr: rand(-6, 6), flutter: true });
    }
  },
  decal(x, y, z, nx, ny, nz, size, layer, tint = [1, 1, 1]) {
    const light = G.world.sampleProbe(x + nx * 0.5, z + nz * 0.5, [0, 0, 0]);
    if (this.decals.length >= this.decalMax) this.decals.shift();
    this.decals.push({ x, y, z, nx, ny, nz, size, rot: rand(0, TAU), layer, light, tint });
  },
  impact(x, y, z, nx, ny, nz, box) {
    const mat = box && box.mat;
    this.dust(x, y, z, nx, ny, nz, 3);
    if (Math.random() < 0.6) this.sparks(x, y, z, 2, [1, 0.8, 0.4], 3);
    if (box && box.tex && !box.dynamic) this.decal(x, y, z, nx, ny, nz, 0.16, T.bullet_hole);
    if (Math.random() < 0.25) AUDIO.play('ricochet', [x, y, z], 0.6);
  },
  muzzle(x, y, z, col = [1, 0.75, 0.35], r = 7, i = 2.2) { this.light(x, y, z, r, col, i, 0.07); },
  casing(x, y, z, vx, vy, vz, shell) {
    if (this.debris.length > 120) this.debris.shift();
    this.debris.push({ x, y, z, vx, vy, vz, life: 6, rx: rand(0, TAU), ry: rand(0, TAU), wx: rand(-20, 20), wy: rand(-20, 20), sx: shell ? 0.035 : 0.018, sy: shell ? 0.035 : 0.018, sz: shell ? 0.09 : 0.045, tex: shell ? T.shell_box : T.gun_metal_light, tint: shell ? [1, 0.3, 0.25] : [1, 0.8, 0.3], bounce: 0.35, snd: shell ? 1 : 0 });
  },
  gib(x, y, z, vx, vy, vz, sx, sy, sz, tex, tint) {
    if (this.debris.length > 120) this.debris.shift();
    this.debris.push({ x, y, z, vx, vy, vz, life: 12, rx: rand(0, TAU), ry: rand(0, TAU), wx: rand(-12, 12), wy: rand(-12, 12), sx, sy, sz, tex, tint: tint || [1, 1, 1], bounce: 0.3, bleed: 1.2, gib: true });
  },
  // ---------- explosão ----------
  explosion(x, y, z, radius, dmg, owner, opts = {}) {
    const big = radius > 3;
    AUDIO.play(big ? 'explosion' : 'explosion_small', [x, y, z]);
    this.light(x, y + 0.5, z, radius * 3.2, [1, 0.6, 0.25], big ? 3.5 : 2.2, 0.45);
    for (let i = 0; i < (big ? 22 : 10); i++) {
      const a = rand(0, TAU), el = rand(-0.3, 1.2), s = rand(2, radius * 2.2);
      this.part({ x, y, z, vx: Math.cos(a) * s * Math.cos(el), vy: Math.sin(el) * s + 1, vz: Math.sin(a) * s * Math.cos(el), life: rand(0.25, 0.55), size: radius * rand(0.25, 0.45), size1: radius * rand(0.6, 0.9), drag: 4, add: true, layer: T.fire, col: [1, rand(0.5, 0.8), 0.3], bright: 2.2, rot: rand(0, TAU), vr: rand(-3, 3) });
    }
    this.part({ x, y, z, vx: 0, vy: 0, vz: 0, life: 0.18, size: radius * 1.2, size1: radius * 2.4, add: true, layer: T.glow, col: [1, 0.7, 0.4], bright: 2.5 });
    this.sparks(x, y, z, big ? 24 : 12, opts.colorful ? choice([[0.3, 1, 0.4], [1, 1, 1], [1, 0.9, 0.3]]) : [1, 0.8, 0.35], 11);
    this.smoke(x, y + 0.3, z, big ? 8 : 4, [0.22, 0.21, 0.2], radius * 0.7, 2.2, 1.6);
    if (opts.colorful) for (let i = 0; i < 16; i++) {
      const c = choice([[0.2, 1, 0.3], [1, 1, 1], [1, 0.9, 0.2], [0.3, 0.6, 1]]);
      const a = rand(0, TAU), s = rand(4, 10);
      this.part({ x, y, z, vx: Math.cos(a) * s, vy: rand(2, 9), vz: Math.sin(a) * s, life: rand(0.5, 1.1), size: 0.14, size1: 0.04, grav: 9, add: true, layer: T.spark, col: c, bright: 2 });
    }
    // marca de queimado no chão
    const t = G.world.raycast(x, y + 0.2, z, 0, -1, 0, 2.5, F_SHOOT, false, false);
    if (t !== Infinity) this.decal(x, y + 0.2 - t, z, 0, 1, 0, radius * 0.9, T.scorch);
    G.shake(Math.max(0, 1 - V3.dist([x, y, z], G.player.pos) / (radius * 6)) * (big ? 0.9 : 0.5));
    G.radiusDamage(x, y, z, radius, dmg, owner, opts);
  },
  // ---------- projéteis ----------
  proj(p) { p.life = p.life || 6; p.rot = 0; p.trailT = 0; this.projs.push(p); return p; },
  updateProjs(dt) {
    const world = G.world;
    for (let i = this.projs.length - 1; i >= 0; i--) {
      const p = this.projs[i];
      p.life -= dt;
      p.vy -= (p.grav || 0) * dt;
      const sp = Math.hypot(p.vx, p.vy, p.vz), len = sp * dt;
      const dx = p.vx / sp, dy = p.vy / sp, dz = p.vz / sp;
      let bestT = world.raycast(p.x, p.y, p.z, dx, dy, dz, len + p.radius, F_SHOOT);
      let hitN = bestT !== Infinity ? [world.hit.nx, world.hit.ny, world.hit.nz] : null;
      let target = null;
      const tA = G.projActorHit(p, dx, dy, dz, len);
      if (tA && tA.t <= bestT + 0.01) { bestT = tA.t; target = tA.target; hitN = null; }
      if (bestT !== Infinity && bestT <= len + p.radius) {
        const hx = p.x + dx * Math.max(0, bestT - 0.05), hy = p.y + dy * Math.max(0, bestT - 0.05), hz = p.z + dz * Math.max(0, bestT - 0.05);
        this.projImpact(p, hx, hy, hz, hitN, target, [dx, dy, dz]);
        this.projs.splice(i, 1);
        continue;
      }
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      p.rot += dt * (p.spin || 0);
      // rastro
      p.trailT -= dt;
      if (p.trailT <= 0) {
        p.trailT = p.trailRate || 0.02;
        if (p.type === 'rojao' || p.type === 'rojao_e' || p.type === 'rojao_boss') {
          const c = p.type === 'rojao' ? choice([[0.3, 1, 0.4], [1, 1, 0.9], [1, 0.85, 0.3]]) : [1, rand(0.2, 0.5), 0.2];
          this.part({ x: p.x, y: p.y, z: p.z, vx: rand(-1, 1), vy: rand(-1, 1), vz: rand(-1, 1), life: rand(0.2, 0.45), size: 0.12, size1: 0.02, add: true, layer: T.spark, col: c, bright: 1.6, grav: 3 });
          if (Math.random() < 0.5) this.part({ x: p.x, y: p.y, z: p.z, vx: 0, vy: 0.5, vz: 0, life: 0.8, size: 0.15, size1: 0.45, drag: 1, layer: T.smoke, col: [0.5, 0.5, 0.52] });
        }
      }
      if (p.life <= 0) {
        if (p.splashR) this.explosion(p.x, p.y, p.z, p.splashR, p.splash, p.owner, { colorful: p.type === 'rojao', src: p.src });
        this.projs.splice(i, 1);
      }
    }
  },
  projImpact(p, x, y, z, n, target, dir) {
    if (target) G.projDamage(p, target, dir, [x, y, z]);
    if (p.splashR) this.explosion(x, y, z, p.splashR, p.splash, p.owner, { colorful: p.type === 'rojao', src: p.src, directTarget: target });
    else if (p.type === 'garrafa') {
      AUDIO.play('bottle_break', [x, y, z]);
      for (let i = 0; i < 8; i++) this.part({ x, y, z, vx: rand(-3, 3), vy: rand(0, 4), vz: rand(-3, 3), life: rand(0.3, 0.7), size: rand(0.04, 0.08), grav: 16, layer: T.white, col: [0.3, 0.7, 0.35], em: 0.2 });
      if (n) this.decal(x, y, z, n[0], n[1], n[2], 0.4, T.blood, [0.4, 0.3, 0.15]);
    } else if (n) this.impact(x, y, z, n[0], n[1], n[2], null);
  },
  // ---------- atualização ----------
  update(dt) {
    this.updateProjs(dt);
    const world = G.world;
    for (let i = this.parts.length - 1; i >= 0; i--) {
      const p = this.parts[i];
      p.life -= dt;
      if (p.life <= 0) { this.parts.splice(i, 1); continue; }
      p.vy -= p.grav * dt;
      if (p.drag) { const f = Math.max(0, 1 - p.drag * dt); p.vx *= f; p.vy *= f; p.vz *= f; }
      if (p.flutter) { p.vx += Math.sin(p.life * 5 + p.rot) * dt * 2; p.vz += Math.cos(p.life * 4 + p.rot) * dt * 2; }
      const nx = p.x + p.vx * dt, ny = p.y + p.vy * dt, nz = p.z + p.vz * dt;
      if (p.blood && p.vy < 0) {
        const sp = Math.hypot(p.vx, p.vy, p.vz) * dt;
        if (sp > 0) {
          const t = world.raycast(p.x, p.y, p.z, p.vx * dt / sp, p.vy * dt / sp, p.vz * dt / sp, sp, F_SOLID, false, false);
          if (t !== Infinity) {
            if (Math.random() < 0.35) this.decal(p.x + p.vx * dt * t / sp, p.y + p.vy * dt * t / sp, p.z + p.vz * dt * t / sp, world.hit.nx, world.hit.ny, world.hit.nz, rand(0.2, 0.55), T.blood);
            this.parts.splice(i, 1); continue;
          }
        }
      }
      p.x = nx; p.y = ny; p.z = nz;
      p.rot += p.vr * dt;
    }
    for (let i = this.lights.length - 1; i >= 0; i--) {
      const l = this.lights[i];
      l.life -= dt;
      if (l.life <= 0) { this.lights.splice(i, 1); continue; }
      l.i = l.i0 * (l.life / l.max);
    }
    // cápsulas e pedaços
    for (let i = this.debris.length - 1; i >= 0; i--) {
      const d = this.debris[i];
      d.life -= dt;
      if (d.life <= 0) { this.debris.splice(i, 1); continue; }
      if (d.rest) continue;
      d.vy -= 20 * dt;
      const sp = Math.hypot(d.vx, d.vy, d.vz), len = sp * dt;
      if (len > 0) {
        const t = world.raycast(d.x, d.y, d.z, d.vx / sp, d.vy / sp, d.vz / sp, len + d.sy, F_SOLID, false, true);
        if (t !== Infinity && t <= len + d.sy) {
          const h = world.hit;
          const vn = d.vx * h.nx + d.vy * h.ny + d.vz * h.nz;
          d.vx -= (1 + d.bounce) * vn * h.nx; d.vy -= (1 + d.bounce) * vn * h.ny; d.vz -= (1 + d.bounce) * vn * h.nz;
          d.vx *= 0.7; d.vz *= 0.7; d.wx *= 0.6; d.wy *= 0.6;
          if (d.snd && Math.abs(vn) > 2 && Math.random() < 0.5) AUDIO.play('empty', [d.x, d.y, d.z], 0.3);
          if (d.gib && Math.abs(vn) > 3) {
            this.decal(d.x - h.nx * 0.02, d.y - h.ny * 0.02, d.z - h.nz * 0.02, h.nx, h.ny, h.nz, rand(0.3, 0.6), T.blood);
            AUDIO.play('flesh', [d.x, d.y, d.z], 0.4);
          }
          if (h.ny > 0.7 && Math.hypot(d.vx, d.vy, d.vz) < 1.2) { d.rest = true; d.y = d.y + d.vy * dt * 0; continue; }
        } else { d.x += d.vx * dt; d.y += d.vy * dt; d.z += d.vz * dt; }
      }
      d.rx += d.wx * dt; d.ry += d.wy * dt;
      if (d.bleed > 0) { d.bleed -= dt; if (Math.random() < 0.4) this.part({ x: d.x, y: d.y, z: d.z, vx: 0, vy: 0, vz: 0, life: 0.5, size: 0.07, grav: 10, layer: T.white, col: [0.5, 0.02, 0.03], blood: true }); }
    }
    // ondas de choque
    for (let i = this.waves.length - 1; i >= 0; i--) {
      const w = this.waves[i];
      w.r += w.speed * dt;
      w.life -= dt;
      if (!w.hit) {
        const p = G.player;
        const d = Math.hypot(p.pos[0] - w.x, p.pos[2] - w.z);
        if (Math.abs(d - w.r) < 1.0 && p.pos[1] < w.y + 0.6 && p.alive) {
          w.hit = true;
          G.damagePlayer(w.dmg, [w.x, w.y, w.z], 'shock');
          const k = 1 / (d || 1);
          p.vel[0] += (p.pos[0] - w.x) * k * 10; p.vel[2] += (p.pos[2] - w.z) * k * 10; p.vel[1] = 7; p.onGround = false;
        }
      }
      if (w.r > w.maxR || w.life <= 0) this.waves.splice(i, 1);
    }
  },
  // ---------- desenho ----------
  draw(dyn, add, cam) {
    const one = [1, 1, 1];
    for (const p of this.parts) {
      const t = 1 - p.life / p.max;
      const s = lerp(p.size, p.size1, t);
      if (p.add) {
        const b = (p.bright || 1) * (p.life / p.max < 0.3 ? p.life / p.max / 0.3 : 1);
        emitBillboard(add, cam, p.x, p.y, p.z, s * 2, s * 2, p.rot, p.layer, [b, b, b], p.col, 1);
      } else {
        const l = p.light || one;
        emitBillboard(dyn, cam, p.x, p.y, p.z, s * 2, s * 2, p.rot, p.layer, l, p.col, p.em || 0);
      }
    }
    for (const d of this.decals) emitDecal(dyn, d.x, d.y, d.z, d.nx, d.ny, d.nz, d.size, d.rot, d.layer, d.light, d.tint);
    const lt = [0, 0, 0];
    for (const d of this.debris) {
      G.world.sampleProbe(d.x, d.z, lt);
      const M = M34.mul(M34.trans(d.x, d.y, d.z), M34.mul(M34.rotYXZ(d.ry, d.rx, 0), M34.scale(d.sx * 2, d.sy * 2, d.sz * 2)));
      emitBox(dyn, M, d.tex, lt, d.tint, d.gib ? 0 : 0.2);
    }
    for (const p of this.projs) {
      if (p.type === 'garrafa') {
        const M = M34.mul(M34.trans(p.x, p.y, p.z), M34.mul(M34.rotYXZ(p.rot * 0.7, p.rot, 0), M34.scale(0.08, 0.22, 0.08)));
        G.world.sampleProbe(p.x, p.z, lt);
        emitBox(dyn, M, T[p.tex || 'glass_green'], lt, one, 0.1);
      } else {
        const yaw = Math.atan2(-p.vx, -p.vz), pitch = Math.atan2(p.vy, Math.hypot(p.vx, p.vz));
        const sc = p.type === 'rojao_boss' ? 2 : 1;
        const M = M34.mul(M34.trans(p.x, p.y, p.z), M34.mul(M34.rotYXZ(yaw, pitch, p.rot), M34.scale(0.09 * sc, 0.09 * sc, 0.4 * sc)));
        emitBox(dyn, M, T.rojao_paper, one, one, 0.9);
        const gc = p.type === 'rojao' ? [0.6, 1, 0.6] : [1, 0.4, 0.2];
        emitBillboard(add, cam, p.x, p.y, p.z, 0.9 * sc, 0.9 * sc, 0, T.glow, [1.5, 1.5, 1.5], gc, 1);
      }
    }
    for (const w of this.waves) {
      const r = w.r, y = w.y + 0.08;
      const q = [w.x - r, y, w.z + r, w.x + r, y, w.z + r, w.x + r, y, w.z - r, w.x - r, y, w.z - r];
      const b = Math.min(1, w.life) * 1.6;
      add.quad(q, 0, 0, 1, 1, T.shockwave, b, b, b, 1, 0.7, 0.4, 1);
    }
  },
  gatherLights(out) {
    for (const l of this.lights) {
      const f = l.flicker ? 1 - l.flicker * Math.random() : 1;
      out.push({ x: l.x, y: l.y, z: l.z, r: l.r, cr: l.cr, cg: l.cg, cb: l.cb, i: l.i * f });
    }
    for (const p of this.projs) {
      if (p.type === 'garrafa') continue;
      const c = p.type === 'rojao' ? [0.5, 1, 0.5] : [1, 0.35, 0.15];
      out.push({ x: p.x, y: p.y, z: p.z, r: p.type === 'rojao_boss' ? 9 : 6, cr: c[0], cg: c[1], cb: c[2], i: 1.6 });
    }
  },
};
