'use strict';
// ---------------------------------------------------------------------------
// Jogador (torcedor da Força Jovem): movimento estilo Quake/DUSK + armas
// ---------------------------------------------------------------------------
const WEAPONS = {
  mastro: { slot: 1, name: 'MASTRO DA BANDEIRA', ammo: null, rate: 0.48, dmg: 40, range: 2.6 },
  pistol: { slot: 2, name: 'PISTOLA', ammo: 'bullets', use: 1, rate: 0.2, dmg: 18, pellets: 1, spread: 0.01, snd: 'pistol' },
  shotgun: { slot: 3, name: 'ESPINGARDA', ammo: 'shells', use: 1, rate: 0.85, dmg: 9, pellets: 8, spread: 0.075, snd: 'shotgun' },
  ssg: { slot: 4, name: 'DOZE DE CANO DUPLO', ammo: 'shells', use: 2, rate: 1.3, dmg: 9, pellets: 18, spread: 0.13, spreadY: 0.065, snd: 'ssg' },
  rifle: { slot: 5, name: 'METRALHADORA', ammo: 'bullets', use: 1, rate: 0.085, dmg: 13, pellets: 1, spread: 0.022, snd: 'rifle' },
  rocket: { slot: 6, name: 'LANÇA-ROJÃO', ammo: 'rockets', use: 1, rate: 0.82, snd: 'rocket' },
};
const WEAPON_ORDER = ['mastro', 'pistol', 'shotgun', 'ssg', 'rifle', 'rocket'];
const AMMO_MAX = { bullets: 300, shells: 60, rockets: 30 };

const PM = { run: 10.2, crouch: 4.6, accel: 11, airAccel: 14, airCap: 1.0, friction: 6.2, stop: 3.2, jump: 7.6, grav: 22, step: 0.56 };

class Player {
  constructor(x, y, z, yaw) {
    this.pos = [x, y, z]; this.vel = [0, 0, 0];
    this.yaw = yaw; this.pitch = 0;
    this.r = 0.33; this.h = 1.75; this.eyeH = 1.6; this.crouched = false;
    this.onGround = false; this.alive = true;
    this.hp = 100; this.armor = 0;
    this.weapons = { mastro: true, pistol: true, shotgun: false, ssg: false, rifle: false, rocket: false };
    this.dual = false;
    this.ammo = { bullets: 40, shells: 0, rockets: 0 };
    this.keys = { green: false, white: false };
    this.cur = 'pistol'; this.prev = 'mastro'; this.pending = null;
    this.fireT = 0; this.switchT = 0; this.animT = 10; this.side = 0;
    this.bob = 0; this.bobAmt = 0; this.landDip = 0; this.landV = 0; this.stepOff = 0;
    this.roll = 0; this.flip = null; this.slideT = 0; this.stepDist = 0;
    this.swayX = 0; this.swayY = 0; this.recoil = 0; this.kick = 0;
    this.painT = 0; this.deadT = 0; this.invuln = 0; this.meleeT = -1;
    this.jumpHeld = false; this.crouchHeld = false; this.airT = 0; this.lastVy = 0;
    this.flashes = []; this.dmgDirs = [];
  }
  // ------------------------------------------------------------------
  update(dt, inp) {
    if (!this.alive) { this.deadT += dt; this.vel[0] *= 0.9; this.vel[2] *= 0.9; this.vel[1] -= PM.grav * dt; G.world.moveActor(this, dt, 0); return; }
    this.invuln -= dt; this.painT -= dt;
    // olhar
    this.yaw -= inp.mx; this.pitch = clamp(this.pitch - inp.my, -1.55, 1.55);
    this.swayX = lerp(this.swayX, clamp(inp.mx * 3, -0.08, 0.08), Math.min(1, dt * 10));
    this.swayY = lerp(this.swayY, clamp(-inp.my * 3, -0.08, 0.08), Math.min(1, dt * 10));
    // agachar / deslizar / cambalhota
    const crouchNow = inp.crouch;
    if (crouchNow && !this.crouchHeld) {
      const hs = Math.hypot(this.vel[0], this.vel[2]);
      if (this.onGround && hs > 7) {
        this.slideT = 0.75;
        const f = Math.min(16, hs * 1.22) / hs; this.vel[0] *= f; this.vel[2] *= f;
        AUDIO.play('slide', null, 0.8);
      } else if (!this.onGround && !this.flip && G.settings.flips) {
        const fw = dirFromYawPitch(this.yaw, 0);
        const fwd = this.vel[0] * fw[0] + this.vel[2] * fw[2];
        const side = this.vel[0] * Math.cos(this.yaw) - this.vel[2] * Math.sin(this.yaw);
        let kind = fwd > 2 ? 'front' : fwd < -2 ? 'back' : Math.abs(side) > 2 ? (side > 0 ? 'right' : 'left') : null;
        if (kind) this.flip = { t: 0, kind };
      }
    }
    this.crouchHeld = crouchNow;
    this.setCrouch(crouchNow || this.slideT > 0);
    // movimento
    const fw = [-Math.sin(this.yaw), 0, -Math.cos(this.yaw)], rt = [Math.cos(this.yaw), 0, -Math.sin(this.yaw)];
    let wx = fw[0] * inp.fwd + rt[0] * inp.side, wz = fw[2] * inp.fwd + rt[2] * inp.side;
    const wl = Math.hypot(wx, wz);
    if (wl > 0) { wx /= wl; wz /= wl; }
    const maxSp = this.crouched && this.slideT <= 0 ? PM.crouch : PM.run;
    if (this.onGround) {
      if (inp.jump && (!this.jumpHeld || G.settings.autohop)) {
        this.vel[1] = PM.jump; this.onGround = false; this.slideT = 0;
        AUDIO.play('jump', null, 0.6);
        this.accelerate(wx, wz, maxSp, PM.accel, dt);
      } else {
        this.friction(dt, this.slideT > 0 ? 0.55 : 1);
        if (this.slideT <= 0) this.accelerate(wx, wz, maxSp, PM.accel, dt);
      }
    } else {
      this.accelerate(wx, wz, PM.airCap, PM.airAccel * maxSp, dt, true);
    }
    this.jumpHeld = inp.jump;
    this.slideT -= dt;
    this.vel[1] -= PM.grav * dt;
    this.lastVy = this.vel[1];
    const wasGround = this.onGround;
    // sub-passos
    const n = Math.max(1, Math.ceil(Math.hypot(this.vel[0], this.vel[1], this.vel[2]) * dt / 0.25));
    for (let i = 0; i < n; i++) {
      G.world.moveActor(this, dt / n, PM.step);
      if (this.stepped && this.onGround) this.stepOff -= this.stepped;
    }
    const so = this.stepOff;
    this.stepOff = clamp(so > 0 ? Math.max(0, so - dt * 5) : Math.min(0, so + dt * 5), -0.8, 0.8);
    // pouso
    if (this.onGround && !wasGround) {
      const v = -this.lastVy;
      if (v > 4) { this.landDip = Math.min(0.3, v * 0.022); AUDIO.play('land', null, Math.min(1, v / 12)); }
      if (this.flip) this.flip.t = 1; // aterrissou: termina
    }
    if (!this.onGround) this.airT += dt; else this.airT = 0;
    this.landDip = Math.max(0, this.landDip - dt * 1.2);
    // colisão com inimigos
    for (const e of G.enemies) {
      if (!e.alive) continue;
      const dx = this.pos[0] - e.pos[0], dz = this.pos[2] - e.pos[2], rr = this.r + e.r;
      if (Math.abs(dx) < rr && Math.abs(dz) < rr && this.pos[1] < e.pos[1] + e.h && this.pos[1] + this.h > e.pos[1]) {
        const d = Math.hypot(dx, dz) || 0.01;
        if (d < rr) {
          const push = (rr - d);
          if (this.pos[1] > e.pos[1] + e.h - 0.5) { this.pos[1] = e.pos[1] + e.h; this.vel[1] = Math.max(0, this.vel[1]); this.onGround = true; }
          else { this.vel[0] += dx / d * push * 12; this.vel[2] += dz / d * push * 12; }
        }
      }
    }
    // cabeçada balanço
    const hs = Math.hypot(this.vel[0], this.vel[2]);
    if (this.onGround && hs > 1) {
      this.bob += hs * dt * 0.85;
      this.bobAmt = Math.min(1, lerp(this.bobAmt, hs / PM.run, dt * 8));
      this.stepDist += hs * dt;
      if (this.stepDist > 2.4) { this.stepDist = 0; AUDIO.play('step', null, 0.9); }
    } else this.bobAmt = lerp(this.bobAmt, 0, dt * 6);
    // rolagem
    const side = this.vel[0] * rt[0] + this.vel[2] * rt[2];
    let targetRoll = -side * 0.0022;
    if (this.slideT > 0) targetRoll += 0.06;
    this.roll = lerp(this.roll, targetRoll, dt * 8);
    if (this.flip) { this.flip.t += dt / 0.6; if (this.flip.t >= 1) this.flip = null; }
    if (this.pos[1] < -25) { G.damagePlayer(9999, null, 'fall'); }
    this.updateWeapon(dt, inp);
  }
  setCrouch(want) {
    if (want && !this.crouched) { this.crouched = true; this.h = 1.0; this.stepOff += 0.7; }
    else if (!want && this.crouched) {
      // precisa de espaço para levantar
      const hs = G.world.actorOverlaps(this.pos, this.r, 1.75, []);
      if (!hs.length) { this.crouched = false; this.h = 1.75; this.stepOff -= 0.7; }
    }
    this.eyeH = this.crouched ? 0.9 : 1.6;
  }
  friction(dt, mult) {
    const sp = Math.hypot(this.vel[0], this.vel[2]);
    if (sp < 0.01) { this.vel[0] = this.vel[2] = 0; return; }
    const drop = Math.max(sp, PM.stop) * PM.friction * mult * dt;
    const ns = Math.max(0, sp - drop) / sp;
    this.vel[0] *= ns; this.vel[2] *= ns;
  }
  accelerate(wx, wz, wishSpeed, accel, dt, air = false) {
    if (!wx && !wz) return;
    const cur = this.vel[0] * wx + this.vel[2] * wz;
    const add = wishSpeed - cur;
    if (add <= 0) return;
    const a = Math.min(add, accel * (air ? 1 : wishSpeed) * dt);
    this.vel[0] += a * wx; this.vel[2] += a * wz;
  }
  // ------------------------------------------------------------------
  camera(fovDeg, aspect) {
    let pitch = this.pitch, roll = this.roll;
    if (this.flip) {
      const k = smooth(clamp(this.flip.t, 0, 1)) * TAU;
      if (this.flip.kind === 'front') pitch -= k;
      else if (this.flip.kind === 'back') pitch += k;
      else roll += this.flip.kind === 'right' ? k : -k;
    }
    let eye = this.eyeH + this.stepOff - this.landDip;
    if (!this.alive) { eye = lerp(this.eyeH, 0.3, Math.min(1, this.deadT * 2.5)); roll += Math.min(1, this.deadT * 2) * 0.6; }
    const bobY = Math.abs(Math.sin(this.bob * 1.0)) * 0.05 * this.bobAmt;
    const sh = G.shakeAmt;
    pitch += (Math.random() - 0.5) * sh * 0.05; const yaw = this.yaw + (Math.random() - 0.5) * sh * 0.05;
    pitch += this.kick;
    const f = dirFromYawPitch(yaw, pitch);
    let r = [Math.cos(yaw), 0, -Math.sin(yaw)];
    let u = V3.cross(r, f);
    if (roll) {
      const c = Math.cos(roll), s = Math.sin(roll);
      const nr = [r[0] * c + u[0] * s, r[1] * c + u[1] * s, r[2] * c + u[2] * s];
      const nu = [-r[0] * s + u[0] * c, -r[1] * s + u[1] * c, -r[2] * s + u[2] * c];
      r = nr; u = nu;
    }
    let fov = fovDeg + (this.slideT > 0 ? 6 : 0) + Math.min(8, Math.max(0, Math.hypot(this.vel[0], this.vel[2]) - PM.run) * 0.8);
    return { pos: [this.pos[0], this.pos[1] + eye + bobY, this.pos[2]], r, u, f, fov: fov * DEG, aspect };
  }
  aimDir(cam) { return cam.f; }
  // ------------------------------------------------------------------
  // Armas
  has(w) { return this.weapons[w]; }
  hasAmmo(w) { const d = WEAPONS[w]; return !d.ammo || this.ammo[d.ammo] >= (d.use || 1) || (w === 'ssg' && this.ammo.shells >= 1); }
  select(w) {
    if (!this.weapons[w] || w === this.cur || this.pending === w) return;
    if (!this.hasAmmo(w)) { AUDIO.play('empty', null, 0.5); return; }
    this.pending = w; this.switchT = 0.16;
    AUDIO.play('switch', null, 0.6);
  }
  cycle(dir) {
    const owned = WEAPON_ORDER.filter((w) => this.weapons[w] && this.hasAmmo(w));
    const base = this.pending || this.cur;
    let i = owned.indexOf(base);
    i = (i + dir + owned.length) % owned.length;
    this.select(owned[i]);
  }
  bestWeapon() {
    for (const w of ['ssg', 'shotgun', 'rifle', 'pistol', 'rocket', 'mastro']) if (this.weapons[w] && this.hasAmmo(w)) return w;
    return 'mastro';
  }
  updateWeapon(dt, inp) {
    this.fireT -= dt; this.animT += dt;
    this.recoil = Math.max(0, this.recoil - dt * 6);
    this.kick = lerp(this.kick, 0, Math.min(1, dt * 12));
    if (this.pending) {
      this.switchT -= dt;
      if (this.switchT <= 0) {
        if (this.cur !== this.pending) this.prev = this.cur;
        this.cur = this.pending; this.pending = null; this.switchT = -0.2; this.fireT = Math.max(this.fireT, 0.1);
      }
      return;
    }
    if (this.switchT < 0) this.switchT = Math.min(0, this.switchT + dt);
    if (this.meleeT >= 0) { this.meleeT -= dt; if (this.meleeT < 0) G.meleeHit(this); }
    if (inp.fire && this.fireT <= 0) this.fire(inp);
  }
  fire() {
    const w = WEAPONS[this.cur];
    if (w.ammo) {
      let use = w.use;
      if (this.cur === 'ssg' && this.ammo.shells < 2) use = this.ammo.shells;
      if (this.ammo[w.ammo] < 1) {
        AUDIO.play('empty', null, 0.5); this.fireT = 0.3;
        this.select(this.bestWeapon());
        return;
      }
      this.ammo[w.ammo] -= use;
      this.shotUse = use;
    }
    const cam = G.cam;
    const eye = cam.pos, f = cam.f;
    this.animT = 0;
    let rate = w.rate;
    if (this.cur === 'pistol' && this.dual) { rate = 0.11; this.side = 1 - this.side; }
    this.fireT = rate;
    if (this.cur === 'mastro') {
      this.meleeT = 0.12;
      AUDIO.play('swing', null, 0.9);
      return;
    }
    AUDIO.play(w.snd, null, 1);
    G.noise(this.pos, this.cur === 'pistol' ? 22 : 32);
    const mz = this.muzzleWorld(cam);
    FX.muzzle(mz[0], mz[1], mz[2], [1, 0.72, 0.35], this.cur === 'ssg' ? 10 : 7, this.cur === 'ssg' ? 3 : 2.2);
    this.flashT = 0.06; this.flashRot = rand(0, TAU);
    if (this.cur === 'rocket') {
      this.recoil = 1; this.kick = 0.05;
      G.firePlayerRocket(eye, f, cam);
      return;
    }
    // hitscan
    const n = w.pellets * (this.cur === 'ssg' ? (this.shotUse / 2) : 1);
    const shots = [];
    const r = cam.r, u = cam.u;
    const sp = w.spread * (this.cur === 'rifle' ? (1 + Math.min(1, this.recoilHeat || 0)) : 1);
    for (let i = 0; i < Math.max(1, Math.round(n)); i++) {
      let a = rand(0, TAU), m = Math.sqrt(Math.random());
      const sx = Math.cos(a) * m * sp, sy = Math.sin(a) * m * (w.spreadY || sp);
      const d = V3.norm([f[0] + r[0] * sx + u[0] * sy, f[1] + r[1] * sx + u[1] * sy, f[2] + r[2] * sx + u[2] * sy]);
      shots.push(d);
    }
    G.fireHitscan(eye, shots, w.dmg, this.cur);
    // recuo e cápsulas
    if (this.cur === 'pistol') { this.recoil = 0.6; this.kick = 0.012; }
    else if (this.cur === 'shotgun') { this.recoil = 1; this.kick = 0.035; }
    else if (this.cur === 'ssg') {
      this.recoil = 1.3; this.kick = 0.06;
      const k = this.onGround ? 1.5 : 4.5; this.vel[0] -= f[0] * k; this.vel[2] -= f[2] * k; if (!this.onGround) this.vel[1] -= f[1] * k;
    } else if (this.cur === 'rifle') { this.recoil = 0.5; this.kick = 0.008; this.recoilHeat = Math.min(1.5, (this.recoilHeat || 0) + 0.12); }
    if (this.cur === 'pistol' || this.cur === 'rifle') {
      const ej = V3.add(eye, V3.add(V3.scale(r, 0.2 + (this.side && this.dual ? -0.4 : 0)), V3.add(V3.scale(u, -0.15), V3.scale(f, 0.35))));
      FX.casing(ej[0], ej[1], ej[2], r[0] * 2.5 + u[0] * 2 + this.vel[0], 2.5 + this.vel[1] * 0.5, r[2] * 2.5 + u[2] * 2 + this.vel[2], false);
    }
  }
  muzzleWorld(cam) {
    const off = { pistol: [0.2, -0.17, -0.62], shotgun: [0.16, -0.16, -1.0], ssg: [0.14, -0.18, -0.95], rifle: [0.17, -0.18, -0.88], rocket: [0.18, -0.16, -0.9] }[this.cur] || [0, 0, -0.5];
    let x = off[0];
    if (this.cur === 'pistol' && this.dual && this.side) x = -x;
    return V3.add(cam.pos, V3.add(V3.scale(cam.r, x), V3.add(V3.scale(cam.u, off[1]), V3.scale(cam.f, -off[2]))));
  }
  // ------------------------------------------------------------------
  drawViewmodel(vm, vmAdd, cam, light) {
    if (!this.alive) return;
    const M0 = M34.fromBasis(cam.r, cam.u, [-cam.f[0], -cam.f[1], -cam.f[2]], cam.pos);
    if (this.recoilHeat) this.recoilHeat = Math.max(0, this.recoilHeat - 0.03);
    const bx = Math.sin(this.bob) * 0.014 * this.bobAmt, by = -Math.abs(Math.cos(this.bob)) * 0.016 * this.bobAmt;
    let drop = 0;
    if (this.pending) drop = (1 - this.switchT / 0.16) * 0.4;
    else if (this.switchT < 0) drop = -this.switchT / 0.2 * 0.4;
    const base = M34.mul(M0, M34.trans(bx - this.swayX * 0.4, by - drop - this.landDip * 0.25 + this.swayY * 0.3, 0));
    const w = this.cur, t = this.animT;
    const L = light;
    const SK = [0.84, 0.64, 0.5], ONE = [1, 1, 1];
    const P = (M, x, y, z, sx, sy, sz, tex, tint = ONE, em = 0) => emitPart(vm, M, x, y, z, sx, sy, sz, T[tex], L, tint, em);
    // antebraço com manga da Força Jovem; (x,y,z) = posição da mão
    const arm = (M, x, y, z, rx = -0.3, ry = 0, rz = 0) => {
      const A = M34.mul(M, M34.mul(M34.trans(x, y, z), M34.rotYXZ(ry, rx, rz)));
      P(A, 0, -0.01, 0.15, 0.068, 0.068, 0.26, 'sleeve_fjg');
      P(A, 0, 0, 0, 0.056, 0.064, 0.075, 'hand', SK);
      return A;
    };
    const flash = (M, x, y, z, s) => {
      if (!(this.flashT > 0)) return;
      const p = M34.apply(M, x, y, z);
      emitBillboard(vmAdd, cam, p[0], p[1], p[2], s, s, this.flashRot, T.flash, [2, 2, 2], [1, 0.85, 0.6], 1);
    };
    const hold = (x, y, z, ry, rx, rz = 0) => M34.mul(base, M34.mul(M34.trans(x, y, z), M34.rotYXZ(ry, rx, rz)));
    this.flashT -= 1 / 60;
    if (w === 'pistol') {
      const hands = this.dual ? [0, 1] : [0];
      for (const h of hands) {
        const sgn = h ? -1 : 1;
        const fired = (this.dual ? this.side === h : true) && t < 0.14;
        const k = fired ? 1 - t / 0.14 : 0;
        const M = hold(0.115 * sgn, -0.105 + k * 0.012, -0.25 + k * 0.03, 0.07 * sgn, k * 0.28);
        P(M, 0, 0, -0.075 + k * 0.03, 0.034, 0.036, 0.17, 'gun_metal_light');
        P(M, 0, -0.027, -0.065, 0.031, 0.02, 0.14, 'gun_metal');
        P(M, 0, 0.021, -0.155 + k * 0.03, 0.006, 0.009, 0.01, 'white', [0.9, 0.9, 0.5], 0.4);
        P(M, 0, 0.021, 0.0 + k * 0.03, 0.022, 0.008, 0.01, 'gun_metal');
        P(M, 0, -0.045, -0.05, 0.01, 0.012, 0.045, 'gun_metal');
        const Gp = M34.mul(M, M34.mul(M34.trans(0, -0.03, 0.0), M34.rotX(-0.3)));
        P(Gp, 0, -0.045, 0.005, 0.029, 0.085, 0.042, 'gun_wood');
        arm(Gp, 0.002, -0.04, 0.012, 0.3, 0.15 * sgn, 0);
        P(M, 0.02 * sgn, -0.012, -0.03, 0.014, 0.018, 0.05, 'hand', SK);
        if (fired && t < 0.05) flash(M, 0, 0.0, -0.19, 0.2);
      }
    } else if (w === 'shotgun') {
      const k = t < 0.12 ? 1 - t / 0.12 : 0;
      const pump = t > 0.25 && t < 0.62 ? Math.sin((t - 0.25) / 0.37 * Math.PI) * 0.08 : 0;
      if (t > 0.35 && !this.pumped && t < 1) { this.pumped = true; AUDIO.play('pump', null, 0.8); const e = V3.add(cam.pos, V3.add(V3.scale(cam.r, 0.14), V3.add(V3.scale(cam.u, -0.08), V3.scale(cam.f, 0.3)))); FX.casing(e[0], e[1], e[2], cam.r[0] * 3 + this.vel[0], 2.5, cam.r[2] * 3 + this.vel[2], true); }
      if (t < 0.3) this.pumped = false;
      const M = hold(0.105, -0.126 + k * 0.012, -0.235 + k * 0.05, 0.05, k * 0.22 + pump * 0.5);
      P(M, 0, 0, 0, 0.044, 0.056, 0.15, 'gun_metal_light');
      P(M, 0, 0.013, -0.28, 0.024, 0.024, 0.42, 'gun_metal');
      P(M, 0, -0.014, -0.24, 0.02, 0.02, 0.34, 'gun_metal');
      P(M, 0, 0.028, -0.48, 0.007, 0.007, 0.008, 'white', [1, 1, 0.8], 0.5);
      P(M, 0, -0.017, -0.22 + pump, 0.042, 0.036, 0.12, 'gun_wood');
      const S = M34.mul(M, M34.mul(M34.trans(0, -0.02, 0.07), M34.rotX(-0.18)));
      P(S, 0, -0.012, 0.09, 0.04, 0.065, 0.17, 'gun_wood');
      P(M, 0, -0.04, 0.02, 0.008, 0.02, 0.04, 'gun_metal');
      arm(M, 0.002, -0.042, 0.07, 0.45, 0.12);
      arm(M, -0.004, -0.04, -0.22 + pump, 0.25, -0.5, 0.2);
      if (t < 0.05) flash(M, 0, 0.013, -0.52, 0.34);
    } else if (w === 'ssg') {
      const k = t < 0.14 ? 1 - t / 0.14 : 0;
      let open = 0, handY = 0, shells = false;
      if (t > 0.25 && t < 1.1) {
        open = t < 0.4 ? (t - 0.25) / 0.15 : t < 0.9 ? 1 : 1 - (t - 0.9) / 0.2;
        if (t > 0.45 && t < 0.9) { handY = Math.sin((t - 0.45) / 0.45 * Math.PI) * -0.08; shells = t < 0.78; }
      }
      if (t > 0.3 && !this.ssgOpen && t < 1.2) { this.ssgOpen = true; AUDIO.play('ssg_open', null, 0.8); const e = V3.add(cam.pos, V3.add(V3.scale(cam.r, 0.1), V3.add(V3.scale(cam.u, -0.06), V3.scale(cam.f, 0.25)))); for (let i = 0; i < this.shotUse; i++) FX.casing(e[0], e[1], e[2], cam.r[0] * rand(-1, 1) + this.vel[0] - cam.f[0] * 2, 3, cam.r[2] * rand(-1, 1) + this.vel[2] - cam.f[2] * 2, true); }
      if (t > 0.55 && !this.ssgLoad && t < 1.2) { this.ssgLoad = true; AUDIO.play('ssg_load', null, 0.7); }
      if (t > 0.95 && !this.ssgClose && t < 1.3) { this.ssgClose = true; AUDIO.play('ssg_close', null, 0.8); }
      if (t < 0.2) { this.ssgOpen = this.ssgLoad = this.ssgClose = false; }
      const M = hold(0.1, -0.128 + k * 0.02 + open * 0.02, -0.235 + k * 0.06, 0.05 - open * 0.12, k * 0.35 - open * 0.15, open * 0.25);
      P(M, 0, 0, 0, 0.056, 0.052, 0.1, 'gun_metal_light');
      const S = M34.mul(M, M34.mul(M34.trans(0, -0.02, 0.05), M34.rotX(-0.18)));
      P(S, 0, -0.012, 0.09, 0.048, 0.066, 0.17, 'gun_wood');
      const B = M34.mul(M, M34.mul(M34.trans(0, 0.005, -0.05), M34.rotX(-open * 0.6)));
      P(B, 0.016, 0.008, -0.18, 0.03, 0.03, 0.36, 'gun_metal');
      P(B, -0.016, 0.008, -0.18, 0.03, 0.03, 0.36, 'gun_metal');
      P(B, 0, 0.025, -0.18, 0.012, 0.006, 0.36, 'gun_metal_light');
      P(B, 0, -0.016, -0.09, 0.058, 0.03, 0.14, 'gun_wood');
      arm(M, 0.002, -0.04, 0.06, 0.45, 0.12);
      arm(M, -0.006, -0.042 + handY, -0.12 + (shells ? 0.08 : 0), 0.25, -0.5, 0.2);
      if (shells) { const H = M34.mul(M, M34.trans(-0.02, -0.01 + handY, -0.02)); P(H, 0.015, 0.02, 0, 0.022, 0.022, 0.06, 'shell_box', [1, 0.4, 0.3]); P(H, -0.015, 0.02, 0, 0.022, 0.022, 0.06, 'shell_box', [1, 0.4, 0.3]); }
      if (t < 0.06) { flash(B, 0.016, 0.008, -0.38, 0.42); flash(B, -0.016, 0.008, -0.38, 0.36); }
    } else if (w === 'rifle') {
      const firing = t < 0.09;
      const jx = firing ? rand(-0.004, 0.004) : 0, jy = firing ? rand(-0.004, 0.004) : 0;
      const M = hold(0.1 + jx, -0.126 + jy, -0.24 + (firing ? 0.018 : 0), 0.05, firing ? 0.04 : 0);
      P(M, 0, 0, 0, 0.045, 0.062, 0.24, 'gun_metal');
      P(M, 0, 0.033, 0, 0.03, 0.006, 0.2, 'gun_metal_light');
      P(M, 0, 0.012, -0.25, 0.018, 0.018, 0.2, 'gun_metal');
      P(M, 0, 0.034, -0.31, 0.008, 0.03, 0.01, 'gun_metal');
      P(M, 0, 0.002, -0.17, 0.05, 0.048, 0.11, 'gun_wood');
      const Mg = M34.mul(M, M34.mul(M34.trans(0, -0.03, -0.05), M34.rotX(0.35)));
      P(Mg, 0, -0.05, 0, 0.032, 0.1, 0.048, 'gun_metal');
      const S = M34.mul(M, M34.mul(M34.trans(0, -0.01, 0.12), M34.rotX(-0.12)));
      P(S, 0, -0.01, 0.07, 0.038, 0.06, 0.14, 'gun_wood');
      arm(M, 0.002, -0.045, 0.08, 0.45, 0.12);
      arm(M, -0.004, -0.032, -0.17, 0.25, -0.5, 0.2);
      if (t < 0.045) flash(M, 0, 0.012, -0.37, 0.28);
    } else if (w === 'rocket') {
      const k = t < 0.2 ? 1 - t / 0.2 : 0;
      const loaded = t > 0.55;
      const M = hold(0.145, -0.1 + k * 0.03, -0.24 + k * 0.09, 0.05, k * 0.2);
      P(M, 0, 0, -0.14, 0.078, 0.078, 0.6, 'pvc');
      P(M, 0, 0, -0.43, 0.09, 0.09, 0.03, 'pvc', [0.4, 1, 0.5]);
      P(M, 0, 0, 0.1, 0.09, 0.09, 0.03, 'pvc', [0.4, 1, 0.5]);
      P(M, 0, 0.052, -0.2, 0.012, 0.016, 0.06, 'gun_metal');
      if (loaded) P(M, 0, 0, -0.43 + Math.max(0, 0.7 - t) * 0.4, 0.05, 0.05, 0.06, 'rojao_paper', ONE, 0.3);
      P(M, 0, -0.07, -0.1, 0.022, 0.06, 0.03, 'gun_metal');
      arm(M, 0.0, -0.09, -0.1, 0.5, 0.12);
      arm(M, -0.02, -0.06, -0.3, 0.3, -0.45, 0.3);
      if (t < 0.08) flash(M, 0, 0, -0.47, 0.55);
      if (t < 0.5 && Math.random() < 0.3) { const p = M34.apply(M, 0, 0, -0.46); FX.smoke(p[0], p[1], p[2], 1, [0.6, 0.6, 0.6], 0.15, 0.6, 0.6); }
    } else if (w === 'mastro') {
      // repouso: mastro inclinado à direita com a bandeira no alto
      let hx = 0.25, hy = -0.2, hz = -0.36, rx = -0.6, rz = -0.1;
      if (t < 0.48) {
        const s = t / 0.48;
        if (s < 0.18) { const q = s / 0.18; rz = -0.1 - q * 0.45; rx = -0.6 + q * 0.35; hx = 0.25 + q * 0.03; }
        else if (s < 0.48) { const q = smooth((s - 0.18) / 0.3); rz = -0.55 + q * 2.0; rx = -0.25 - q * 1.1; hx = 0.28 - q * 0.3; hy = -0.2 - q * 0.05; }
        else { const q = smooth((s - 0.48) / 0.52); rz = 1.45 - q * 1.55; rx = -1.35 + q * 0.75; hx = -0.02 + q * 0.27; hy = -0.25 + q * 0.05; }
      }
      const M = hold(hx, hy, hz, 0, rx, rz);
      P(M, 0, 0.3, 0, 0.026, 1.05, 0.026, 'gun_metal_light', [0.95, 0.95, 0.9]);
      P(M, 0, 0.84, 0, 0.045, 0.045, 0.045, 'gun_metal_light', [1, 0.85, 0.3], 0.2);
      arm(base, hx, hy, hz, 0.5, 0.25, 0);
      // bandeira tremulando
      const nx = 6, ny = 3, Wf = 0.42, Hf = 0.3, time = G.time;
      const pt = (i, j) => {
        const wave = Math.sin(time * 7 - i * 0.9) * 0.05 * (i / nx) + (t < 0.48 ? Math.sin(t * 12) * 0.1 * (i / nx) : 0);
        return M34.apply(M, 0.015 + i / nx * Wf, 0.8 - j / ny * Hf - (i / nx) * 0.05, wave);
      };
      for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
        const a = pt(i, j + 1), b = pt(i + 1, j + 1), c = pt(i + 1, j), d = pt(i, j);
        const u0 = i / nx, u1 = (i + 1) / nx, v0 = j / ny, v1 = (j + 1) / ny;
        vm.quad([...a, ...b, ...c, ...d], u0, v0, u1, v1, T.flag_goias, L[0], L[1], L[2], 1, 1, 1, 0);
        vm.quad([...b, ...a, ...d, ...c], u1, v0, u0, v1, T.flag_goias, L[0] * 0.8, L[1] * 0.8, L[2] * 0.8, 1, 1, 1, 0);
      }
    }
  }
}
