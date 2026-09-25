'use strict';
// ---------------------------------------------------------------------------
// Renderizador WebGL2 estilo "boomer shooter": baixa resolução, texturas
// nearest, luz de vértice assada + luzes dinâmicas por pixel, bandas de luz
// com dithering Bayer, neblina e redução de cor.
// ---------------------------------------------------------------------------
const VSTRIDE = 13; // pos3 uvl3 light3 tint4
const MAX_DYN_LIGHTS = 16;

class QuadBatch {
  constructor(maxQuads) {
    this.max = maxQuads;
    this.data = new Float32Array(maxQuads * 4 * VSTRIDE);
    this.n = 0; // quads
    this.v = 0; // vertices escritos
    this.vao = null; this.vbo = null; this.gpuQuads = 0;
  }
  reset() { this.n = 0; this.v = 0; }
  full() { return this.n >= this.max; }
  vert(x, y, z, u, v, l, lr, lg, lb, tr, tg, tb, te) {
    const d = this.data; let o = this.v * VSTRIDE;
    d[o] = x; d[o + 1] = y; d[o + 2] = z; d[o + 3] = u; d[o + 4] = v; d[o + 5] = l;
    d[o + 6] = lr; d[o + 7] = lg; d[o + 8] = lb; d[o + 9] = tr; d[o + 10] = tg; d[o + 11] = tb; d[o + 12] = te;
    this.v++;
  }
  // quad com luz/tint uniformes. p = [ax,ay,az,bx,by,bz,cx,cy,cz,dx,dy,dz] (BL,BR,TR,TL)
  quad(p, u0, v0, u1, v1, layer, lr, lg, lb, tr, tg, tb, te) {
    if (this.n >= this.max) return;
    this.vert(p[0], p[1], p[2], u0, v1, layer, lr, lg, lb, tr, tg, tb, te);
    this.vert(p[3], p[4], p[5], u1, v1, layer, lr, lg, lb, tr, tg, tb, te);
    this.vert(p[6], p[7], p[8], u1, v0, layer, lr, lg, lb, tr, tg, tb, te);
    this.vert(p[9], p[10], p[11], u0, v0, layer, lr, lg, lb, tr, tg, tb, te);
    this.n++;
  }
}

const R = {
  gl: null, canvas: null, W: 320, H: 180,
  quality: { bands: 10, dither: 1, colorBits: 32 },
  init(canvas) {
    this.canvas = canvas;
    const gl = canvas.getContext('webgl2', { antialias: false, alpha: false, depth: true, powerPreference: 'high-performance' });
    if (!gl) throw new Error('WebGL2 não suportado neste navegador.');
    this.gl = gl;
    gl.enable(gl.DEPTH_TEST);
    gl.enable(gl.CULL_FACE);
    gl.cullFace(gl.BACK);
    this.progWorld = this.program(VS_WORLD, FS_WORLD);
    this.progAdd = this.program(VS_WORLD, FS_ADD);
    this.progSky = this.program(VS_SKY, FS_SKY);
    this.uW = this.uniforms(this.progWorld, ['uVP', 'uCam', 'uLP', 'uLC', 'uNL', 'uFog', 'uFogD', 'uBands', 'uDither', 'uBright', 'uTex', 'uColBits', 'uFlash']);
    this.uA = this.uniforms(this.progAdd, ['uVP', 'uCam', 'uFogD', 'uTex']);
    this.uS = this.uniforms(this.progSky, ['uR', 'uU', 'uF', 'uTan', 'uFog', 'uMoon', 'uTime', 'uColBits', 'uBright']);
    // índice compartilhado de quads
    this.maxIndexQuads = 180000;
    const idx = new Uint32Array(this.maxIndexQuads * 6);
    for (let i = 0; i < this.maxIndexQuads; i++) {
      const b = i * 4, o = i * 6;
      idx[o] = b; idx[o + 1] = b + 1; idx[o + 2] = b + 2; idx[o + 3] = b; idx[o + 4] = b + 2; idx[o + 5] = b + 3;
    }
    this.ibo = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.ibo);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, idx, gl.STATIC_DRAW);
    this.skyVAO = gl.createVertexArray();
    // luzes dinâmicas
    this.lp = new Float32Array(MAX_DYN_LIGHTS * 4);
    this.lc = new Float32Array(MAX_DYN_LIGHTS * 4);
    this.nl = 0;
  },
  program(vs, fs) {
    const gl = this.gl;
    const mk = (type, src) => {
      const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error('Shader: ' + gl.getShaderInfoLog(s));
      return s;
    };
    const p = gl.createProgram();
    gl.attachShader(p, mk(gl.VERTEX_SHADER, vs)); gl.attachShader(p, mk(gl.FRAGMENT_SHADER, fs));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error('Link: ' + gl.getProgramInfoLog(p));
    return p;
  },
  uniforms(p, names) { const o = {}; for (const n of names) o[n] = this.gl.getUniformLocation(p, n); return o; },
  resize(w, h) { this.W = w; this.H = h; this.canvas.width = w; this.canvas.height = h; },
  uploadTextures(tex) {
    const gl = this.gl;
    this.tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D_ARRAY, this.tex);
    gl.texImage3D(gl.TEXTURE_2D_ARRAY, 0, gl.RGBA8, TEX_SIZE, TEX_SIZE, tex.count, 0, gl.RGBA, gl.UNSIGNED_BYTE, tex.data);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MIN_FILTER, gl.NEAREST_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_S, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_T, gl.REPEAT);
    gl.generateMipmap(gl.TEXTURE_2D_ARRAY);
  },
  updateLayer(layer, data) {
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D_ARRAY, this.tex);
    gl.texSubImage3D(gl.TEXTURE_2D_ARRAY, 0, 0, 0, layer, TEX_SIZE, TEX_SIZE, 1, gl.RGBA, gl.UNSIGNED_BYTE, data);
    gl.generateMipmap(gl.TEXTURE_2D_ARRAY);
  },
  makeVAO(batchOrData, quads, dynamic) {
    const gl = this.gl;
    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    const vbo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, batchOrData, dynamic ? gl.DYNAMIC_DRAW : gl.STATIC_DRAW);
    const S = VSTRIDE * 4;
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, S, 0);
    gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 3, gl.FLOAT, false, S, 12);
    gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 3, gl.FLOAT, false, S, 24);
    gl.enableVertexAttribArray(3); gl.vertexAttribPointer(3, 4, gl.FLOAT, false, S, 36);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.ibo);
    gl.bindVertexArray(null);
    return { vao, vbo, quads };
  },
  setStatic(data, quads) {
    if (this.staticMesh) { this.gl.deleteBuffer(this.staticMesh.vbo); this.gl.deleteVertexArray(this.staticMesh.vao); }
    this.staticMesh = this.makeVAO(data, quads, false);
  },
  initBatch(b) {
    const m = this.makeVAO(b.data, 0, true);
    b.vao = m.vao; b.vbo = m.vbo;
  },
  flushBatch(b) {
    if (!b.vao) this.initBatch(b);
    if (b.n === 0) return;
    const gl = this.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, b.vbo);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, b.data, 0, b.n * 4 * VSTRIDE);
  },
  drawBatch(b) {
    if (!b.n) return;
    const gl = this.gl;
    gl.bindVertexArray(b.vao);
    gl.drawElements(gl.TRIANGLES, b.n * 6, gl.UNSIGNED_INT, 0);
  },
  setLights(list) {
    this.nl = Math.min(list.length, MAX_DYN_LIGHTS);
    for (let i = 0; i < this.nl; i++) {
      const l = list[i];
      this.lp[i * 4] = l.x; this.lp[i * 4 + 1] = l.y; this.lp[i * 4 + 2] = l.z; this.lp[i * 4 + 3] = l.r;
      this.lc[i * 4] = l.cr * l.i; this.lc[i * 4 + 1] = l.cg * l.i; this.lc[i * 4 + 2] = l.cb * l.i; this.lc[i * 4 + 3] = 0;
    }
  },
  worldUniforms(vp, cam, env) {
    const gl = this.gl, u = this.uW;
    gl.useProgram(this.progWorld);
    gl.uniformMatrix4fv(u.uVP, false, vp);
    gl.uniform3fv(u.uCam, cam.pos);
    gl.uniform4fv(u.uLP, this.lp);
    gl.uniform4fv(u.uLC, this.lc);
    gl.uniform1i(u.uNL, this.nl);
    gl.uniform3fv(u.uFog, env.fog);
    gl.uniform1f(u.uFogD, env.fogD);
    gl.uniform1f(u.uBands, this.quality.bands);
    gl.uniform1f(u.uDither, this.quality.dither);
    gl.uniform1f(u.uBright, env.bright);
    gl.uniform1f(u.uColBits, this.quality.colorBits);
    gl.uniform3fv(u.uFlash, env.flash || [0, 0, 0]);
    gl.uniform1i(u.uTex, 0);
  },
  // frame = {cam:{pos,r,u,f,fov,aspect}, env:{fog,fogD,bright,moon,time}, dyn, add, vm, vmAdd}
  render(frame) {
    const gl = this.gl, cam = frame.cam, env = frame.env;
    gl.viewport(0, 0, this.W, this.H);
    gl.clearColor(env.fog[0], env.fog[1], env.fog[2], 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D_ARRAY, this.tex);
    // céu
    gl.disable(gl.DEPTH_TEST); gl.depthMask(false);
    gl.useProgram(this.progSky);
    const tanY = Math.tan(cam.fov / 2);
    gl.uniform3fv(this.uS.uR, cam.r); gl.uniform3fv(this.uS.uU, cam.u); gl.uniform3fv(this.uS.uF, cam.f);
    gl.uniform2f(this.uS.uTan, tanY * cam.aspect, tanY);
    gl.uniform3fv(this.uS.uFog, env.fog);
    gl.uniform3fv(this.uS.uMoon, env.moon);
    gl.uniform1f(this.uS.uTime, env.time);
    gl.uniform1f(this.uS.uColBits, this.quality.colorBits);
    gl.uniform1f(this.uS.uBright, env.bright);
    gl.bindVertexArray(this.skyVAO);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.enable(gl.DEPTH_TEST); gl.depthMask(true);

    const proj = mat4Perspective(cam.fov, cam.aspect, 0.05, 420);
    const view = mat4View(cam.pos, cam.r, cam.u, cam.f);
    const vp = mat4Mul(proj, view);
    this.worldUniforms(vp, cam, env);
    if (this.staticMesh) {
      gl.bindVertexArray(this.staticMesh.vao);
      gl.drawElements(gl.TRIANGLES, this.staticMesh.quads * 6, gl.UNSIGNED_INT, 0);
    }
    this.flushBatch(frame.dyn);
    gl.enable(gl.POLYGON_OFFSET_FILL);
    gl.polygonOffset(-1, -2);
    this.drawBatch(frame.dyn);
    gl.disable(gl.POLYGON_OFFSET_FILL);
    // aditivo
    this.flushBatch(frame.add);
    if (frame.add.n) {
      gl.useProgram(this.progAdd);
      gl.uniformMatrix4fv(this.uA.uVP, false, vp);
      gl.uniform3fv(this.uA.uCam, cam.pos);
      gl.uniform1f(this.uA.uFogD, env.fogD);
      gl.uniform1i(this.uA.uTex, 0);
      gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE); gl.depthMask(false); gl.disable(gl.CULL_FACE);
      this.drawBatch(frame.add);
      gl.disable(gl.BLEND); gl.depthMask(true); gl.enable(gl.CULL_FACE);
    }
    // arma em primeira pessoa
    if (frame.vm && frame.vm.n) {
      gl.clear(gl.DEPTH_BUFFER_BIT);
      const vproj = mat4Perspective(frame.vmFov || 64 * DEG, cam.aspect, 0.01, 20);
      const vvp = mat4Mul(vproj, view);
      this.worldUniforms(vvp, cam, env);
      this.flushBatch(frame.vm);
      this.drawBatch(frame.vm);
      this.flushBatch(frame.vmAdd);
      if (frame.vmAdd.n) {
        gl.useProgram(this.progAdd);
        gl.uniformMatrix4fv(this.uA.uVP, false, vvp);
        gl.uniform3fv(this.uA.uCam, cam.pos);
        gl.uniform1f(this.uA.uFogD, 0);
        gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE); gl.depthMask(false); gl.disable(gl.CULL_FACE);
        this.drawBatch(frame.vmAdd);
        gl.disable(gl.BLEND); gl.depthMask(true); gl.enable(gl.CULL_FACE);
      }
    }
    gl.bindVertexArray(null);
  },
};

// ---------------------------------------------------------------------------
// Shaders
// ---------------------------------------------------------------------------
const VS_WORLD = `#version 300 es
layout(location=0) in vec3 aPos;
layout(location=1) in vec3 aUV;
layout(location=2) in vec3 aLight;
layout(location=3) in vec4 aTint;
uniform mat4 uVP;
out vec3 vPos; out vec3 vUV; out vec3 vLight; out vec4 vTint;
void main(){
  vPos = aPos; vUV = aUV; vLight = aLight; vTint = aTint;
  gl_Position = uVP * vec4(aPos, 1.0);
}`;

const GLSL_DITHER = `
float bayer4(vec2 p){
  ivec2 i = ivec2(mod(p, 4.0));
  int k = i.x + i.y * 4;
  float m[16] = float[16](0.,8.,2.,10.,12.,4.,14.,6.,3.,11.,1.,9.,15.,7.,13.,5.);
  return (m[k] + 0.5) / 16.0;
}`;

const FS_WORLD = `#version 300 es
precision highp float;
precision highp sampler2DArray;
uniform sampler2DArray uTex;
uniform vec3 uCam;
uniform vec4 uLP[${MAX_DYN_LIGHTS}];
uniform vec4 uLC[${MAX_DYN_LIGHTS}];
uniform int uNL;
uniform vec3 uFog;
uniform float uFogD;
uniform float uBands;
uniform float uDither;
uniform float uBright;
uniform float uColBits;
uniform vec3 uFlash;
in vec3 vPos; in vec3 vUV; in vec3 vLight; in vec4 vTint;
out vec4 o;
${GLSL_DITHER}
void main(){
  vec4 t = texture(uTex, vUV);
  if (t.a < 0.5) discard;
  vec3 n = normalize(cross(dFdx(vPos), dFdy(vPos)));
  vec3 L = vLight;
  for (int i = 0; i < ${MAX_DYN_LIGHTS}; i++) {
    if (i >= uNL) break;
    vec3 d = uLP[i].xyz - vPos;
    float dist = length(d);
    float a = clamp(1.0 - dist / uLP[i].w, 0.0, 1.0);
    a *= a;
    float nd = dot(n, d / max(dist, 0.001));
    L += uLC[i].rgb * a * clamp(nd * 0.7 + 0.3, 0.0, 1.0);
  }
  float bd = bayer4(gl_FragCoord.xy);
  L = mix(L * uBright, vec3(1.0), vTint.a);
  L = floor(L * uBands + mix(0.5, bd, uDither)) / uBands;
  vec3 c = t.rgb * vTint.rgb * L + uFlash;
  float dist = length(vPos - uCam);
  float f = 1.0 - exp(-dist * dist * uFogD * uFogD);
  c = mix(c, uFog, f * (1.0 - vTint.a * 0.6));
  c = floor(c * uColBits + bd) / uColBits;
  o = vec4(c, 1.0);
}`;

const FS_ADD = `#version 300 es
precision highp float;
precision highp sampler2DArray;
uniform sampler2DArray uTex;
uniform vec3 uCam;
uniform float uFogD;
in vec3 vPos; in vec3 vUV; in vec3 vLight; in vec4 vTint;
out vec4 o;
void main(){
  vec4 t = texture(uTex, vUV);
  vec3 c = t.rgb * vTint.rgb * t.a * vLight.r;
  float dist = length(vPos - uCam);
  float f = 1.0 - exp(-dist * dist * uFogD * uFogD * 0.35);
  o = vec4(c * (1.0 - f), 1.0);
}`;

const VS_SKY = `#version 300 es
out vec2 vN;
void main(){
  vec2 p = vec2((gl_VertexID == 1) ? 3.0 : -1.0, (gl_VertexID == 2) ? 3.0 : -1.0);
  vN = p;
  gl_Position = vec4(p, 0.999, 1.0);
}`;

const FS_SKY = `#version 300 es
precision highp float;
uniform vec3 uR, uU, uF;
uniform vec2 uTan;
uniform vec3 uFog;
uniform vec3 uMoon;
uniform float uTime;
uniform float uColBits;
uniform float uBright;
in vec2 vN;
out vec4 o;
${GLSL_DITHER}
float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
float vnoise(vec2 p){
  vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
  return mix(mix(hash(i), hash(i+vec2(1,0)), f.x), mix(hash(i+vec2(0,1)), hash(i+vec2(1,1)), f.x), f.y);
}
void main(){
  vec3 dir = normalize(uF + vN.x * uTan.x * uR + vN.y * uTan.y * uU);
  float h = dir.y;
  vec3 zen = vec3(0.012, 0.016, 0.04);
  vec3 c = mix(uFog, zen, smoothstep(-0.02, 0.5, h));
  // brilho laranja da cidade no horizonte
  c += vec3(0.20, 0.10, 0.04) * exp(-max(h, 0.0) * 8.0) * 0.7;
  // nuvens escuras
  if (h > 0.0) {
    vec2 cp = dir.xz / (h + 0.15) * 2.0 + vec2(uTime * 0.01, 0.0);
    float cl = vnoise(cp) * 0.6 + vnoise(cp * 2.3) * 0.4;
    cl = smoothstep(0.55, 0.85, cl);
    c = mix(c, vec3(0.07, 0.06, 0.07) + vec3(0.08, 0.04, 0.02) * exp(-h * 4.0), cl * 0.8);
    // estrelas
    vec2 sc = vec2(atan(dir.z, dir.x), asin(clamp(h, -1.0, 1.0)));
    vec2 cell = floor(sc * 150.0);
    float s = hash(cell);
    if (s > 0.993) c += vec3(0.55, 0.6, 0.75) * ((s - 0.993) / 0.007) * smoothstep(0.08, 0.35, h) * (1.0 - cl);
  }
  float md = dot(dir, uMoon);
  if (md > 0.9994) {
    vec2 mp = floor((dir.xz - uMoon.xz) * 900.0);
    c = vec3(0.86, 0.88, 0.8) * (0.85 + 0.15 * hash(mp));
  } else {
    c += vec3(0.10, 0.12, 0.16) * pow(max(md, 0.0), 300.0);
  }
  c *= mix(1.0, uBright, 0.5);
  float bd = bayer4(gl_FragCoord.xy);
  c = floor(c * uColBits + bd) / uColBits;
  o = vec4(c, 1.0);
}`;
