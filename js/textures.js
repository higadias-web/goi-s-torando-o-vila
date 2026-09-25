'use strict';
// ---------------------------------------------------------------------------
// Texturas procedurais em pixel art (geradas em runtime, sem arquivos)
// Todas vão para uma TEXTURE_2D_ARRAY 128x128. Desenhadas em resolução lógica
// (64x64 por padrão) e ampliadas com nearest-neighbor -> visual "crocante".
// ---------------------------------------------------------------------------
const TEX_SIZE = 128;
const T = {}; // nome -> layer
const TEXDEFS = [];

class PixBuf {
  constructor(w, h) { this.w = w; this.h = h; this.d = new Uint8ClampedArray(w * h * 4); }
  idx(x, y) {
    x = ((Math.floor(x) % this.w) + this.w) % this.w;
    y = ((Math.floor(y) % this.h) + this.h) % this.h;
    return (y * this.w + x) * 4;
  }
  set(x, y, c) {
    const i = this.idx(x, y);
    const a = c[3] === undefined ? 255 : c[3];
    if (a >= 255) { this.d[i] = c[0]; this.d[i + 1] = c[1]; this.d[i + 2] = c[2]; this.d[i + 3] = 255; }
    else {
      const t = a / 255;
      this.d[i] = this.d[i] * (1 - t) + c[0] * t;
      this.d[i + 1] = this.d[i + 1] * (1 - t) + c[1] * t;
      this.d[i + 2] = this.d[i + 2] * (1 - t) + c[2] * t;
      this.d[i + 3] = Math.max(this.d[i + 3], a);
    }
  }
  setA(x, y, c) { // sobrescreve incluindo alpha
    const i = this.idx(x, y);
    this.d[i] = c[0]; this.d[i + 1] = c[1]; this.d[i + 2] = c[2]; this.d[i + 3] = c[3] === undefined ? 255 : c[3];
  }
  get(x, y) { const i = this.idx(x, y); return [this.d[i], this.d[i + 1], this.d[i + 2], this.d[i + 3]]; }
  fill(c) { for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) this.setA(x, y, c); }
  rect(x, y, w, h, c) { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.set(x + i, y + j, c); }
  rectA(x, y, w, h, c) { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.setA(x + i, y + j, c); }
  hline(x, y, w, c) { this.rect(x, y, w, 1, c); }
  vline(x, y, h, c) { this.rect(x, y, 1, h, c); }
  // multiplica brilho
  mul(x, y, f) {
    const i = this.idx(x, y);
    this.d[i] *= f; this.d[i + 1] *= f; this.d[i + 2] *= f;
  }
  add(x, y, v) {
    const i = this.idx(x, y);
    this.d[i] += v; this.d[i + 1] += v; this.d[i + 2] += v;
  }
  circle(cx, cy, r, c) {
    for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) if (x * x + y * y <= r * r + r * 0.5) this.set(cx + x, cy + y, c);
  }
  line(x0, y0, x1, y1, c) {
    const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
    for (let i = 0; i <= n; i++) this.set(Math.round(x0 + (x1 - x0) * i / n), Math.round(y0 + (y1 - y0) * i / n), c);
  }
  text(s, x, y, c, scale = 1) { FONT.drawPix(this, s, x, y, c, scale); }
  textC(s, cx, y, c, scale = 1) { FONT.drawPix(this, s, Math.round(cx - FONT.width(s, scale) / 2), y, c, scale); }
  outline(s, cx, y, c, oc, scale = 1) {
    const x = Math.round(cx - FONT.width(s, scale) / 2);
    for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1], [1, 1], [-1, -1], [1, -1], [-1, 1]]) FONT.drawPix(this, s, x + dx, y + dy, oc, scale);
    FONT.drawPix(this, s, x, y, c, scale);
  }
}

// ruído de valor tileável
function tileNoise(rng, w, h, cells) {
  const g = [];
  for (let i = 0; i < cells * cells; i++) g.push(rng());
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const fx = x / w * cells, fy = y / h * cells;
    const x0 = Math.floor(fx), y0 = Math.floor(fy);
    const tx = smooth(fx - x0), ty = smooth(fy - y0);
    const a = g[(y0 % cells) * cells + (x0 % cells)], b = g[(y0 % cells) * cells + ((x0 + 1) % cells)];
    const c = g[((y0 + 1) % cells) * cells + (x0 % cells)], d = g[((y0 + 1) % cells) * cells + ((x0 + 1) % cells)];
    out[y * w + x] = lerp(lerp(a, b, tx), lerp(c, d, tx), ty);
  }
  return out;
}
function fbm(rng, w, h, oct = [4, 8, 16], weights = [0.5, 0.3, 0.2]) {
  const out = new Float32Array(w * h);
  oct.forEach((c, i) => {
    const n = tileNoise(rng, w, h, c);
    for (let k = 0; k < out.length; k++) out[k] += n[k] * weights[i];
  });
  return out;
}
const shade = (c, f) => [c[0] * f, c[1] * f, c[2] * f, c[3] === undefined ? 255 : c[3]];
const mix = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t), 255];

// preenche com cor base + ruído
function noisy(p, rng, base, amp = 30, oct, speck = 0.08) {
  const n = fbm(rng, p.w, p.h, oct);
  for (let y = 0; y < p.h; y++) for (let x = 0; x < p.w; x++) {
    let v = (n[y * p.w + x] - 0.5) * amp * 2 + (rng() - 0.5) * amp * speck * 4;
    p.setA(x, y, [base[0] + v, base[1] + v, base[2] + v, 255]);
  }
}
function speckle(p, rng, count, c) { for (let i = 0; i < count; i++) p.set(rng() * p.w, rng() * p.h, c); }
function crack(p, rng, len, c) {
  let x = rng() * p.w, y = rng() * p.h, a = rng() * TAU;
  for (let i = 0; i < len; i++) {
    p.set(x, y, c);
    a += (rng() - 0.5) * 1.2;
    x += Math.cos(a); y += Math.sin(a);
  }
}
// sujeira escorrendo
function grime(p, rng, amount = 0.35, fromBottom = true) {
  for (let x = 0; x < p.w; x++) {
    const len = rng() * p.h * amount;
    for (let y = 0; y < len; y++) {
      const yy = fromBottom ? p.h - 1 - y : y;
      p.mul(x, yy, 1 - 0.25 * (1 - y / len));
    }
  }
}
function quantize(p, step = 8) {
  for (let i = 0; i < p.d.length; i += 4) {
    p.d[i] = Math.round(p.d[i] / step) * step;
    p.d[i + 1] = Math.round(p.d[i + 1] / step) * step;
    p.d[i + 2] = Math.round(p.d[i + 2] / step) * step;
  }
}
function bricks(p, rng, bw, bh, mortar, base, varAmp = 20) {
  for (let row = 0; row < p.h / bh; row++) {
    const off = (row % 2) * bw / 2;
    for (let col = -1; col < p.w / bw + 1; col++) {
      const v = (rng() - 0.5) * varAmp * 2;
      const c = [base[0] + v, base[1] + v * 0.8, base[2] + v * 0.6];
      for (let y = 1; y < bh; y++) for (let x = 1; x < bw; x++) {
        const n = (rng() - 0.5) * 16;
        p.setA(col * bw + off + x, row * bh + y, [c[0] + n, c[1] + n, c[2] + n, 255]);
      }
      for (let x = 0; x < bw; x++) p.setA(col * bw + off + x, row * bh, mortar);
      for (let y = 0; y < bh; y++) p.setA(col * bw + off, row * bh + y, mortar);
    }
  }
}
function tiles(p, rng, n, grout, base, varAmp = 10) {
  const s = p.w / n;
  for (let ty = 0; ty < n; ty++) for (let tx = 0; tx < n; tx++) {
    const v = (rng() - 0.5) * varAmp * 2;
    for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) {
      const edge = x === 0 || y === 0;
      const hl = (x === 1 || y === 1) ? 12 : 0;
      p.setA(tx * s + x, ty * s + y, edge ? grout : [base[0] + v + hl + (rng() - 0.5) * 6, base[1] + v + hl + (rng() - 0.5) * 6, base[2] + v + hl + (rng() - 0.5) * 6, 255]);
    }
  }
}
function vignetteEdges(p, f = 0.8) {
  for (let x = 0; x < p.w; x++) { p.mul(x, 0, f); p.mul(x, p.h - 1, f); }
  for (let y = 0; y < p.h; y++) { p.mul(0, y, f); p.mul(p.w - 1, y, f); }
}

function defTex(name, fn, opts = {}) { TEXDEFS.push({ name, fn, w: opts.w || 64, h: opts.h || 64, q: opts.q === undefined ? 6 : opts.q, alpha: !!opts.alpha }); }

// ===== Paleta base =====
const C = {
  green: [20, 120, 55], greenD: [10, 78, 36], greenL: [60, 170, 90],
  white: [225, 228, 220], red: [180, 25, 25], redD: [120, 12, 14],
  skin: [214, 160, 118], black: [18, 18, 20], yellow: [230, 190, 40],
};

// ---------------------------------------------------------------------------
// Superfícies do cenário
// ---------------------------------------------------------------------------
defTex('concrete', (p, r) => {
  noisy(p, r, [118, 116, 110], 14);
  speckle(p, r, 90, [90, 88, 84, 255]); speckle(p, r, 50, [140, 138, 132, 255]);
  crack(p, r, 30, [70, 70, 66, 255]);
  p.hline(0, 0, 64, [96, 95, 90, 255]); p.vline(0, 0, 64, [100, 98, 94, 255]);
});
defTex('concrete_dark', (p, r) => {
  noisy(p, r, [78, 78, 76], 12);
  speckle(p, r, 80, [58, 58, 56, 255]);
  crack(p, r, 40, [48, 48, 46, 255]); grime(p, r, 0.4);
});
defTex('stand_top', (p, r) => { // degrau de arquibancada
  noisy(p, r, [128, 126, 118], 12);
  speckle(p, r, 60, [96, 94, 90, 255]);
  for (let x = 0; x < 64; x++) { p.set(x, 0, [150, 150, 144, 255]); p.set(x, 1, [140, 140, 134, 255]); }
  crack(p, r, 20, [84, 84, 80, 255]);
  // manchas de chiclete/sujeira
  for (let i = 0; i < 6; i++) p.set(r() * 64, r() * 64, [60, 60, 62, 255]);
});
defTex('paint', (p, r) => { // parede pintada branca (tingível)
  noisy(p, r, [215, 215, 210], 8);
  for (let i = 0; i < 14; i++) { const x = r() * 64, y = r() * 64; p.rect(x, y, 1 + r() * 3, 1 + r() * 2, [150, 150, 146, 255]); }
  grime(p, r, 0.25);
});
defTex('paint_green', (p, r) => {
  noisy(p, r, C.green, 10);
  for (let i = 0; i < 16; i++) { const x = r() * 64, y = r() * 64; p.rect(x, y, 1 + r() * 3, 1 + r() * 2, [120, 120, 112, 255]); }
  grime(p, r, 0.3);
});
defTex('wall_int', (p, r) => { // parede interna: barra verde embaixo, branco em cima
  noisy(p, r, [200, 200, 192], 8);
  for (let y = 40; y < 64; y++) for (let x = 0; x < 64; x++) { const n = (r() - 0.5) * 12; p.setA(x, y, [C.green[0] + n, C.green[1] + n, C.green[2] + n, 255]); }
  p.hline(0, 38, 64, [240, 240, 236, 255]); p.hline(0, 39, 64, [10, 60, 30, 255]);
  for (let i = 0; i < 10; i++) { const x = r() * 64, y = r() * 64; p.rect(x, y, 1 + r() * 2, 1, [140, 140, 134, 255]); }
  grime(p, r, 0.3);
}, { q: 4 });
defTex('facade', (p, r) => { // fachada do estádio: listras verde/branco
  noisy(p, r, [210, 212, 204], 8);
  for (let y = 0; y < 64; y++) {
    const band = Math.floor(y / 16) % 2 === 1;
    if (band) for (let x = 0; x < 64; x++) { const n = (r() - 0.5) * 12; p.setA(x, y, [C.green[0] + n, C.green[1] + n, C.green[2] + n, 255]); }
  }
  for (let i = 0; i < 30; i++) { const x = r() * 64, y = r() * 64; p.set(x, y, [120, 120, 110, 255]); }
  grime(p, r, 0.4);
});
defTex('ceiling', (p, r) => {
  noisy(p, r, [160, 160, 156], 6);
  for (let i = 0; i < 64; i += 16) { p.hline(0, i, 64, [110, 110, 106, 255]); p.vline(i, 0, 64, [110, 110, 106, 255]); }
  speckle(p, r, 120, [140, 140, 136, 255]);
  // mancha de infiltração
  for (let i = 0; i < 40; i++) { const a = r() * TAU, d = r() * 8; p.mul(40 + Math.cos(a) * d, 20 + Math.sin(a) * d, 0.85); }
});
defTex('roof_top', (p, r) => { noisy(p, r, [70, 68, 66], 10); speckle(p, r, 100, [50, 50, 50, 255]); });
defTex('floor_gran', (p, r) => { // granilite
  noisy(p, r, [150, 146, 136], 6, [4, 8, 16], 0.1);
  for (let i = 0; i < 400; i++) {
    const c = choice([[90, 90, 86], [190, 186, 176], [120, 100, 80], [60, 60, 60]]);
    p.set(r() * 64, r() * 64, [...c, 255]);
  }
  p.hline(0, 0, 64, [110, 108, 100, 255]); p.vline(0, 0, 64, [110, 108, 100, 255]);
});
defTex('floor_red', (p, r) => { // piso vermelhão
  noisy(p, r, [140, 46, 36], 10);
  for (let i = 0; i < 64; i += 32) { p.hline(0, i, 64, [90, 30, 24, 255]); p.vline(i, 0, 64, [90, 30, 24, 255]); }
  speckle(p, r, 60, [110, 36, 30, 255]); grime(p, r, 0.2, false);
});
defTex('tile_white', (p, r) => { tiles(p, r, 8, [150, 156, 150, 255], [212, 218, 214]); grime(p, r, 0.25); });
defTex('tile_green', (p, r) => { tiles(p, r, 8, [20, 60, 36, 255], [40, 130, 80]); });
defTex('tile_floor', (p, r) => { tiles(p, r, 16, [70, 74, 72, 255], [120, 126, 122], 14); });
defTex('tile_fake', (p, r) => { // azulejo com rachaduras (parede falsa secreta)
  tiles(p, r, 8, [150, 156, 150, 255], [206, 212, 208]); grime(p, r, 0.25);
  crack(p, r, 50, [90, 90, 90, 255]); crack(p, r, 40, [90, 90, 90, 255]);
});
defTex('grass', (p, r) => {
  noisy(p, r, [46, 118, 42], 10, [4, 8, 16], 0.3);
  for (let i = 0; i < 300; i++) { const x = r() * 64, y = r() * 64; p.set(x, y, [70, 150, 60, 255]); p.set(x, y + 1, [40, 100, 36, 255]); }
}, { q: 4 });
defTex('grass2', (p, r) => {
  noisy(p, r, [38, 100, 36], 10, [4, 8, 16], 0.3);
  for (let i = 0; i < 300; i++) { const x = r() * 64, y = r() * 64; p.set(x, y, [58, 130, 50, 255]); p.set(x, y + 1, [30, 84, 30, 255]); }
}, { q: 4 });
defTex('asphalt', (p, r) => {
  noisy(p, r, [52, 52, 54], 8, [4, 8, 16], 0.4);
  speckle(p, r, 200, [80, 80, 80, 255]); speckle(p, r, 120, [36, 36, 38, 255]);
  crack(p, r, 40, [30, 30, 30, 255]);
});
defTex('sidewalk', (p, r) => { // calçada de ladrilho
  for (let ty = 0; ty < 4; ty++) for (let tx = 0; tx < 4; tx++) {
    const v = (r() - 0.5) * 20;
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      const e = x === 0 || y === 0;
      const dots = ((x + 2) % 5 === 0 && (y + 2) % 5 === 0);
      const n = (r() - 0.5) * 10;
      p.setA(tx * 16 + x, ty * 16 + y, e ? [70, 70, 68, 255] : dots ? [100, 100, 96, 255] : [138 + v + n, 134 + v + n, 124 + v + n, 255]);
    }
  }
  crack(p, r, 25, [80, 80, 76, 255]);
});
defTex('brick', (p, r) => { bricks(p, r, 16, 8, [150, 140, 128, 255], [150, 70, 45], 18); grime(p, r, 0.3); });
defTex('plaster', (p, r) => { // reboco (tingível)
  noisy(p, r, [200, 196, 186], 12, [4, 8, 16], 0.2);
  crack(p, r, 30, [140, 136, 130, 255]);
  for (let i = 0; i < 8; i++) { const x = r() * 64, y = r() * 64; p.rect(x, y, 2 + r() * 5, 1 + r() * 3, [150, 120, 100, 255]); } // reboco caído -> tijolo
  grime(p, r, 0.35);
});
defTex('metal', (p, r) => {
  noisy(p, r, [104, 108, 112], 8);
  p.hline(0, 0, 64, [70, 72, 76, 255]); p.vline(0, 0, 64, [70, 72, 76, 255]);
  p.hline(0, 1, 64, [140, 144, 148, 255]);
  for (const [x, y] of [[4, 4], [60, 4], [4, 60], [60, 60], [32, 4], [32, 60]]) { p.set(x, y, [160, 164, 170, 255]); p.set(x + 1, y + 1, [60, 62, 66, 255]); }
  grime(p, r, 0.3);
  for (let i = 0; i < 20; i++) p.set(r() * 64, r() * 64, [120, 70, 40, 255]); // ferrugem
});
defTex('metal_dark', (p, r) => { noisy(p, r, [54, 56, 60], 8); p.hline(0, 0, 64, [34, 34, 38, 255]); p.vline(0, 0, 64, [34, 34, 38, 255]); });
defTex('roof_metal', (p, r) => { // telha ondulada
  for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) {
    const w = Math.sin(x / 64 * TAU * 8) * 0.5 + 0.5;
    const n = (r() - 0.5) * 8;
    p.setA(x, y, [110 + w * 50 + n, 112 + w * 50 + n, 114 + w * 50 + n, 255]);
  }
  for (let i = 0; i < 30; i++) p.set(r() * 64, r() * 64, [120, 80, 50, 255]);
  grime(p, r, 0.3);
});
defTex('wood', (p, r) => {
  for (let y = 0; y < 64; y++) {
    const plank = Math.floor(y / 16);
    const v = [(plank * 37) % 20 - 10, (plank * 17) % 16 - 8][0];
    for (let x = 0; x < 64; x++) {
      const g = Math.sin((x + plank * 13) * 0.4 + Math.sin(y * 0.3) * 2) * 8;
      p.setA(x, y, [124 + v + g + (r() - 0.5) * 8, 86 + v * 0.7 + g * 0.7, 52 + v * 0.5 + g * 0.5, 255]);
    }
    if (y % 16 === 0) p.hline(0, y, 64, [60, 40, 24, 255]);
  }
  for (let i = 0; i < 4; i++) { p.set(r() * 64, r() * 64, [50, 34, 20, 255]); }
});
defTex('crate', (p, r) => {
  for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) {
    const g = Math.sin(x * 0.5 + Math.sin(y * 0.2) * 3) * 6;
    p.setA(x, y, [150 + g + (r() - 0.5) * 10, 110 + g, 60 + g * 0.5, 255]);
  }
  p.rect(0, 0, 64, 5, [110, 76, 40, 255]); p.rect(0, 59, 64, 5, [110, 76, 40, 255]);
  p.rect(0, 0, 5, 64, [110, 76, 40, 255]); p.rect(59, 0, 5, 64, [110, 76, 40, 255]);
  p.line(5, 5, 58, 58, [110, 76, 40, 255]); p.line(6, 5, 58, 57, [110, 76, 40, 255]);
  vignetteEdges(p, 0.7);
  p.textC('CERVEJA', 32, 10, [60, 30, 10, 255]);
});
defTex('lockers', (p, r) => { // armários de vestiário
  noisy(p, r, [30, 110, 70], 6);
  for (let k = 0; k < 2; k++) {
    const x0 = k * 32;
    p.vline(x0, 0, 64, [16, 50, 34, 255]); p.vline(x0 + 1, 0, 64, [70, 160, 110, 255]);
    for (let i = 0; i < 5; i++) { p.hline(x0 + 8, 8 + i * 3, 16, [16, 56, 36, 255]); }
    p.rect(x0 + 25, 30, 2, 8, [190, 190, 180, 255]);
    p.hline(x0, 63, 32, [16, 50, 34, 255]);
    p.textC(String(k + 7), x0 + 16, 44, [230, 230, 220, 255]);
  }
  grime(p, r, 0.2);
});
defTex('door_metal', (p, r) => {
  noisy(p, r, [90, 100, 96], 8);
  p.rect(0, 0, 64, 64, [70, 80, 76, 60]);
  for (const [x, y, w, h] of [[6, 6, 52, 24], [6, 34, 52, 24]]) {
    p.rect(x, y, w, 1, [130, 140, 136, 255]); p.rect(x, y, 1, h, [130, 140, 136, 255]);
    p.rect(x, y + h, w, 1, [50, 56, 54, 255]); p.rect(x + w, y, 1, h, [50, 56, 54, 255]);
  }
  p.rect(52, 30, 6, 3, [200, 190, 120, 255]);
  vignetteEdges(p, 0.6); grime(p, r, 0.3);
});
function keyDoor(name, col, dark, label) {
  defTex(name, (p, r) => {
    noisy(p, r, [80, 84, 86], 8);
    for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) if (((x + y) >> 3) % 2 === 0 && (y < 8 || y > 55)) p.setA(x, y, [...col, 255]);
    p.rect(8, 12, 48, 40, [...dark, 255]);
    p.rect(10, 14, 44, 36, [...col, 255]);
    p.textC('CHAVE', 32, 22, [20, 20, 20, 255]);
    p.textC(label, 32, 34, [20, 20, 20, 255]);
    vignetteEdges(p, 0.5);
  });
}
keyDoor('door_green', [40, 190, 80], [10, 80, 30], 'VERDE');
keyDoor('door_white', [235, 235, 230], [120, 120, 120], 'BRANCA');
defTex('door_shop', (p, r) => { // porta de aço de enrolar
  for (let y = 0; y < 64; y++) {
    const v = (y % 4 === 0) ? -30 : (y % 4 === 1 ? 20 : 0);
    for (let x = 0; x < 64; x++) p.setA(x, y, [130 + v + (r() - 0.5) * 10, 132 + v, 134 + v, 255]);
  }
  grime(p, r, 0.5);
  // pichação
  p.text('VILA', 8 + r() * 20, 20, [180, 20, 20, 255], 2);
});
defTex('window', (p, r) => {
  p.fill([20, 26, 40, 255]);
  for (let i = 0; i < 64; i++) p.set(i, i * 0.6 + 10, [60, 70, 90, 255]);
  for (let i = 0; i < 40; i++) p.set(20 + i, i * 0.6, [50, 60, 80, 255]);
  p.rect(0, 0, 64, 3, [150, 150, 140, 255]); p.rect(0, 61, 64, 3, [150, 150, 140, 255]);
  p.rect(0, 0, 3, 64, [150, 150, 140, 255]); p.rect(61, 0, 3, 64, [150, 150, 140, 255]);
  p.rect(31, 0, 2, 64, [150, 150, 140, 255]);
});
defTex('window_lit', (p, r) => {
  p.fill([200, 170, 90, 255]);
  noisy(p, r, [190, 160, 90], 14);
  p.rect(0, 0, 64, 3, [80, 80, 74, 255]); p.rect(0, 61, 64, 3, [80, 80, 74, 255]);
  p.rect(0, 0, 3, 64, [80, 80, 74, 255]); p.rect(61, 0, 3, 64, [80, 80, 74, 255]);
  p.rect(31, 0, 2, 64, [80, 80, 74, 255]);
});
defTex('grade', (p, r) => { // grade de janela (alpha)
  p.fill([0, 0, 0, 0]);
  for (let x = 2; x < 64; x += 8) p.rectA(x, 0, 2, 64, [60, 60, 64, 255]);
  p.rectA(0, 0, 64, 3, [60, 60, 64, 255]); p.rectA(0, 30, 64, 2, [60, 60, 64, 255]);
}, { alpha: true });
defTex('fence', (p, r) => { // alambrado
  p.fill([0, 0, 0, 0]);
  for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) {
    const a = ((x + y) % 16 === 0) || ((x - y + 64) % 16 === 0);
    if (a) p.setA(x, y, [150, 155, 150, 255]);
  }
  p.rectA(0, 0, 64, 2, [90, 94, 90, 255]);
}, { alpha: true });
defTex('gate', (p, r) => {
  p.fill([0, 0, 0, 0]);
  for (let x = 0; x < 64; x += 8) p.rectA(x, 0, 3, 64, [230, 230, 226, 255]);
  p.rectA(0, 0, 64, 4, [230, 230, 226, 255]); p.rectA(0, 30, 64, 4, [230, 230, 226, 255]); p.rectA(0, 60, 64, 4, [230, 230, 226, 255]);
  p.rectA(20, 34, 24, 14, [230, 230, 226, 255]);
  p.textC('CHAVE', 32, 34, [30, 30, 30, 255]);
  p.rectA(20, 44, 24, 4, [230, 230, 226, 255]);
}, { alpha: true });
defTex('gate_red', (p, r) => {
  p.fill([0, 0, 0, 0]);
  for (let x = 0; x < 64; x += 8) p.rectA(x, 0, 4, 64, [150, 20, 20, 255]);
  p.rectA(0, 0, 64, 5, [150, 20, 20, 255]); p.rectA(0, 29, 64, 5, [150, 20, 20, 255]); p.rectA(0, 59, 64, 5, [150, 20, 20, 255]);
  for (let i = 0; i < 40; i++) p.set(r() * 64, r() * 64, [90, 40, 30, 255]);
}, { alpha: true });
defTex('net', (p, r) => {
  p.fill([0, 0, 0, 0]);
  for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) if (x % 8 === 0 || y % 8 === 0) p.setA(x, y, [236, 236, 236, 255]);
}, { alpha: true });
defTex('seats', (p, r) => { // cadeiras (encosto) com alpha
  p.fill([0, 0, 0, 0]);
  for (let k = 0; k < 2; k++) {
    const x0 = k * 32 + 3;
    for (let y = 8; y < 64; y++) for (let x = 0; x < 26; x++) {
      const rounded = y < 12 && (x < 2 || x > 23);
      if (rounded) continue;
      const n = (r() - 0.5) * 10;
      const hl = x < 3 ? 25 : (x > 22 ? -25 : 0);
      p.setA(x0 + x, y, [210 + n + hl, 212 + n + hl, 206 + n + hl, 255]);
    }
  }
}, { alpha: true });
defTex('seat_pan', (p, r) => {
  p.fill([0, 0, 0, 0]);
  for (let k = 0; k < 2; k++) {
    const x0 = k * 32 + 3;
    for (let y = 4; y < 60; y++) for (let x = 0; x < 26; x++) { const n = (r() - 0.5) * 10; p.setA(x0 + x, y, [190 + n, 192 + n, 186 + n, 255]); }
  }
}, { alpha: true });
defTex('rail', (p, r) => { noisy(p, r, [170, 170, 166], 10); p.hline(0, 20, 64, [220, 220, 216, 255]); });
defTex('light_panel', (p, r) => {
  p.fill([250, 250, 240, 255]);
  noisy(p, r, [240, 244, 236], 6);
  p.rect(0, 0, 64, 4, [120, 120, 116, 255]); p.rect(0, 60, 64, 4, [120, 120, 116, 255]);
  p.rect(0, 0, 4, 64, [120, 120, 116, 255]); p.rect(60, 0, 4, 64, [120, 120, 116, 255]);
});
defTex('lamp_orange', (p, r) => { noisy(p, r, [255, 190, 110], 10); vignetteEdges(p, 0.8); });
defTex('floodlight', (p, r) => {
  p.fill([40, 42, 46, 255]);
  for (let j = 0; j < 4; j++) for (let i = 0; i < 4; i++) {
    const cx = 8 + i * 16, cy = 8 + j * 16;
    p.circle(cx, cy, 6, [200, 200, 190, 255]);
    p.circle(cx, cy, 5, [255, 255, 244, 255]);
  }
});
defTex('floodlight_off', (p, r) => {
  p.fill([40, 42, 46, 255]);
  for (let j = 0; j < 4; j++) for (let i = 0; i < 4; i++) {
    const cx = 8 + i * 16, cy = 8 + j * 16;
    p.circle(cx, cy, 6, [70, 72, 70, 255]);
    if (r() < 0.6) { p.circle(cx, cy, 5, [26, 28, 30, 255]); crack(p, r, 6, [120, 120, 120, 255]); }
  }
});
defTex('fridge', (p, r) => { // geladeira de bebidas
  p.fill([200, 30, 30, 255]);
  p.rect(4, 4, 56, 56, [140, 200, 220, 255]);
  for (let s = 0; s < 4; s++) {
    p.hline(4, 16 + s * 12, 56, [90, 90, 96, 255]);
    for (let b = 0; b < 8; b++) {
      const col = choice([[30, 110, 40], [180, 120, 30], [200, 200, 200], [30, 30, 30]]);
      p.rect(7 + b * 7, 8 + s * 12, 4, 8, [...col, 255]);
    }
  }
  p.textC('GELADA', 32, -1, [255, 255, 255, 255]);
});
defTex('counter', (p, r) => { // balcão azulejado
  tiles(p, r, 8, [60, 60, 60, 255], [180, 180, 170]);
  p.rect(0, 0, 64, 6, [120, 120, 124, 255]);
});
defTex('tv', (p, r) => {
  p.fill([16, 16, 18, 255]);
  p.rect(3, 3, 58, 46, [40, 120, 70, 255]);
  noisy(p, r, [40, 110, 60], 20);
  p.rect(0, 0, 64, 3, [16, 16, 18, 255]); p.rect(0, 49, 64, 15, [16, 16, 18, 255]);
  p.rect(0, 0, 3, 64, [16, 16, 18, 255]); p.rect(61, 0, 3, 64, [16, 16, 18, 255]);
  p.textC('GOL!', 32, 18, [255, 255, 255, 255], 2);
});
defTex('blackboard', (p, r) => { // quadro tático
  noisy(p, r, [30, 60, 40], 6);
  p.rect(0, 0, 64, 3, [140, 100, 60, 255]); p.rect(0, 61, 64, 3, [140, 100, 60, 255]);
  p.rect(0, 0, 3, 64, [140, 100, 60, 255]); p.rect(61, 0, 3, 64, [140, 100, 60, 255]);
  const w = [220, 220, 210, 255];
  for (const [x, y] of [[14, 20], [14, 44], [26, 14], [26, 32], [26, 50], [40, 24], [40, 40], [52, 32]]) p.circle(x, y, 2, w);
  p.line(26, 32, 50, 32, w); p.line(46, 29, 50, 32, w); p.line(46, 35, 50, 32, w);
  p.text('X', 8, 6, [240, 200, 60, 255]); p.text('X', 50, 50, [240, 200, 60, 255]);
});
defTex('mirror', (p, r) => {
  for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) p.setA(x, y, [120 + y * 0.6, 140 + y * 0.6, 150 + y * 0.6, 255]);
  p.line(10, 50, 30, 10, [220, 230, 240, 255]); p.line(20, 56, 44, 8, [200, 210, 220, 255]);
  vignetteEdges(p, 0.5);
});
defTex('tank_blue', (p, r) => { noisy(p, r, [40, 90, 170], 10); p.hline(0, 10, 64, [30, 60, 120, 255]); grime(p, r, 0.3); }); // caixa d'água
defTex('canvas', (p, r) => { // lona de toldo
  for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) {
    const s = Math.floor(x / 8) % 2 === 0;
    const n = (r() - 0.5) * 10;
    p.setA(x, y, s ? [220 + n, 220 + n, 210 + n, 255] : [150 + n, 150 + n, 146 + n, 255]);
  }
  grime(p, r, 0.3, false);
});
defTex('tire', (p, r) => { noisy(p, r, [26, 26, 28], 6); for (let y = 0; y < 64; y += 6) p.hline(0, y, 64, [14, 14, 14, 255]); });
defTex('car_paint', (p, r) => {
  noisy(p, r, [210, 210, 210], 6);
  p.hline(0, 30, 64, [120, 120, 120, 255]);
  for (let i = 0; i < 10; i++) p.set(r() * 64, r() * 64, [150, 150, 150, 255]);
});
defTex('car_side', (p, r) => { // lateral com janelas
  noisy(p, r, [210, 210, 210], 6);
  p.rect(6, 4, 24, 22, [30, 36, 50, 255]); p.rect(34, 4, 24, 22, [30, 36, 50, 255]);
  p.line(8, 6, 16, 22, [80, 90, 110, 255]);
  p.hline(0, 36, 64, [130, 130, 130, 255]);
  p.rect(26, 40, 6, 2, [90, 90, 90, 255]);
});
defTex('car_burnt', (p, r) => {
  noisy(p, r, [40, 34, 30], 16);
  for (let i = 0; i < 80; i++) p.set(r() * 64, r() * 64, [110, 60, 30, 255]);
  for (let i = 0; i < 40; i++) p.set(r() * 64, r() * 64, [10, 10, 10, 255]);
});
defTex('bus_side', (p, r) => { // ônibus da torcida adversária
  noisy(p, r, [170, 24, 24], 8);
  p.rect(0, 6, 128, 20, [24, 26, 36, 255]);
  for (let x = 0; x < 128; x += 21) p.rect(x, 6, 2, 20, [170, 24, 24, 255]);
  p.rect(0, 30, 128, 3, [230, 230, 230, 255]);
  p.textC('TIGRE TUR', 64, 38, [240, 240, 240, 255], 2);
  p.rect(0, 58, 128, 6, [60, 20, 20, 255]);
  grime(p, r, 0.25);
}, { w: 128, h: 64 });
defTex('bus_front', (p, r) => {
  noisy(p, r, [170, 24, 24], 8);
  p.rect(4, 4, 56, 26, [24, 26, 36, 255]);
  p.rect(6, 34, 52, 8, [30, 30, 30, 255]);
  p.textC('VILA', 32, 34, [255, 200, 60, 255]);
  p.rect(4, 48, 10, 6, [255, 240, 200, 255]); p.rect(50, 48, 10, 6, [255, 240, 200, 255]);
});
defTex('tapume', (p, r) => { // tapume de obra
  for (let x = 0; x < 64; x++) { const pl = Math.floor(x / 16); const v = ((pl * 29) % 20) - 10; for (let y = 0; y < 64; y++) p.setA(x, y, [150 + v + (r() - 0.5) * 12, 120 + v, 80 + v, 255]); if (x % 16 === 0) p.vline(x, 0, 64, [70, 50, 30, 255]); }
  grime(p, r, 0.4);
  p.text('PROIBIDO', 6, 10, [20, 20, 20, 255]);
  p.text('COLAR', 16, 22, [20, 20, 20, 255]);
});
defTex('drum', (p, r) => { // lateral de surdo
  noisy(p, r, [200, 200, 204], 8);
  for (let x = 0; x < 64; x += 8) p.line(x, 4, x + 8, 60, [120, 120, 124, 255]);
  p.rect(0, 0, 64, 4, [40, 130, 60, 255]); p.rect(0, 60, 64, 4, [40, 130, 60, 255]);
});
defTex('drum_top', (p, r) => { noisy(p, r, [230, 226, 212], 6); p.circle(32, 32, 10, [210, 206, 194, 255]); });
defTex('botijao', (p, r) => {
  noisy(p, r, [200, 90, 30], 8);
  p.rect(0, 20, 64, 22, [230, 230, 220, 255]);
  p.textC('GÁS', 32, 23, [200, 30, 20, 255], 1);
  p.textC('P13', 32, 32, [40, 40, 40, 255], 1);
  grime(p, r, 0.3);
});
defTex('botijao_top', (p, r) => { noisy(p, r, [190, 84, 30], 8); p.circle(32, 32, 12, [120, 120, 124, 255]); p.circle(32, 32, 5, [60, 60, 64, 255]); });
defTex('flare_stick', (p, r) => { p.fill([200, 30, 30, 255]); noisy(p, r, [190, 30, 30], 10); p.rect(0, 0, 64, 10, [60, 60, 60, 255]); });

// Placas, faixas e pichações --------------------------------------------------
defTex('banner_verdao', (p, r) => {
  p.fill([...C.green, 255]); noisy(p, r, C.green, 6);
  p.rect(0, 0, 128, 2, [240, 240, 240, 255]); p.rect(0, 30, 128, 2, [240, 240, 240, 255]);
  p.outline('VERDÃO', 64, 8, [245, 245, 245, 255], [10, 50, 20, 255], 2);
}, { w: 128, h: 32 });
defTex('banner_fjg', (p, r) => {
  p.fill([236, 236, 232, 255]); noisy(p, r, [230, 230, 226], 5);
  p.rect(0, 0, 128, 3, [...C.green, 255]); p.rect(0, 29, 128, 3, [...C.green, 255]);
  p.outline('FORÇA JOVEM', 64, 8, [...C.green, 255], [8, 50, 20, 255], 1);
  p.textC('GOIÁS', 64, 18, [20, 20, 20, 255], 1);
}, { w: 128, h: 32 });
defTex('banner_goias', (p, r) => {
  for (let y = 0; y < 32; y++) for (let x = 0; x < 128; x++) {
    const s = Math.floor(x / 16) % 2 === 0; const n = (r() - 0.5) * 8;
    p.setA(x, y, s ? [C.green[0] + n, C.green[1] + n, C.green[2] + n, 255] : [230 + n, 230 + n, 226 + n, 255]);
  }
  p.rect(28, 4, 72, 24, [10, 40, 20, 255]);
  p.outline('GOIÁS', 64, 6, [255, 255, 255, 255], [0, 0, 0, 255], 2);
}, { w: 128, h: 32 });
defTex('banner_serrinha', (p, r) => {
  p.fill([20, 20, 20, 255]); noisy(p, r, [24, 24, 26], 6);
  p.rect(0, 0, 128, 2, [...C.green, 255]); p.rect(0, 30, 128, 2, [...C.green, 255]);
  p.outline('SERRINHA', 64, 4, [60, 200, 100, 255], [0, 60, 20, 255], 2);
  p.textC('É NOSSA CASA', 64, 24, [240, 240, 240, 255]);
}, { w: 128, h: 32 });
defTex('banner_tigre', (p, r) => { // faixa dos invasores
  p.fill([...C.red, 255]); noisy(p, r, C.red, 8);
  p.rect(0, 0, 128, 3, [250, 250, 250, 255]); p.rect(0, 29, 128, 3, [250, 250, 250, 255]);
  p.outline('TIGRE', 64, 5, [255, 255, 255, 255], [60, 0, 0, 255], 2);
  p.textC('A SERRINHA É NOSSA', 64, 22, [255, 230, 120, 255]);
  // rasgos
  for (let i = 0; i < 3; i++) { const x = r() * 128; for (let y = 0; y < 10; y++) p.setA(x + y * 0.3, 32 - y, [0, 0, 0, 0]); }
}, { w: 128, h: 32, alpha: true });
defTex('sign_estadio', (p, r) => {
  p.fill([236, 236, 232, 255]);
  p.rect(0, 0, 128, 3, [...C.green, 255]); p.rect(0, 29, 128, 3, [...C.green, 255]);
  p.textC('ESTÁDIO', 64, 4, [...C.greenD, 255]);
  p.textC('HAILÉ PINHEIRO', 64, 16, [...C.greenD, 255]);
}, { w: 128, h: 32 });
defTex('sign_serrinha', (p, r) => {
  p.fill([...C.green, 255]);
  p.outline('SERRINHA', 64, 8, [255, 255, 255, 255], [0, 40, 10, 255], 2);
}, { w: 128, h: 32 });
function shopSign(name, bg, fg, l1, l2) {
  defTex(name, (p, r) => {
    p.fill([...bg, 255]); noisy(p, r, bg, 8);
    p.rect(0, 0, 128, 2, [30, 30, 30, 255]); p.rect(0, 30, 128, 2, [30, 30, 30, 255]);
    if (l2) { p.outline(l1, 64, 3, [...fg, 255], [30, 30, 30, 255], 1); p.textC(l2, 64, 17, [30, 30, 30, 255]); }
    else p.outline(l1, 64, 6, [...fg, 255], [30, 30, 30, 255], 2);
    grime(p, r, 0.3);
  }, { w: 128, h: 32 });
}
shopSign('sign_bar', [240, 200, 40], [200, 30, 20], 'BAR DO ZÉ', 'CERVEJA GELADA');
shopSign('sign_pamonha', [120, 190, 70], [255, 250, 200], 'PAMONHARIA', 'PAMONHA E CURAU');
shopSign('sign_pitdog', [40, 40, 44], [255, 140, 30], 'PIT DOG', 'DO JUCA · 24H');
shopSign('sign_oficina', [60, 90, 150], [255, 255, 255], 'BORRACHARIA', 'E OFICINA');
shopSign('sign_lanch', [230, 230, 220], [20, 120, 55], 'LANCHONETE', 'SALGADO · REFRI');
shopSign('sign_vest', [20, 120, 55], [255, 255, 255], 'VESTIÁRIO', 'GOIÁS E.C.');
shopSign('sign_tunnel', [20, 20, 20], [70, 200, 110], 'GRAMADO', 'ACESSO RESTRITO');
shopSign('sign_imprensa', [30, 60, 120], [255, 255, 255], 'IMPRENSA', 'CABINES DE RÁDIO');
shopSign('sign_visit', [150, 20, 20], [255, 255, 255], 'VISITANTE', 'PORTÃO 7');
shopSign('sign_bilheteria', [240, 240, 236], [20, 120, 55], 'BILHETERIA', 'INGRESSOS');
// placas de publicidade (proporção 4:1)
function adBoard(name, bg, fg, txt, sub) {
  defTex(name, (p, r) => {
    p.fill([...bg, 255]);
    p.rect(0, 0, 64, 1, [20, 20, 20, 255]); p.rect(0, 15, 64, 1, [20, 20, 20, 255]);
    p.textC(txt, 32, sub ? -1 : 3, [...fg, 255]);
    if (sub) p.textC(sub, 32, 7, [...fg, 255]);
  }, { w: 64, h: 16, q: 1 });
}
adBoard('ad1', [240, 200, 30], [30, 60, 20], 'PAMONHAS', 'DA VÓ');
adBoard('ad2', [20, 120, 55], [255, 255, 255], 'PEQUI', 'É VIDA');
adBoard('ad3', [30, 30, 30], [255, 140, 30], 'PIT DOG');
adBoard('ad4', [230, 230, 230], [20, 120, 55], 'VERDÃO');
adBoard('ad5', [40, 70, 150], [255, 255, 255], 'RÁDIO', 'SERRINHA');
adBoard('ad6', [200, 30, 30], [255, 255, 255], 'EMPADÃO', 'GOIANO');
adBoard('ad7', [250, 250, 250], [30, 30, 30], 'FJG', 'SEMPRE');
defTex('scoreboard', (p, r) => { p.fill([10, 10, 12, 255]); }, { w: 128, h: 64 }); // desenhado dinamicamente

// pichações (alpha sobre concreto não; já com fundo)
defTex('graffiti_fjg', (p, r) => {
  noisy(p, r, [190, 192, 186], 10); grime(p, r, 0.4);
  const g = [30, 160, 70, 255];
  p.text('FJG', 6, 14, g, 3);
  for (let i = 0; i < 12; i++) { const x = 8 + r() * 48, y0 = 44; for (let y = 0; y < 3 + r() * 10; y++) p.set(x, y0 + y, g); }
  p.text('SERRINHA', 8, 50, [20, 20, 20, 255]);
});
defTex('graffiti_vila', (p, r) => {
  noisy(p, r, [190, 192, 186], 10); grime(p, r, 0.4);
  const rd = [200, 20, 20, 255];
  p.text('TIGRE', 3, 16, rd, 2);
  for (let i = 0; i < 10; i++) { const x = 4 + r() * 56, y0 = 36; for (let y = 0; y < 3 + r() * 8; y++) p.set(x, y0 + y, rd); }
  // riscado pelo verde
  p.line(2, 14, 62, 38, [30, 170, 70, 255]); p.line(2, 15, 62, 39, [30, 170, 70, 255]);
  p.line(2, 38, 62, 14, [30, 170, 70, 255]); p.line(2, 39, 62, 15, [30, 170, 70, 255]);
});
defTex('graffiti_verdao', (p, r) => {
  bricks(p, r, 16, 8, [150, 140, 128, 255], [150, 70, 45], 18); grime(p, r, 0.3);
  p.outline('VERDÃO', 32, 20, [40, 200, 90, 255], [255, 255, 255, 255], 1);
  p.text('♥', 28, 34, [220, 30, 30, 255], 1);
});
defTex('poster_goias', (p, r) => {
  p.fill([236, 236, 230, 255]);
  p.rect(2, 2, 60, 60, [...C.green, 255]);
  p.circle(32, 26, 14, [240, 240, 240, 255]);
  p.circle(32, 26, 11, [...C.green, 255]);
  p.textC('G', 32, 17, [255, 255, 255, 255], 2);
  p.textC('GOIÁS', 32, 44, [255, 255, 255, 255]);
  p.textC('ESPORTE CLUBE', 32, 53, [255, 255, 255, 255]);
});
defTex('poster_jogo', (p, r) => {
  p.fill([240, 238, 226, 255]);
  p.rect(0, 0, 64, 14, [30, 30, 30, 255]);
  p.textC('CLÁSSICO', 32, 2, [255, 255, 255, 255]);
  p.textC('GOIÁS', 32, 18, [...C.green, 255]);
  p.textC('x', 32, 28, [30, 30, 30, 255]);
  p.textC('VILA', 32, 38, [...C.red, 255]);
  p.textC('DOMINGO 16H', 32, 50, [30, 30, 30, 255]);
});

// ---------------------------------------------------------------------------
// Personagens
// ---------------------------------------------------------------------------
function faceBase(p, r, skin) { noisy(p, r, skin, 5); }
defTex('skin', (p, r) => { noisy(p, r, [200, 200, 200], 5); }); // tingível
defTex('face_vila', (p, r) => { // rosto bravo (tingível: base clara)
  noisy(p, r, [205, 205, 205], 4);
  const dk = [40, 30, 28, 255];
  // sobrancelhas franzidas
  p.line(12, 22, 26, 27, dk); p.line(12, 23, 26, 28, dk);
  p.line(52, 22, 38, 27, dk); p.line(52, 23, 38, 28, dk);
  // olhos
  p.rect(16, 29, 8, 5, [250, 250, 250, 255]); p.rect(40, 29, 8, 5, [250, 250, 250, 255]);
  p.rect(20, 30, 3, 4, [30, 20, 20, 255]); p.rect(42, 30, 3, 4, [30, 20, 20, 255]);
  // nariz
  p.rect(30, 32, 4, 10, [170, 170, 170, 255]);
  // boca gritando
  p.rect(22, 46, 20, 9, [80, 20, 20, 255]); p.rect(24, 46, 16, 2, [240, 240, 230, 255]);
  p.rect(0, 0, 64, 10, [60, 44, 30, 255]); // cabelo na testa
});
defTex('face_bandana', (p, r) => { // rosto com pano vermelho (organizada)
  noisy(p, r, [205, 205, 205], 4);
  const dk = [40, 30, 28, 255];
  p.line(12, 22, 26, 27, dk); p.line(52, 22, 38, 27, dk);
  p.rect(16, 29, 8, 5, [250, 250, 250, 255]); p.rect(40, 29, 8, 5, [250, 250, 250, 255]);
  p.rect(20, 30, 3, 4, [30, 20, 20, 255]); p.rect(42, 30, 3, 4, [30, 20, 20, 255]);
  for (let y = 38; y < 64; y++) for (let x = 0; x < 64; x++) { const n = (r() - 0.5) * 20; p.setA(x, y, [200 + n, 20, 24, 255]); }
  for (let x = 0; x < 64; x += 8) p.rect(x + 2, 44 + (x % 16 === 0 ? 0 : 8), 3, 3, [250, 250, 250, 255]);
  p.rect(0, 0, 64, 8, [40, 30, 24, 255]);
});
defTex('face_beard', (p, r) => {
  noisy(p, r, [205, 205, 205], 4);
  const dk = [40, 30, 28, 255];
  p.rect(12, 22, 14, 3, dk); p.rect(38, 22, 14, 3, dk);
  p.rect(16, 28, 8, 5, [250, 250, 250, 255]); p.rect(40, 28, 8, 5, [250, 250, 250, 255]);
  p.rect(19, 29, 3, 4, [30, 20, 20, 255]); p.rect(43, 29, 3, 4, [30, 20, 20, 255]);
  p.rect(30, 31, 4, 10, [170, 170, 170, 255]);
  for (let y = 42; y < 64; y++) for (let x = 6; x < 58; x++) if (r() < 0.85) p.setA(x, y, [50 + r() * 20, 36, 26, 255]);
  p.rect(24, 48, 16, 5, [90, 20, 20, 255]);
  p.rect(0, 0, 64, 12, [40, 30, 24, 255]);
});
defTex('hair', (p, r) => { noisy(p, r, [46, 34, 26], 10); for (let i = 0; i < 80; i++) p.set(r() * 64, r() * 64, [26, 20, 16, 255]); });
defTex('shirt_vila', (p, r) => { // camisa vermelha com gola branca e escudo
  noisy(p, r, [190, 24, 26], 8);
  for (let i = 0; i < 30; i++) p.set(r() * 64, r() * 64, [150, 16, 18, 255]);
  p.rect(22, 0, 20, 5, [240, 240, 240, 255]); p.rect(28, 5, 8, 4, [240, 240, 240, 255]); // gola V
  // escudo genérico
  p.rect(40, 14, 12, 12, [250, 250, 250, 255]); p.rect(42, 16, 8, 8, [190, 24, 26, 255]);
  p.rect(44, 26, 4, 2, [250, 250, 250, 255]);
  p.rect(0, 58, 64, 6, [150, 16, 18, 255]);
});
defTex('shirt_vila2', (p, r) => { // listrada vermelha e branca
  for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) {
    const s = Math.floor(x / 8) % 2 === 0; const n = (r() - 0.5) * 12;
    p.setA(x, y, s ? [190 + n, 24, 26, 255] : [230 + n, 230 + n, 230 + n, 255]);
  }
  p.rect(22, 0, 20, 4, [30, 30, 30, 255]);
});
defTex('shirt_back', (p, r) => { // costas com número
  noisy(p, r, [190, 24, 26], 8);
  p.textC('10', 32, 18, [250, 250, 250, 255], 3);
});
defTex('jeans', (p, r) => { noisy(p, r, [50, 70, 120], 10); for (let y = 0; y < 64; y += 3) for (let x = 0; x < 64; x++) if ((x + y) % 5 === 0) p.set(x, y, [40, 56, 96, 255]); });
defTex('shorts', (p, r) => { noisy(p, r, [30, 30, 34], 8); p.vline(4, 0, 64, [230, 230, 230, 255]); p.vline(59, 0, 64, [230, 230, 230, 255]); });
defTex('shoes', (p, r) => { noisy(p, r, [30, 30, 30], 6); p.rect(0, 50, 64, 14, [220, 220, 220, 255]); });
defTex('cap', (p, r) => { noisy(p, r, [170, 20, 22], 8); p.rect(24, 20, 16, 16, [250, 250, 250, 255]); p.textC('V', 32, 21, [170, 20, 22, 255]); });
defTex('torso_skin', (p, r) => { // brutamonte sem camisa, com tatuagem
  noisy(p, r, [205, 205, 205], 5);
  p.rect(10, 20, 18, 3, [160, 160, 160, 255]); p.rect(36, 20, 18, 3, [160, 160, 160, 255]); // peitoral
  p.vline(32, 26, 30, [170, 170, 170, 255]);
  for (let y = 30; y < 54; y += 7) { p.hline(24, y, 16, [175, 175, 175, 255]); }
  // tatuagem de tigre
  p.text('VILA', 4, 4, [60, 60, 120, 255]);
});
defTex('tiger_fur', (p, r) => {
  noisy(p, r, [230, 130, 30], 10);
  for (let i = 0; i < 8; i++) {
    let x = r() * 64, y = r() * 64;
    for (let k = 0; k < 16; k++) { p.rect(x, y, 3, 2, [30, 20, 14, 255]); x += 1; y += (r() - 0.5) * 3; }
  }
});
defTex('tiger_face', (p, r) => {
  noisy(p, r, [230, 130, 30], 8);
  p.rect(12, 34, 40, 30, [240, 236, 226, 255]); // focinho branco
  for (const x of [4, 50]) { p.rect(x, 8, 10, 3, [30, 20, 14, 255]); p.rect(x + 2, 14, 8, 2, [30, 20, 14, 255]); }
  p.rect(24, 4, 3, 12, [30, 20, 14, 255]); p.rect(37, 4, 3, 12, [30, 20, 14, 255]);
  // olhos amarelos furiosos
  p.rect(12, 22, 12, 7, [250, 230, 60, 255]); p.rect(40, 22, 12, 7, [250, 230, 60, 255]);
  p.rect(17, 22, 3, 7, [10, 10, 10, 255]); p.rect(45, 22, 3, 7, [10, 10, 10, 255]);
  p.line(10, 19, 26, 23, [30, 20, 14, 255]); p.line(54, 19, 38, 23, [30, 20, 14, 255]);
  // nariz e boca com dentes
  p.rect(27, 34, 10, 6, [60, 30, 30, 255]);
  p.rect(16, 46, 32, 12, [120, 20, 20, 255]);
  for (let x = 17; x < 47; x += 5) { p.rect(x, 46, 3, 4, [250, 250, 240, 255]); p.rect(x + 2, 54, 3, 4, [250, 250, 240, 255]); }
});
defTex('tiger_belly', (p, r) => { noisy(p, r, [240, 236, 226], 6); p.textC('10', 32, 20, [200, 30, 30, 255], 3); });
defTex('sleeve_fjg', (p, r) => { // manga do protagonista (camisa da Força Jovem)
  noisy(p, r, [24, 120, 56], 8);
  p.rect(0, 0, 64, 6, [240, 240, 240, 255]); p.rect(0, 8, 64, 3, [240, 240, 240, 255]);
  for (let i = 0; i < 20; i++) p.set(r() * 64, r() * 64, [14, 90, 40, 255]);
});
defTex('hand', (p, r) => { noisy(p, r, [196, 144, 104], 5); for (let x = 12; x < 64; x += 13) p.vline(x, 0, 30, [160, 110, 80, 255]); });

// ---------------------------------------------------------------------------
// Armas e itens
// ---------------------------------------------------------------------------
defTex('gun_metal', (p, r) => { noisy(p, r, [78, 82, 90], 8); p.hline(0, 1, 64, [140, 144, 152, 255]); p.hline(0, 62, 64, [50, 52, 58, 255]); p.vline(1, 0, 64, [120, 124, 130, 255]); speckle(p, r, 40, [100, 104, 112, 255]); });
defTex('gun_metal_light', (p, r) => { noisy(p, r, [150, 154, 160], 8); p.hline(0, 1, 64, [205, 208, 214, 255]); p.hline(0, 62, 64, [90, 92, 98, 255]); p.vline(1, 0, 64, [190, 194, 200, 255]); });
defTex('gun_wood', (p, r) => {
  for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) {
    const g = Math.sin(y * 0.5 + Math.sin(x * 0.15) * 3) * 10;
    p.setA(x, y, [120 + g + (r() - 0.5) * 6, 70 + g * 0.6, 36 + g * 0.3, 255]);
  }
});
defTex('pvc', (p, r) => { // cano de PVC com fita verde
  noisy(p, r, [215, 215, 208], 6);
  p.rect(0, 20, 64, 10, [30, 150, 70, 255]); p.rect(0, 44, 64, 5, [30, 150, 70, 255]);
  p.text('FJG', 22, 32, [30, 30, 30, 255]);
  grime(p, r, 0.2);
});
defTex('rojao_paper', (p, r) => { // papel do rojão
  for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) {
    const s = Math.floor((x + y) / 8) % 3;
    p.setA(x, y, s === 0 ? [220, 30, 30, 255] : s === 1 ? [250, 220, 40, 255] : [40, 160, 70, 255]);
  }
});
defTex('flag_goias', (p, r) => { // bandeira verde e branca da torcida
  for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) {
    const s = Math.floor(y / 16) % 2 === 0; const n = (r() - 0.5) * 8;
    p.setA(x, y, s ? [C.green[0] + n, C.green[1] + n, C.green[2] + n, 255] : [236 + n, 236 + n, 232 + n, 255]);
  }
  p.circle(32, 32, 13, [240, 240, 240, 255]); p.circle(32, 32, 11, [...C.greenD, 255]);
  p.textC('FJG', 32, 26, [255, 255, 255, 255]);
});
defTex('pamonha', (p, r) => {
  noisy(p, r, [200, 200, 110], 12);
  for (let x = 0; x < 64; x += 5) p.vline(x, 0, 64, [150, 160, 80, 255]);
  p.rect(0, 28, 64, 6, [240, 230, 190, 255]); // amarrado
});
defTex('pequi', (p, r) => { noisy(p, r, [240, 180, 30], 12); p.circle(32, 32, 10, [250, 210, 60, 255]); });
defTex('empadao', (p, r) => {
  noisy(p, r, [200, 140, 60], 14);
  for (let i = 0; i < 6; i++) p.line(0, i * 11, 64, i * 11 + 20, [160, 100, 40, 255]);
  p.rect(0, 0, 64, 6, [150, 150, 150, 255]);
});
defTex('manto', (p, r) => { // camisa da torcida (armadura)
  noisy(p, r, [24, 130, 60], 8);
  p.rect(0, 20, 64, 8, [245, 245, 245, 255]);
  p.rect(24, 0, 16, 6, [245, 245, 245, 255]);
  p.textC('FJG', 32, 34, [245, 245, 245, 255], 2);
});
defTex('ammo_box', (p, r) => {
  noisy(p, r, [80, 90, 50], 8);
  p.rect(0, 0, 64, 4, [50, 56, 30, 255]);
  p.textC('BALAS', 32, 20, [240, 220, 120, 255]);
  p.textC('9MM', 32, 32, [240, 220, 120, 255]);
});
defTex('shell_box', (p, r) => {
  noisy(p, r, [170, 30, 26], 8);
  p.rect(0, 0, 64, 4, [110, 18, 16, 255]);
  p.textC('CAL.12', 32, 20, [250, 230, 150, 255]);
  for (let i = 0; i < 4; i++) p.rect(10 + i * 12, 36, 8, 14, [200, 170, 60, 255]);
});
defTex('rocket_box', (p, r) => {
  noisy(p, r, [60, 60, 70], 8);
  p.textC('ROJÃO', 32, 8, [250, 220, 40, 255]);
  p.textC('12 TIROS', 32, 20, [250, 250, 250, 255]);
  for (let i = 0; i < 5; i++) { const x = 8 + i * 11; p.rect(x, 34, 6, 20, [220, 30, 30, 255]); p.rect(x + 2, 30, 2, 4, [200, 200, 200, 255]); }
});
defTex('key_green', (p, r) => { noisy(p, r, [60, 220, 100], 10); });
defTex('key_white', (p, r) => { noisy(p, r, [240, 240, 236], 8); });
defTex('glass_green', (p, r) => { noisy(p, r, [40, 120, 50], 16); p.vline(20, 0, 64, [140, 220, 140, 255]); });
defTex('glass_brown', (p, r) => { noisy(p, r, [110, 60, 20], 16); p.vline(20, 0, 64, [200, 150, 90, 255]); p.rect(0, 26, 64, 14, [230, 220, 180, 255]); });

// ---------------------------------------------------------------------------
// Efeitos (sprites)
// ---------------------------------------------------------------------------
defTex('glow', (p, r) => {
  for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) {
    const d = Math.hypot(x - 31.5, y - 31.5) / 32;
    const a = Math.max(0, 1 - d); const v = a * a;
    p.setA(x, y, [255, 255, 255, Math.floor(v * 16) / 16 * 255]);
  }
}, { alpha: true, q: 1 });
defTex('flash', (p, r) => { // estrela de disparo
  p.fill([0, 0, 0, 0]);
  for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) {
    const dx = x - 31.5, dy = y - 31.5, d = Math.hypot(dx, dy);
    const a = Math.atan2(dy, dx);
    const star = 18 + Math.abs(Math.cos(a * 3)) * 13;
    if (d < star) {
      const t = 1 - d / star;
      p.setA(x, y, [255, 200 + t * 55, 80 + t * 170, Math.min(255, t * 400)]);
    }
  }
}, { alpha: true, q: 1 });
defTex('spark', (p, r) => {
  p.fill([0, 0, 0, 0]);
  for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) {
    const d = Math.min(Math.abs(x - 31.5), Math.abs(y - 31.5)), rr = Math.hypot(x - 31.5, y - 31.5);
    if ((d < 3 && rr < 30) || rr < 9) p.setA(x, y, [255, 255, 255, 255 * (1 - rr / 32)]);
  }
}, { alpha: true, q: 1 });
defTex('smoke', (p, r) => {
  const n = fbm(r, 64, 64, [4, 8]);
  for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) {
    const d = Math.hypot(x - 31.5, y - 31.5) / 30;
    const a = (1 - d) * 1.4 + (n[y * 64 + x] - 0.5) * 1.2;
    const v = 170 + (n[y * 64 + x] - 0.5) * 80;
    p.setA(x, y, [v, v, v, a > 0.5 ? 255 : 0]);
  }
}, { alpha: true, q: 8 });
defTex('fire', (p, r) => {
  const n = fbm(r, 64, 64, [4, 8]);
  for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) {
    const d = Math.hypot((x - 31.5) * 1.3, (y - 40) * 0.9) / 30;
    const t = 1 - d + (n[y * 64 + x] - 0.5) * 0.8;
    if (t > 0.1) p.setA(x, y, [255, 120 + t * 135, t * 120, Math.min(255, t * 500)]);
    else p.setA(x, y, [0, 0, 0, 0]);
  }
}, { alpha: true, q: 1 });
defTex('blood', (p, r) => { // mancha (alpha)
  p.fill([0, 0, 0, 0]);
  for (let i = 0; i < 14; i++) {
    const a = r() * TAU, d = r() * 18, rr = 3 + r() * 9;
    p.circle(32 + Math.cos(a) * d, 32 + Math.sin(a) * d, rr, [120 + r() * 40, 8, 10, 255]);
  }
  for (let i = 0; i < 20; i++) { const a = r() * TAU, d = 20 + r() * 10; p.circle(32 + Math.cos(a) * d, 32 + Math.sin(a) * d, 1 + r() * 2, [110, 6, 8, 255]); }
}, { alpha: true });
defTex('bullet_hole', (p, r) => {
  p.fill([0, 0, 0, 0]);
  p.circle(32, 32, 14, [60, 58, 56, 255]);
  p.circle(32, 32, 9, [20, 18, 18, 255]);
  for (let i = 0; i < 8; i++) { const a = r() * TAU; p.line(32, 32, 32 + Math.cos(a) * 22, 32 + Math.sin(a) * 22, [50, 48, 46, 255]); }
}, { alpha: true });
defTex('scorch', (p, r) => {
  p.fill([0, 0, 0, 0]);
  for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) {
    const d = Math.hypot(x - 31.5, y - 31.5) / 32 + (r() - 0.5) * 0.3;
    if (d < 0.9) p.setA(x, y, [20 + d * 30, 18 + d * 26, 16 + d * 20, 255]);
  }
}, { alpha: true });
defTex('white', (p) => { p.fill([255, 255, 255, 255]); }, { q: 1 });
defTex('ball', (p, r) => { // bola de futebol (gomos)
  p.fill([236, 236, 232, 255]);
  const spots = [[8, 16], [40, 16], [24, 48], [56, 48]];
  for (const [x, y] of spots) {
    for (let a = 0; a < 5; a++) { const t = a / 5 * TAU; p.line(x, y, x + Math.cos(t) * 14, y + Math.sin(t) * 14, [150, 150, 146, 255]); }
    p.circle(x, y, 6, [20, 20, 24, 255]);
  }
  for (let i = 0; i < 40; i++) p.set(r() * 64, r() * 64, [200, 200, 196, 255]);
});
defTex('confetti', (p, r) => { p.fill([255, 255, 255, 255]); }, { q: 1 });
defTex('shockwave', (p, r) => {
  p.fill([0, 0, 0, 0]);
  for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) {
    const d = Math.hypot(x - 31.5, y - 31.5) / 32;
    if (d > 0.78 && d < 0.98) p.setA(x, y, [255, 220, 160, 255 * (1 - Math.abs(d - 0.88) / 0.1)]);
  }
}, { alpha: true, q: 1 });

// ---------------------------------------------------------------------------
// Geração final -> Uint8Array com todas as camadas 128x128
// ---------------------------------------------------------------------------
function buildTextures() {
  const N = TEXDEFS.length;
  const out = new Uint8Array(TEX_SIZE * TEX_SIZE * 4 * N);
  TEXDEFS.forEach((def, layer) => {
    T[def.name] = layer;
    let seed = 0;
    for (const ch of def.name) seed = (seed * 31 + ch.charCodeAt(0)) | 0;
    const rng = mulberry32(seed ^ 0x9e3779b9);
    const p = new PixBuf(def.w, def.h);
    p.fill([128, 128, 128, 255]);
    def.fn(p, rng);
    if (def.q > 1) quantize(p, def.q);
    // amplia (nearest) para 128x128
    const sx = def.w / TEX_SIZE, sy = def.h / TEX_SIZE;
    const base = layer * TEX_SIZE * TEX_SIZE * 4;
    for (let y = 0; y < TEX_SIZE; y++) for (let x = 0; x < TEX_SIZE; x++) {
      const i = p.idx(Math.floor(x * sx), Math.floor(y * sy));
      const o = base + (y * TEX_SIZE + x) * 4;
      out[o] = p.d[i]; out[o + 1] = p.d[i + 1]; out[o + 2] = p.d[i + 2]; out[o + 3] = p.d[i + 3];
    }
    def.pix = p;
  });
  return { data: out, count: N };
}

// Redesenha o placar (camada dinâmica)
function drawScoreboard(goias, vila, timeStr) {
  const p = new PixBuf(128, 64);
  p.fill([8, 8, 10, 255]);
  // moldura
  p.rect(0, 0, 128, 2, [60, 60, 64, 255]); p.rect(0, 62, 128, 2, [60, 60, 64, 255]);
  const amber = [255, 170, 40, 255], grn = [60, 230, 110, 255], red = [255, 60, 50, 255];
  p.textC('SERRINHA', 64, 3, amber);
  p.text('GOIÁS', 6, 16, grn);
  p.text('VILA', 84, 16, red);
  const gs = String(goias), vs = String(vila);
  p.textC(gs, 26, 28, grn, 2);
  p.textC('x', 64, 32, amber, 1);
  p.textC(vs, 100, 28, red, 2);
  p.textC(timeStr, 64, 52, amber);
  // efeito de LEDs: grade escura
  for (let y = 0; y < 64; y += 2) for (let x = 0; x < 128; x++) p.mul(x, y, 0.7);
  const out = new Uint8Array(TEX_SIZE * TEX_SIZE * 4);
  for (let y = 0; y < TEX_SIZE; y++) for (let x = 0; x < TEX_SIZE; x++) {
    const i = p.idx(x, Math.floor(y / 2));
    const o = (y * TEX_SIZE + x) * 4;
    out[o] = p.d[i]; out[o + 1] = p.d[i + 1]; out[o + 2] = p.d[i + 2]; out[o + 3] = 255;
  }
  return out;
}
