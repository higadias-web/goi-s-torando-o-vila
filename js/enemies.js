'use strict';
// ---------------------------------------------------------------------------
// Inimigos: torcedores do Vila invadindo a Serrinha
// ---------------------------------------------------------------------------
const EDEFS = {
  vileiro: {
    name: 'Vileiro', hp: 45, speed: 6.2, r: 0.35, h: 1.85, scale: 1,
    melee: { range: 1.8, reach: 2.4, dmg: 12, windup: 0.36, recover: 0.4, snd: 'hit_melee' },
    pain: 0.75, painTime: 0.28, snd: { alert: 'enemy_alert', pain: 'enemy_pain', death: 'enemy_death' },
  },
  arremessador: {
    name: 'Arremessador', hp: 55, speed: 4.3, r: 0.35, h: 1.85, scale: 1, keep: 9,
    melee: { range: 1.6, reach: 2.2, dmg: 8, windup: 0.4, recover: 0.4, snd: 'punch' },
    ranged: { type: 'garrafa', windup: 0.5, cd: [1.3, 2.3], range: 28, dmg: 11 },
    pain: 0.7, painTime: 0.3, snd: { alert: 'enemy_alert', pain: 'enemy_pain', death: 'enemy_death' },
  },
  rojoeiro: {
    name: 'Rojoeiro', hp: 80, speed: 3.6, r: 0.36, h: 1.85, scale: 1, keep: 13,
    melee: { range: 1.6, reach: 2.2, dmg: 10, windup: 0.4, recover: 0.5, snd: 'punch' },
    ranged: { type: 'rojao_e', windup: 0.8, cd: [2.0, 3.3], range: 42, dmg: 14, splash: 10, splashR: 2.3, speed: 16 },
    pain: 0.5, painTime: 0.3, snd: { alert: 'enemy_alert', pain: 'enemy_pain', death: 'enemy_death' },
  },
  brutamonte: {
    name: 'Brutamonte', hp: 300, speed: 4.6, r: 0.5, h: 2.4, scale: 1.3,
    melee: { range: 2.3, reach: 3.0, dmg: 26, windup: 0.45, recover: 0.55, knock: 11, snd: 'punch' },
    charge: { speed: 13.5, min: 7, max: 28, cd: [3.5, 6], dmg: 30, windup: 0.6 },
    pain: 0.18, painTime: 0.35, snd: { alert: 'brute_alert', pain: 'enemy_pain', death: 'brute_death' },
  },
  tigrao: {
    name: 'TIGRÃO', hp: 2600, speed: 5.4, r: 0.95, h: 4.25, scale: 2.3, boss: true,
    pain: 0.0, painTime: 0.2, snd: { alert: 'boss_roar', pain: 'boss_pain', death: 'boss_roar' },
  },
};

let _alertSndT = 0;
class Enemy {
  constructor(type, x, y, z, yaw = 0, opts = {}) {
    const d = this.def = EDEFS[type];
    this.type = type;
    this.pos = [x, y + 0.05, z];
    this.vel = [0, 0, 0];
    this.yaw = yaw;
    this.hp = this.maxHp = Math.round(d.hp * G.diff.ehp);
    this.r = d.r; this.h = d.h; this.scale = d.scale;
    this.state = 'idle'; this.st = 0; this.cd = rand(0.5, 1.5);
    this.alive = true; this.onGround = false;
    this.look = makeLook(type);
    this.model = type === 'tigrao' ? MODELS.tiger : MODELS.human;
    this.walk = rand(0, TAU); this.flash = 0; this.fall = 0;
    this.seeT = rand(0, 0.3); this.canSee = false; this.dormant = !!opts.dormant;
    this.strafe = Math.random() < 0.5 ? 1 : -1; this.strafeT = rand(0.5, 1.5);
    this.navMode = 0; this.stuckT = 0; this.lastX = x; this.lastZ = z;
    this.corpseHp = 40; this.gibbed = false; this.group = opts.group || null;
    this.chargeCd = rand(1, 3); this.light = [1, 1, 1];
    this.idleT = rand(0, 5);
    this.spawnFx = opts.spawnFx ? 0.6 : 0;
    this.boss = !!d.boss;
    if (this.boss) { this.phase = 1; this.summoned = 0; this.cd = 2; }
  }
  get center() { return [this.pos[0], this.pos[1] + this.h * 0.55, this.pos[2]]; }
  eye() { return [this.pos[0], this.pos[1] + this.h * 0.9, this.pos[2]]; }
  alert() {
    if (this.state !== 'idle') return;
    this.state = 'chase'; this.st = 0; this.dormant = false;
    this.cd = rand(0.3, 1.0) / G.diff.erate;
    if (_alertSndT <= 0) { AUDIO.play(this.def.snd.alert, this.eye()); _alertSndT = 0.35; }
  }
  setState(s) { this.state = s; this.st = 0; }
  // ------------------------------------------------------------------
  update(dt) {
    if (!this.alive) { this.updateCorpse(dt); return; }
    const P = G.player, d = this.def;
    this.st += dt; this.cd -= dt; this.flash -= dt; this.chargeCd -= dt;
    if (this.spawnFx > 0) this.spawnFx -= dt;
    const pc = [P.pos[0], P.pos[1] + P.h * 0.7, P.pos[2]];
    const dx = P.pos[0] - this.pos[0], dz = P.pos[2] - this.pos[2];
    const dist = Math.hypot(dx, dz), dy = P.pos[1] - this.pos[1];
    const toYaw = Math.atan2(-dx, -dz);
    // percepção
    this.seeT -= dt;
    if (this.seeT <= 0) {
      this.seeT = rand(0.12, 0.25);
      this.canSee = P.alive && dist < 70 && G.lineOfSight(this.eye(), pc);
    }
    if (this.state === 'idle') {
      this.idleT += dt;
      if (P.alive && this.canSee && (!this.dormant || dist < 9)) {
        const fov = Math.abs(wrapAngle(toYaw - this.yaw));
        if (dist < 9 || fov < 1.9 || this.heard) this.alert();
      }
      this.physics(dt, 0, 0);
      return;
    }
    if (this.boss) { this.bossThink(dt, dist, dx, dz, dy, toYaw, pc); return; }
    if (!P.alive && this.state !== 'pain') { this.physics(dt, 0, 0); this.yaw = approachAngle(this.yaw, this.yaw + dt, dt); return; }
    let mx = 0, mz = 0, speed = d.speed * G.diff.espd;
    switch (this.state) {
      case 'chase': {
        // decidir ataque
        if (d.melee && dist < d.melee.range && Math.abs(dy) < 1.6 && this.cd <= 0) { this.attack = 'melee'; this.setState('windup'); break; }
        if (d.charge && this.canSee && dist > d.charge.min && dist < d.charge.max && Math.abs(dy) < 1 && this.chargeCd <= 0 && Math.random() < dt * 1.5) { this.attack = 'charge'; this.setState('windup'); AUDIO.play('brute_alert', this.eye(), 0.8); break; }
        if (d.ranged && this.canSee && dist < d.ranged.range && this.cd <= 0 && Math.random() < dt * 3) {
          this.attack = 'ranged'; this.setState('windup');
          if (d.ranged.type === 'rojao_e') AUDIO.play('fuse', this.eye(), 0.8);
          break;
        }
        // movimento
        let tx = P.pos[0], tz = P.pos[2];
        const direct = this.canSee && Math.abs(dy) < 1.2 && dist < 16 && this.navMode <= 0;
        if (!direct) {
          const n = G.world.navNext(this.pos[0], this.pos[1], this.pos[2]);
          if (n) { tx = n[0]; tz = n[1]; }
        }
        let vx = tx - this.pos[0], vz = tz - this.pos[2];
        const vl = Math.hypot(vx, vz) || 1;
        vx /= vl; vz /= vl;
        // ranged: mantém distância e dá strafe
        if (d.keep && this.canSee) {
          this.strafeT -= dt;
          if (this.strafeT <= 0) { this.strafe = -this.strafe; this.strafeT = rand(0.6, 1.6); }
          const px = -dz / (dist || 1), pz = dx / (dist || 1);
          if (dist < d.keep * 0.6) { vx = -dx / dist * 0.7 + px * this.strafe * 0.7; vz = -dz / dist * 0.7 + pz * this.strafe * 0.7; }
          else if (dist < d.keep * 1.3) { vx = px * this.strafe; vz = pz * this.strafe; speed *= 0.8; }
        }
        mx = vx; mz = vz;
        // não entra no jogador: para a uma distância de ataque
        if (dist < this.r + P.r + 0.45 && Math.abs(dy) < 1.5) { mx = 0; mz = 0; }
        this.yaw = approachAngle(this.yaw, this.canSee && dist < 20 ? toYaw : Math.atan2(-vx, -vz), dt * 8);
        // travado?
        if (this.st > 0.6) {
          const moved = Math.hypot(this.pos[0] - this.lastX, this.pos[2] - this.lastZ);
          if (moved < 0.4) { this.navMode = 1.5; this.strafe = -this.strafe; }
          this.lastX = this.pos[0]; this.lastZ = this.pos[2]; this.st = 0.001;
        }
        this.navMode -= dt;
        break;
      }
      case 'windup': {
        this.yaw = approachAngle(this.yaw, toYaw, dt * 10);
        const a = this.attack;
        const wt = a === 'melee' ? d.melee.windup : a === 'charge' ? d.charge.windup : d.ranged.windup;
        if (a === 'ranged' && d.ranged.type === 'rojao_e' && Math.random() < 0.6) {
          const f = dirFromYawPitch(this.yaw, 0);
          FX.part({ x: this.pos[0] + f[0] * 0.9 + Math.cos(this.yaw) * 0.12, y: this.pos[1] + 1.35, z: this.pos[2] + f[2] * 0.9 - Math.sin(this.yaw) * 0.12, vx: rand(-1, 1), vy: rand(0, 2), vz: rand(-1, 1), life: 0.25, size: 0.08, size1: 0.02, add: true, layer: T.spark, col: [1, 0.8, 0.3], bright: 2, grav: 5 });
        }
        if (this.st >= wt / G.diff.erate * (a === 'melee' ? 1 : 1)) {
          if (a === 'melee') {
            if (dist < d.melee.reach && Math.abs(dy) < 1.8 && P.alive) {
              G.damagePlayer(d.melee.dmg, this.pos, 'melee');
              AUDIO.play(d.melee.snd, this.eye());
              if (d.melee.knock) { P.vel[0] += dx / dist * d.melee.knock; P.vel[2] += dz / dist * d.melee.knock; P.vel[1] += 4; P.onGround = false; }
            } else AUDIO.play('swing', this.eye(), 0.7);
            this.cd = d.melee.recover + rand(0.1, 0.4);
            this.setState('recover'); this.recoverT = d.melee.recover;
          } else if (a === 'ranged') {
            this.fire(pc, dist);
            this.cd = rand(d.ranged.cd[0], d.ranged.cd[1]) / G.diff.erate;
            this.setState('recover'); this.recoverT = 0.35;
          } else if (a === 'charge') {
            this.chargeDir = [dx / dist, dz / dist];
            this.setState('charge');
          }
        }
        break;
      }
      case 'charge': {
        const c = d.charge;
        mx = this.chargeDir[0]; mz = this.chargeDir[1]; speed = c.speed;
        this.yaw = Math.atan2(-mx, -mz);
        if (dist < 1.6 + this.r && Math.abs(dy) < 1.5 && P.alive) {
          G.damagePlayer(c.dmg, this.pos, 'melee');
          AUDIO.play('punch', this.eye());
          P.vel[0] += mx * 16; P.vel[2] += mz * 16; P.vel[1] = 6; P.onGround = false;
          G.shake(0.6);
          this.chargeCd = rand(c.cd[0], c.cd[1]); this.setState('recover'); this.recoverT = 0.8;
        } else if (this.st > 0.25 && this.hitWall) {
          AUDIO.play('hit_melee', this.eye()); G.shake(0.3);
          this.chargeCd = rand(c.cd[0], c.cd[1]); this.setState('pain'); this.painT = 1.2;
        } else if (this.st > 1.6) { this.chargeCd = rand(c.cd[0], c.cd[1]); this.setState('recover'); this.recoverT = 0.4; }
        break;
      }
      case 'recover':
        this.yaw = approachAngle(this.yaw, toYaw, dt * 6);
        if (this.st >= (this.recoverT || 0.4)) this.setState('chase');
        break;
      case 'pain':
        if (this.st >= (this.painT || d.painTime)) this.setState('chase');
        break;
    }
    this.physics(dt, mx * speed, mz * speed);
  }
  fire(target, dist) {
    const d = this.def.ranged, f = dirFromYawPitch(this.yaw, 0);
    const P = G.player;
    let sx, sy, sz;
    if (d.type === 'rojao_e') { sx = this.pos[0] + f[0] * 1.0 + Math.cos(this.yaw) * 0.12; sy = this.pos[1] + 1.33 * this.scale; sz = this.pos[2] + f[2] * 1.0 - Math.sin(this.yaw) * 0.12; }
    else { sx = this.pos[0] + Math.cos(this.yaw) * 0.35; sy = this.pos[1] + 1.9 * this.scale; sz = this.pos[2] - Math.sin(this.yaw) * 0.35; }
    const lead = G.diff.lead;
    if (d.type === 'garrafa') {
      const T_ = clamp(dist / 15, 0.45, 1.6), g = 12;
      const tx = target[0] + P.vel[0] * T_ * lead + rand(-0.6, 0.6), tz = target[2] + P.vel[2] * T_ * lead + rand(-0.6, 0.6), ty = target[1] - 0.2;
      FX.proj({ type: 'garrafa', x: sx, y: sy, z: sz, vx: (tx - sx) / T_, vy: (ty - sy + 0.5 * g * T_ * T_) / T_, vz: (tz - sz) / T_, grav: g, radius: 0.15, dmg: d.dmg, owner: 'enemy', src: this, spin: 12, tex: Math.random() < 0.5 ? 'glass_green' : 'glass_brown' });
      AUDIO.play('throw', [sx, sy, sz]);
    } else {
      const spd = d.speed * G.diff.pspd;
      const T_ = dist / spd;
      const tx = target[0] + P.vel[0] * T_ * lead, ty = target[1] + (P.onGround ? 0 : P.vel[1] * T_ * lead * 0.3) - 0.2, tz = target[2] + P.vel[2] * T_ * lead;
      let vx = tx - sx, vy = ty - sy, vz = tz - sz;
      const l = Math.hypot(vx, vy, vz) || 1;
      FX.proj({ type: 'rojao_e', x: sx, y: sy, z: sz, vx: vx / l * spd, vy: vy / l * spd, vz: vz / l * spd, grav: 0, radius: 0.2, dmg: d.dmg, splash: d.splash, splashR: d.splashR, owner: 'enemy', src: this, spin: 20, life: 5 });
      AUDIO.play('enemy_rojao', [sx, sy, sz]);
      FX.muzzle(sx, sy, sz, [1, 0.5, 0.2], 6, 2);
    }
  }
  physics(dt, wx, wz) {
    const onG = this.onGround;
    const acc = onG ? 10 : 2;
    const k = Math.min(1, acc * dt);
    this.vel[0] += (wx - this.vel[0]) * k;
    this.vel[2] += (wz - this.vel[2]) * k;
    this.vel[1] -= 22 * dt;
    G.world.moveActor(this, dt, 0.62);
    const sp = Math.hypot(this.vel[0], this.vel[2]);
    this.walk += sp * dt * 2.4 / this.scale;
    if (this.pos[1] < -30) { this.hp = 0; this.alive = false; this.gibbed = true; }
  }
  // ------------------------------------------------------------------
  // Chefe: TIGRÃO
  bossThink(dt, dist, dx, dz, dy, toYaw, pc) {
    const P = G.player;
    const hpf = this.hp / this.maxHp;
    if (this.phase === 1 && hpf < 0.5) { this.phase = 2; G.message('O TIGRÃO ESTÁ FURIOSO!', 'big'); AUDIO.play('boss_roar', this.eye()); }
    if (this.summoned === 0 && hpf < 0.66) { this.summoned = 1; G.bossSummon(); }
    if (this.summoned === 1 && hpf < 0.33) { this.summoned = 2; G.bossSummon(); }
    const spd = (this.phase === 2 ? 7 : 5.4) * G.diff.espd;
    let mx = 0, mz = 0, speed = 0;
    switch (this.state) {
      case 'chase': {
        const n = (this.canSee && Math.abs(dy) < 2) ? null : G.world.navNext(this.pos[0], this.pos[1], this.pos[2]);
        let vx = n ? n[0] - this.pos[0] : dx, vz = n ? n[1] - this.pos[2] : dz;
        const l = Math.hypot(vx, vz) || 1; mx = vx / l; mz = vz / l; speed = spd;
        this.yaw = approachAngle(this.yaw, toYaw, dt * 4);
        if (!P.alive) { speed = 0; break; }
        if (this.cd <= 0) {
          const r = Math.random();
          if (dist < 4.5) this.bossAttack('swipe');
          else if (!this.canSee) this.bossAttack('jump');
          else if (r < 0.4) this.bossAttack('volley');
          else if (r < 0.72) this.bossAttack('jump');
          else this.bossAttack('charge');
        }
        break;
      }
      case 'volley': {
        this.yaw = approachAngle(this.yaw, toYaw, dt * 5);
        if (this.st > 0.9) {
          this.shotT -= dt;
          if (this.shotT <= 0 && this.shots > 0) {
            this.shots--; this.shotT = this.phase === 2 ? 0.28 : 0.4;
            const n = this.phase === 2 ? 7 : 5;
            for (let i = 0; i < n; i++) {
              const a = toYaw + (i - (n - 1) / 2) * 0.16 + rand(-0.03, 0.03);
              const f = dirFromYawPitch(a, 0);
              const sx = this.pos[0] + f[0] * 1.8, sy = this.pos[1] + 3.3, sz = this.pos[2] + f[2] * 1.8;
              const ty = pc[1] - sy, hd = dist;
              const spd2 = 17 * G.diff.pspd;
              const pitch = Math.atan2(ty, hd);
              const dir = dirFromYawPitch(a, pitch);
              FX.proj({ type: 'rojao_boss', x: sx, y: sy, z: sz, vx: dir[0] * spd2, vy: dir[1] * spd2, vz: dir[2] * spd2, grav: 0, radius: 0.3, dmg: 15, splash: 12, splashR: 2.6, owner: 'enemy', src: this, spin: 15, life: 5 });
            }
            AUDIO.play('enemy_rojao', this.eye(), 1.5);
          }
          if (this.shots <= 0 && this.shotT <= 0) { this.setState('chase'); this.cd = rand(1.2, 2.2) / (this.phase === 2 ? 1.4 : 1); }
        }
        break;
      }
      case 'charge': {
        if (this.st < 0.7) { this.yaw = approachAngle(this.yaw, toYaw, dt * 6); this.chargeDir = [dx / (dist || 1), dz / (dist || 1)]; break; }
        mx = this.chargeDir[0]; mz = this.chargeDir[1]; speed = 17;
        if (dist < 2.8 && Math.abs(dy) < 3 && P.alive) {
          G.damagePlayer(35, this.pos, 'melee'); AUDIO.play('punch', this.eye());
          P.vel[0] += mx * 20; P.vel[2] += mz * 20; P.vel[1] = 8; P.onGround = false; G.shake(1);
          this.setState('chase'); this.cd = rand(1.5, 2.5);
        } else if (this.st > 0.9 && this.hitWall) {
          AUDIO.play('explosion_small', this.eye()); G.shake(0.7);
          this.setState('stun');
        } else if (this.st > 2.4) { this.setState('chase'); this.cd = 1; }
        break;
      }
      case 'stun':
        if (this.st > 1.6) { this.setState('chase'); this.cd = 0.8; }
        break;
      case 'jump': {
        if (this.st < 0.5) { this.yaw = approachAngle(this.yaw, toYaw, dt * 6); break; }
        if (!this.jumped) {
          this.jumped = true;
          const T_ = 1.15;
          const tx = P.pos[0] + P.vel[0] * 0.4, tz = P.pos[2] + P.vel[2] * 0.4;
          this.vel[0] = (tx - this.pos[0]) / T_; this.vel[2] = (tz - this.pos[2]) / T_;
          const hl = Math.hypot(this.vel[0], this.vel[2]);
          if (hl > 26) { this.vel[0] *= 26 / hl; this.vel[2] *= 26 / hl; }
          this.vel[1] = 12.6 + Math.max(0, (P.pos[1] - this.pos[1])) * 0.9; this.onGround = false;
          AUDIO.play('boss_roar', this.eye(), 0.6);
          this.airborne = true;
        }
        if (this.airborne) {
          G.world.moveActor(this, dt, 0);
          this.vel[1] -= 22 * dt;
          if (this.onGround && this.st > 0.7) {
            this.airborne = false;
            FX.waves.push({ x: this.pos[0], y: this.pos[1], z: this.pos[2], r: 1, speed: 15, maxR: 20, dmg: Math.round(22 * G.diff.pdmg), life: 1.5 });
            AUDIO.play('shockwave', this.pos); G.shake(1.2);
            FX.dust(this.pos[0], this.pos[1] + 0.2, this.pos[2], 0, 1, 0, 14, [0.5, 0.45, 0.4]);
            G.radiusDamage(this.pos[0], this.pos[1] + 0.5, this.pos[2], 3.5, 40, 'enemy', { src: this, noSelf: true });
            this.setState('chase'); this.cd = rand(0.8, 1.8) / (this.phase === 2 ? 1.4 : 1); this.jumped = false;
          }
          const sp = Math.hypot(this.vel[0], this.vel[2]); this.walk += sp * dt;
          return;
        }
        break;
      }
      case 'swipe': {
        this.yaw = approachAngle(this.yaw, toYaw, dt * 8);
        if (this.st > 0.45 && !this.swiped) {
          this.swiped = true;
          if (dist < 5.2 && Math.abs(dy) < 3 && P.alive) {
            G.damagePlayer(30, this.pos, 'melee'); AUDIO.play('punch', this.eye());
            P.vel[0] += dx / dist * 14; P.vel[2] += dz / dist * 14; P.vel[1] = 5; P.onGround = false; G.shake(0.8);
          } else AUDIO.play('swing', this.eye());
        }
        if (this.st > 0.9) { this.swiped = false; this.setState('chase'); this.cd = rand(0.6, 1.2); }
        break;
      }
      case 'intro':
        mx = -1; mz = 0; speed = 4;
        this.yaw = Math.PI / 2;
        if (this.pos[0] < 34) { this.setState('chase'); this.cd = 1.5; }
        break;
    }
    this.physics(dt, mx * speed, mz * speed);
  }
  bossAttack(a) {
    this.setState(a); this.jumped = false; this.swiped = false;
    if (a === 'volley') { this.shots = 3; this.shotT = 0; AUDIO.play('boss_roar', this.eye(), 0.8); }
    if (a === 'charge') AUDIO.play('boss_roar', this.eye(), 0.7);
  }
  // ------------------------------------------------------------------
  damage(dmg, dir, kind, hitPos) {
    if (!this.alive) {
      if (this.gibbed) return;
      this.corpseHp -= dmg;
      FX.blood(hitPos ? hitPos[0] : this.pos[0], (hitPos ? hitPos[1] : this.pos[1] + 0.2), hitPos ? hitPos[2] : this.pos[2], dir[0], 0.5, dir[2], 4);
      if (this.corpseHp <= 0) this.gib(dir, 1);
      return;
    }
    this.hp -= dmg;
    this.flash = 0.07;
    if (this.state === 'idle') { this.alert(); }
    this.dormant = false;
    const hp = hitPos || this.center;
    FX.blood(hp[0], hp[1], hp[2], dir[0], dir[1], dir[2], Math.min(14, 3 + Math.floor(dmg / 6)));
    // empurrão
    const mass = this.boss ? 12 : this.type === 'brutamonte' ? 3 : 1;
    const kb = Math.min(dmg, 150) * (kind === 'explosion' ? 0.12 : 0.05) / mass;
    this.vel[0] += dir[0] * kb; this.vel[2] += dir[2] * kb;
    if (kind === 'explosion') { this.vel[1] += kb * 0.6; this.onGround = false; }
    if (this.hp <= 0) { this.die(dir, kind, -this.hp); return; }
    if (this.boss) { if (Math.random() < 0.08) AUDIO.play('boss_pain', this.eye()); return; }
    if (this.state !== 'charge' && Math.random() < this.def.pain) {
      this.setState('pain'); this.painT = this.def.painTime;
      AUDIO.play(this.def.snd.pain, this.eye(), 0.9);
    }
  }
  die(dir, kind, overkill) {
    this.alive = false; this.state = 'dead'; this.st = 0; this.fall = 0;
    G.onEnemyKilled(this);
    if (this.boss) { this.bossDeath(dir); return; }
    const gib = kind === 'explosion' ? overkill > 15 || Math.random() < 0.6 : overkill > 45 || (kind === 'ssg' && overkill > 25);
    if (gib) { this.gib(dir, 1.3); return; }
    AUDIO.play(this.def.snd.death, this.eye());
    this.deathDir = dir;
    this.vel[0] += dir[0] * 2; this.vel[2] += dir[2] * 2;
    // queda para o lado do impacto: se o tiro veio de trás, cai de frente
    const f = dirFromYawPitch(this.yaw, 0);
    this.fallSign = (dir[0] * f[0] + dir[2] * f[2]) > 0.3 ? -1 : 1;
  }
  gib(dir, power) {
    this.gibbed = true; this.alive = false;
    AUDIO.play('gib', this.center);
    const s = this.scale, L = this.look;
    const c = this.center;
    FX.blood(c[0], c[1], c[2], 0, 1, 0, 26, 7);
    const parts = [
      [0.3, 0.32, 0.3, T[L.face] || T.face_vila, L.skin, 1.6],
      [0.52, 0.64, 0.28, T[L.shirtF] || T.shirt_vila, L.shirtTint || [1, 1, 1], 1.0],
      [0.16, 0.6, 0.16, T[L.sleeve] || T.skin, L.sleeveTint || [1, 1, 1], 1.2],
      [0.16, 0.6, 0.16, T[L.sleeve] || T.skin, L.sleeveTint || [1, 1, 1], 1.2],
      [0.2, 0.8, 0.2, T[L.pants] || T.jeans, [1, 1, 1], 0.6],
      [0.2, 0.8, 0.2, T[L.pants] || T.jeans, [1, 1, 1], 0.6],
      [0.2, 0.2, 0.2, T.white, [0.5, 0.05, 0.05], 1.0],
      [0.25, 0.18, 0.2, T.white, [0.6, 0.08, 0.08], 1.0],
    ];
    for (const p of parts) {
      const sp = 7 * power;
      FX.gib(c[0] + rand(-0.3, 0.3) * s, c[1] + rand(-0.4, 0.5) * s, c[2] + rand(-0.3, 0.3) * s,
        dir[0] * sp * 0.6 + rand(-4, 4), rand(3, 9) * power * p[5], dir[2] * sp * 0.6 + rand(-4, 4),
        p[0] * s * 0.5, p[1] * s * 0.5, p[2] * s * 0.5, p[3], p[4]);
    }
  }
  bossDeath(dir) {
    AUDIO.play('boss_roar', this.eye(), 1.4);
    this.dying = 2.5;
    this.deathDir = dir; this.fallSign = 1;
    G.bossDefeated(this);
  }
  updateCorpse(dt) {
    if (this.gibbed) return;
    this.st += dt;
    if (this.dying > 0) {
      this.dying -= dt;
      if (Math.random() < dt * 8) FX.explosion(this.pos[0] + rand(-1.5, 1.5), this.pos[1] + rand(0.5, 3.5), this.pos[2] + rand(-1.5, 1.5), 2.2, 0, 'none', { colorful: true, noDamage: true });
      if (this.dying <= 0) { this.gib([0, 0, 0], 2.2); FX.explosion(this.pos[0], this.pos[1] + 2, this.pos[2], 4, 0, 'none', { colorful: true, noDamage: true }); }
    }
    this.fall = Math.min(1, this.fall + dt * 2.6);
    const k = Math.min(1, 6 * dt);
    this.vel[0] -= this.vel[0] * k; this.vel[2] -= this.vel[2] * k;
    this.vel[1] -= 22 * dt;
    const oh = this.h;
    this.h = 0.4; // colisão baixa quando morto
    G.world.moveActor(this, dt, 0.3);
    this.h = oh;
  }
  // ------------------------------------------------------------------
  pose() {
    const P = {};
    const d = this.def;
    const sp = Math.min(1.3, Math.hypot(this.vel[0], this.vel[2]) / (d.speed || 5));
    const w = this.walk;
    const sw = Math.sin(w) * 0.75 * Math.min(1, sp);
    P.hips = [-0.12 * sp, 0, 0, 0, Math.abs(Math.cos(w)) * 0.05 * sp, 0];
    P.legR = [sw, 0, 0]; P.legL = [-sw, 0, 0];
    P.shinR = [-Math.max(0, Math.sin(w + 1.2)) * 1.0 * sp, 0, 0];
    P.shinL = [-Math.max(0, Math.sin(w + 1.2 + Math.PI)) * 1.0 * sp, 0, 0];
    P.armR = [-sw * 0.8, 0, 0.08]; P.armL = [sw * 0.8, 0, -0.08];
    P.foreR = [0.4 * sp + 0.15, 0, 0]; P.foreL = [0.4 * sp + 0.15, 0, 0];
    if (this.state === 'idle' || sp < 0.1) {
      const b = Math.sin(this.idleT * 2 + this.walk) * 0.04;
      P.torso = [b, 0, 0]; P.head = [0, Math.sin(this.idleT * 0.7) * 0.3, 0];
      P.armR = [0.1, 0, 0.12 + b]; P.armL = [0.1, 0, -0.12 - b];
    }
    if (this.type === 'rojoeiro') {
      P.armR = [1.35, 0, 0.35]; P.foreR = [0.1, 0, 0]; P.armL = [1.3, 0, -0.45]; P.foreL = [0.25, 0, 0];
    }
    if (this.type === 'tigrao') {
      P.tail1 = [0.4 + Math.sin(this.idleT * 3 + w) * 0.2, Math.sin(this.idleT * 2.3) * 0.6, 0];
      P.tail2 = [0.3, Math.sin(this.idleT * 2.9) * 0.5, 0];
      this.idleT += 0.016;
    }
    const st = this.state, t = this.st;
    if (st === 'windup') {
      const a = this.attack;
      if (a === 'melee') {
        const k = clamp(t / d.melee.windup, 0, 1);
        P.armR = [-2.7 * k, 0, 0.2]; P.foreR = [0.5 * k, 0, 0]; P.torso = [0.1 * k, 0.3 * k, 0];
      } else if (a === 'ranged' && d.ranged.type === 'garrafa') {
        const k = clamp(t / d.ranged.windup, 0, 1);
        P.armR = [-2.5 * k, 0, 0.25]; P.foreR = [0.8 * k, 0, 0]; P.torso = [0.15 * k, 0.4 * k, 0];
      } else if (a === 'ranged') {
        P.torso = [0.05, 0, 0];
      } else if (a === 'charge') {
        P.hips = [-0.5, 0, 0, 0, -0.15, 0]; P.armR = [0.8, 0, 0.5]; P.armL = [0.8, 0, -0.5];
      }
    } else if (st === 'recover' && this.attack === 'melee' && t < 0.25) {
      const k = 1 - t / 0.25;
      P.armR = [0.9 * k, 0, 0.2]; P.foreR = [0.2, 0, 0]; P.torso = [-0.15 * k, -0.35 * k, 0];
    } else if (st === 'recover' && this.attack === 'ranged' && t < 0.25) {
      if (d.ranged.type === 'garrafa') { P.armR = [1.0, 0, 0.2]; P.torso = [-0.2, -0.4, 0]; }
      else P.torso = [0.25 * (1 - t / 0.25), 0, 0];
    } else if (st === 'charge') {
      P.hips = [-0.55, 0, 0, 0, 0, 0]; P.armR = [-sw * 1.5 + 0.5, 0, 0.3]; P.armL = [sw * 1.5 + 0.5, 0, -0.3];
    } else if (st === 'pain' || st === 'stun') {
      P.torso = [0.35, 0, 0]; P.head = [0.4, 0, 0]; P.armR = [-0.5, 0, 0.8]; P.armL = [-0.5, 0, -0.8];
    }
    if (this.boss) {
      if (st === 'volley') { const k = clamp(t / 0.9, 0, 1); P.armR = [-2.8 * k, 0, 0.3]; P.armL = [-2.8 * k, 0, -0.3]; P.torso = [0.2 * k, 0, 0]; }
      if (st === 'jump') { if (t < 0.5) { P.hips = [-0.3, 0, 0, 0, -0.3, 0]; P.legR = [1, 0, 0]; P.legL = [1, 0, 0]; P.shinR = [-1.6, 0, 0]; P.shinL = [-1.6, 0, 0]; } else { P.armR = [-2.9, 0, 0.5]; P.armL = [-2.9, 0, -0.5]; P.legR = [0.6, 0, 0]; P.legL = [-0.3, 0, 0]; } }
      if (st === 'swipe') { const k = t < 0.45 ? t / 0.45 : 1 - (t - 0.45) / 0.45; P.armR = [-1.5 * k, 0, 1.3 * k]; P.torso = [0, 0.8 * k, 0]; }
      if (st === 'charge' && t < 0.7) { P.hips = [-0.4, 0, 0, 0, -0.1, 0]; P.head = [-0.3, 0, 0]; }
    }
    if (!this.alive) {
      const k = smooth(this.fall);
      P.armR = [-1.2 * k, 0, 1.2 * k]; P.armL = [-1.2 * k, 0, -1.2 * k];
      P.legR = [0.3 * k, 0, 0.25 * k]; P.legL = [0.1 * k, 0, -0.25 * k];
      P.shinR = [-0.2 * k, 0, 0]; P.shinL = [-0.5 * k, 0, 0];
      P.head = [0.4 * k, 0.5 * k, 0];
    }
    return P;
  }
  draw(batch, cam) {
    if (this.gibbed) return;
    const lt = this.light;
    G.world.sampleProbe(this.pos[0], this.pos[2], lt);
    const s = this.scale;
    let root;
    if (!this.alive) {
      const k = smooth(this.fall), sg = this.fallSign || 1;
      root = M34.mul(M34.trans(this.pos[0], this.pos[1] + 0.16 * s * k, this.pos[2]), M34.mul(M34.rotY(this.yaw), M34.mul(M34.rotX(sg * k * Math.PI / 2), M34.scale(s, s, s))));
    } else {
      root = M34.mul(M34.trans(this.pos[0], this.pos[1], this.pos[2]), M34.mul(M34.rotY(this.yaw), M34.scale(s, s, s)));
    }
    let light = lt;
    if (this.spawnFx > 0) light = [lt[0] + 1, lt[1] * 0.4, lt[2] * 0.4];
    this.model.emit(batch, root, this.pose(), this.look, light, { flash: this.flash > 0 });
  }
  // caixas de acerto
  hitboxes() {
    const s = this.scale, x = this.pos[0], y = this.pos[1], z = this.pos[2];
    if (!this.alive) {
      if (this.gibbed || this.fall < 0.5) return null;
      return { body: [x - 0.9 * s, y, z - 0.9 * s, x + 0.9 * s, y + 0.4 * s, z + 0.9 * s], head: null };
    }
    const r = this.r * 1.15;
    return {
      body: [x - r, y, z - r, x + r, y + this.h * 0.8, z + r],
      head: [x - 0.19 * s, y + this.h * 0.8, z - 0.19 * s, x + 0.19 * s, y + this.h * 1.0, z + 0.19 * s],
    };
  }
}

// raio x AABB (retorna t ou Infinity)
function rayAABB(ox, oy, oz, dx, dy, dz, b, maxT) {
  const idx = 1 / (dx || 1e-9), idy = 1 / (dy || 1e-9), idz = 1 / (dz || 1e-9);
  let t1 = (b[0] - ox) * idx, t2 = (b[3] - ox) * idx;
  let tmin = Math.min(t1, t2), tmax = Math.max(t1, t2);
  t1 = (b[1] - oy) * idy; t2 = (b[4] - oy) * idy;
  tmin = Math.max(tmin, Math.min(t1, t2)); tmax = Math.min(tmax, Math.max(t1, t2));
  t1 = (b[2] - oz) * idz; t2 = (b[5] - oz) * idz;
  tmin = Math.max(tmin, Math.min(t1, t2)); tmax = Math.min(tmax, Math.max(t1, t2));
  if (tmax < Math.max(tmin, 0) || tmin > maxT) return Infinity;
  return Math.max(tmin, 0);
}
