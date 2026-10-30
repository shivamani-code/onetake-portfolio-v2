/* MANI — One Take. Scroll engine: WebGL film with per-frame depth, depth-occluded 3D type,
   chapter transitions in the shader, generated sound. Written for this site. Lenis (MIT) for smooth scroll. */
(() => {
'use strict';
const $ = (s, e = document) => e.querySelector(s), $$ = (s, e = document) => [...e.querySelectorAll(s)];
const clamp = (v, a = 0, b = 1) => v < a ? a : v > b ? b : v, lerp = (a, b, t) => a + (b - a) * t;
const norm = (v, a, b) => clamp((v - a) / (b - a)), sstep = (a, b, v) => { const t = norm(v, a, b); return t * t * (3 - 2 * t); };
const eOut = t => 1 - Math.pow(1 - t, 3), eIn = t => t * t * t, eIO = t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
const eExpo = t => t >= 1 ? 1 : 1 - Math.pow(2, -10 * t);
const bell = (v, a, m, b) => v <= a || v >= b ? 0 : v < m ? sstep(a, m, v) : 1 - sstep(m, b, v);
const rnd = (s => () => (s = (s * 16807) % 2147483647) / 2147483647)(7);
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
const fine = matchMedia('(hover: hover) and (pointer: fine)').matches;
const html = document.documentElement, body = document.body;
const S = { W: innerWidth, H: innerHeight, y: 0, p: 0, ps: 0, vel: 0, vs: 0, mx: 0, my: 0, smx: 0, smy: 0, t: 0, entered: false, intro: 0, introT: -1, f: 0, df: 0, gyro: false };
if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
scrollTo(0, 0);

// ---------------------------------------------------------------- film manifest
let M = null, SET = 'desk';
const pad4 = i => String(i).padStart(4, '0');
function hostFor(kind, i) {
  const hs = (M.hosts && M.hosts[SET + '_' + kind]) || null;
  if (!hs) return 'frames/';
  for (const h of hs) if (i >= h.from && i <= h.to) return h.base;
  return hs[hs.length - 1].base;
}
const V = () => (M.ver ? M.ver + '/' : '');
const frameURL = (kind, i) => hostFor(kind, i) + V() + `${SET}/${kind}/${pad4(i)}.${M.ext || 'webp'}`;
const depthURL = a => hostFor('depth', a) + V() + `depth/${SET}/${String(a).padStart(3, '0')}.webp`;
let AV = null; // master indices shipped for this set
function bracket(f) { let lo = 0, hi = AV.length - 1; if (f <= AV[0]) return [AV[0], AV[0], 0]; if (f >= AV[hi]) return [AV[hi], AV[hi], 0];
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (AV[m] <= f) lo = m; else hi = m; } return [AV[lo], AV[hi], (f - AV[lo]) / (AV[hi] - AV[lo])]; }
const shotOf = id => M.shots.find(s => s.id === id);
const F = (id, t) => { const s = shotOf(id); return s.start + (s.end - s.start) * t; };

// ---------------------------------------------------------------- timeline (story progress 0..1)
let FK = [];
function buildTimeline() {
  FK = [[0, F('s1', 0)], [.022, F('s1', 0)], [.11, F('s1', 1)], [.165, F('s2', .74)], [.205, F('s2', .86)], [.255, F('s2', 1)],
    [.30, F('s3', 1)], [.345, F('s4', .8)], [.37, F('s4', 1)], [.405, F('s5', .7)], [.47, F('s5', .9)], [.50, F('s5', 1)],
    [.545, F('s6', 1)], [.60, F('s7', 1)], [.64, F('s8', .7)], [.71, F('s8', .9)], [.74, F('s8', 1)], [.80, F('s9', .62)],
    [.85, F('s9', .82)], [.895, F('s9', 1)], [1, F('s9', 1)]];
}
function frameAt(p) {
  for (let i = 1; i < FK.length; i++) if (p <= FK[i][0]) { const [p0, v0] = FK[i - 1], [p1, v1] = FK[i]; return lerp(v0, v1, (p - p0) / (p1 - p0 || 1)); }
  return M.count - 1;
}
const CH = [[0, '00', 'Prologue'], [.025, '01', 'The Well'], [.11, '02', 'The Script'], [.27, '03', 'The Climb'], [.34, '04', 'The Mirror City'],
  [.51, '05', 'The Storm'], [.605, '06', 'Orbit'], [.75, '07', 'The Vault'], [.9, '08', 'Contact']];
const ALT = [[0, 160], [.11, -38], [.255, -38], [.30, 0], [.345, 40], [.47, 14], [.545, 640], [.60, 12400], [.70, 820000], [.9, 830000], [1, 830000]];
const altAt = p => { for (let i = 1; i < ALT.length; i++) if (p <= ALT[i][0]) { const [a, b] = ALT[i - 1], [c, d] = ALT[i]; const t = (p - a) / (c - a); return b + (d - b) * (Math.abs(d) > 20000 ? eIn(t) : t); } return 830000; };
const fmtAlt = v => Math.abs(v) >= 10000 ? (v / 1000).toLocaleString('en', { maximumFractionDigits: 0 }) + ' km' : (v < 0 ? '−' : '') + Math.round(Math.abs(v)).toLocaleString('en') + ' m';
const CASES = [[.172, .262], [.392, .49], [.632, .722], [.776, .862]];
const JUMP = { w0: .205, w1: .44, w2: .675, w3: .82, end: 1 };

// ---------------------------------------------------------------- frames
class Frames {
  constructor() { this.hi = []; this.hiOk = new Uint8Array(M.count); this.lo = []; this.req = new Uint8Array(M.count); this.loaded = 0; this.active = 0; this.conc = SET === 'phone' ? 6 : 8; this.cur = 0; this.dir = 1; this.order = []; this.oi = 0; this.bmp = new Map(); this.bmpBusy = 0; }
  img(url) { const im = new Image(); im.crossOrigin = 'anonymous'; im.decoding = 'async'; im.src = url; return im; }
  loadLo(onTick) {
    const LL = M.lo, n = LL.length; let done = 0;
    return new Promise(res => {
      let next = 0; const pump = () => {
        if (next >= n) return; const i = LL[next++]; const im = this.img(frameURL('lo', i));
        const fin = ok => { if (ok) this.lo[i] = im; done++; onTick && onTick(done / n); if (done >= n) res(); else pump(); };
        im.onload = () => fin(true); im.onerror = () => fin(false);
      }; for (let c = 0; c < 8; c++) pump();
    });
  }
  startHi() {
    const seen = new Uint8Array(M.count), push = i => { if (!seen[i]) { seen[i] = 1; this.order.push(i); } };
    for (const s of [16, 8, 4, 2, 1]) for (let k = 0; k < AV.length; k += s) push(AV[k]);
    for (let c = 0; c < this.conc; c++) this.pump();
  }
  urgent() { // frames just ahead of the playhead first
    const c = bracket(this.cur)[0], ci = AV.indexOf(c), A = SET === 'phone' ? 16 : 30;
    for (let k = 0; k < A; k++) { const j = ci + this.dir * k; if (j >= 0 && j < AV.length && !this.req[AV[j]]) return AV[j]; }
    for (let k = 1; k < 6; k++) { const j = ci - this.dir * k; if (j >= 0 && j < AV.length && !this.req[AV[j]]) return AV[j]; }
    return -1;
  }
  pump() {
    let i = this.urgent();
    if (i < 0) { while (this.oi < this.order.length && this.req[this.order[this.oi]]) this.oi++; if (this.oi >= this.order.length) return; i = this.order[this.oi++]; }
    this.req[i] = 1; this.active++;
    const im = this.img(frameURL('hi', i));
    const fin = ok => { this.active--; if (ok) { this.hi[i] = im; this.hiOk[i] = 1; this.loaded++; } this.pump(); };
    im.onload = () => fin(true); im.onerror = () => fin(false);
  }
  kick() { while (this.active < this.conc) { const before = this.active; this.pump(); if (this.active === before) break; } }
  has(i) { return this.hiOk[i] === 1; }
  best(i) { // returns [source, key]
    i = clamp(Math.round(i), 0, M.count - 1);
    if (this.hiOk[i]) { const b = this.bmp.get(i); return [b && b.width ? b : this.hi[i], 'h' + i]; }
    let best = -1, bd = 1e9; for (const j of M.lo) { const dd = Math.abs(j - i); if (dd < bd && this.lo[j]) { bd = dd; best = j; } if (j > i + bd) break; }
    if (best >= 0) return [this.lo[best], 'l' + best];
    return [null, ''];
  }
  decodeAhead() { // keep a small ring of GPU-ready bitmaps around the playhead
    if (!window.createImageBitmap) return;
    const c = bracket(this.cur)[0], ci = AV.indexOf(c), R = SET === 'phone' ? 6 : 10, span = (R + 3) * (AV[1] - AV[0] || 1);
    for (const k of [...this.bmp.keys()]) if (Math.abs(k - c) > span) { const b = this.bmp.get(k); b && b.close && b.close(); this.bmp.delete(k); }
    if (this.bmpBusy > 1) return;
    for (let k = 0; k <= R; k++) {
      const j = ci + this.dir * k; if (j < 0 || j >= AV.length) continue; const i = AV[j];
      if (!this.hiOk[i] || this.bmp.has(i)) continue;
      this.bmpBusy++; this.bmp.set(i, null);
      createImageBitmap(this.hi[i]).then(b => { if (Math.abs(i - bracket(this.cur)[0]) <= span) this.bmp.set(i, b); else { b.close && b.close(); this.bmp.delete(i); } }).catch(() => this.bmp.delete(i)).finally(() => this.bmpBusy--);
      if (this.bmpBusy > 1) break;
    }
  }
}

// ---------------------------------------------------------------- WebGL
const VS = `attribute vec2 p;varying vec2 v;void main(){v=vec2(p.x*.5+.5,.5-p.y*.5);gl_Position=vec4(p,0.,1.);}`;
const FS = `precision highp float;
varying vec2 v;
uniform sampler2D uA,uB,uDA,uDB,uT;
uniform float uMix,uDMix,uTime,uGrain,uFlash,uAb,uTextOn,uSeam,uRip,uLeak,uLeakX,uFade,uBlurOn,uWarm,uAspect,uPhone,uLetter;
uniform vec4 uDRA,uDRB,uRing;
uniform vec2 uS,uPar,uBlur;
uniform float uZoom;
uniform vec3 uFlashC;
uniform float uNeg;
float h(vec2 p){return fract(sin(dot(p,vec2(12.9898,78.233)))*43758.5453);}
float dep(vec2 q){q=clamp(q,.002,.998);return mix(texture2D(uDA,uDRA.xy+q*uDRA.zw).r,texture2D(uDB,uDRB.xy+q*uDRB.zw).r,uDMix);}
vec3 film(vec2 q){return mix(texture2D(uA,q).rgb,texture2D(uB,q).rgb,uMix);}
void main(){
  vec2 uv=v;
  // signal shockwave ring (screen space)
  if(uRing.w>0.){vec2 d=uv-uRing.xy;d.x*=uAspect;float r=length(d);float w=exp(-pow((r-uRing.z)*14.,2.));uv-=normalize(d+1e-5)*w*uRing.w*.035*vec2(1./uAspect,1.);}
  // water ripple (mirror-city transition)
  if(uRip>0.){uv.x+=sin(uv.y*70.-uTime*5.)*.006*uRip+sin(uv.y*23.+uTime*2.)*.004*uRip;uv.y+=sin(uv.x*40.+uTime*3.)*.003*uRip;}
  vec2 q=(uv-.5)*uS+.5;
  float d=dep(q);
  q+=uPar*(d-.45);
  vec3 c;
  if(uBlurOn>.5){
    c=vec3(0.);float tw=0.;
    for(int i=0;i<7;i++){float t=float(i)/6.-.5;vec2 o=uBlur*t+(q-.5)*uZoom*(t+.5);float w=1.-abs(t)*.8;c+=film(q-o)*w;tw+=w;}
    c/=tw;
  } else c=film(q);
  if(uAb>0.){c.r=mix(c.r,film(q+vec2(uAb*.006,0.)).r,.9);c.b=mix(c.b,film(q-vec2(uAb*.006,0.)).b,.9);}
  float lum=dot(c,vec3(.299,.587,.114));
  // anamorphic streak on highlights (desktop)
  if(uPhone<.5){vec3 s=vec3(0.);for(int i=1;i<5;i++){float o=float(i)*.022;s+=max(film(q+vec2(o,0.))-.72,0.)+max(film(q-vec2(o,0.))-.72,0.);}c+=s*vec3(.55,.42,.32)*.32;}
  // depth-occluded type
  if(uTextOn>.5){vec4 tx=texture2D(uT,v);
    vec2 o=vec2(.006/uAspect,.006);float ga=(texture2D(uT,v+o).a+texture2D(uT,v-o).a+texture2D(uT,v+vec2(o.x,-o.y)).a+texture2D(uT,v-vec2(o.x,-o.y)).a)*.25;
    vec4 tg=texture2D(uT,v+o);float gd=max(tx.g,tg.g);float gocc=smoothstep(gd-.035,gd+.02,d)*step(gd,.985);
    c+=mix(vec3(.55,.5,.45),vec3(1.,.45,.15),max(tx.b,tg.b))*ga*(1.-gocc)*.28;
    if(tx.a>.004){float td=tx.g;float occ=smoothstep(td-.035,td+.02,d)*step(td,.985);
      vec3 tcol=mix(vec3(.96,.92,.85),vec3(1.,.6,.3),tx.b);tcol*=(.9+.4*lum);tcol=mix(tcol,c,(1.-td)*.12);
      c=mix(c,tcol,tx.a*(1.-occ));}}
  // grade: lift blacks a hair, warm highlights, cool shadows
  c=mix(c,c*vec3(.92,.98,1.08),(1.-lum)*.35);c=mix(c,c*vec3(1.06,1.,.92),lum*.3*uWarm);
  c=pow(max(c,0.),vec3(1.04));
  // light leak whip
  if(uLeak>0.){float x=uv.x-uLeakX;c+=vec3(1.,.62,.32)*exp(-x*x*18.)*uLeak*1.4+vec3(.35,.45,1.)*exp(-pow(x+.12,2.)*60.)*uLeak*.5;}
  // vault seam -> warm light floods everything
  if(uSeam>0.){float w=mix(.0015,.75,eIO(uSeam));float sx=abs(uv.x-.5);float core=smoothstep(w,w*.35,sx);float glow=exp(-sx*sx/(w*w*6.+1e-4));
    vec3 warm=mix(vec3(.96,.89,.78),vec3(.98,.66,.4),smoothstep(.0,.9,length((uv-.5)*vec2(uAspect,1.)))*.55);
    c=mix(c,warm,clamp(core+glow*.5,0.,1.));c+=vec3(1.,.7,.45)*glow*.4*(1.-uSeam);}
  c=mix(c,uFlashC,uFlash);
  if(uNeg>0.){vec3 n=vec3(.9,.95,1.)-c*1.15;c=mix(c,clamp(n,0.,1.)*vec3(.8,.9,1.2),uNeg);}
  // vignette, letterbox, grain
  vec2 vv=v-.5;c*=1.-dot(vv,vv)*(.55-uSeam*.4);
  float lb=uLetter*.11;c*=step(lb,v.y)*step(v.y,1.-lb)*1.+(1.-step(lb,v.y)*step(v.y,1.-lb))*0.;
  c+=(h(v*vec2(1913.,1137.)+fract(uTime*7.31))-.5)*uGrain;
  c*=1.-uFade;
  gl_FragColor=vec4(c,1.);
}`.replace('eIO(uSeam)', '(uSeam<.5?4.*uSeam*uSeam*uSeam:1.-pow(-2.*uSeam+2.,3.)/2.)');

class GL {
  constructor(cv) {
    this.cv = cv;
    const gl = this.gl = cv.getContext('webgl', { antialias: false, alpha: false, premultipliedAlpha: false, preserveDrawingBuffer: false, powerPreference: 'high-performance' });
    if (!gl) throw new Error('no webgl');
    const sh = (t, s) => { const o = gl.createShader(t); gl.shaderSource(o, s); gl.compileShader(o); if (!gl.getShaderParameter(o, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(o)); return o; };
    const pr = this.pr = gl.createProgram(); gl.attachShader(pr, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(pr, sh(gl.FRAGMENT_SHADER, FS)); gl.linkProgram(pr);
    if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(pr));
    gl.useProgram(pr);
    const b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(pr, 'p'); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    this.u = {}; const n = gl.getProgramParameter(pr, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < n; i++) { const a = gl.getActiveUniform(pr, i); this.u[a.name] = gl.getUniformLocation(pr, a.name); }
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false); gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    if (gl.UNPACK_COLORSPACE_CONVERSION_WEBGL) gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE);
    const mk = () => { const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 255])); return t; };
    this.slots = Array.from({ length: 4 }, () => ({ t: mk(), key: '', used: 0 }));
    this.dslots = Array.from({ length: 3 }, () => ({ t: mk(), key: -1, used: 0 }));
    this.text = mk(); this.tick = 0;
    for (const [k, i] of [['uA', 0], ['uB', 1], ['uDA', 2], ['uDB', 3], ['uT', 4]]) gl.uniform1i(this.u[k], i);
  }
  resize(dpr) { const w = Math.round(S.W * dpr), h = Math.round(S.H * dpr); if (this.cv.width !== w || this.cv.height !== h) { this.cv.width = w; this.cv.height = h; } this.gl.viewport(0, 0, w, h); }
  frameTex(src, key) {
    const gl = this.gl; this.tick++;
    let s = this.slots.find(x => x.key === key);
    if (!s) { s = this.slots.reduce((a, b) => a.used < b.used ? a : b); gl.activeTexture(gl.TEXTURE5); gl.bindTexture(gl.TEXTURE_2D, s.t); try { gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, src); s.key = key; } catch (e) { s.key = ''; } }
    s.used = this.tick; return s.t;
  }
  depthTex(img, a) {
    const gl = this.gl; this.tick++;
    let s = this.dslots.find(x => x.key === a);
    if (!s) { s = this.dslots.reduce((x, y) => x.used < y.used ? x : y); gl.activeTexture(gl.TEXTURE5); gl.bindTexture(gl.TEXTURE_2D, s.t); try { gl.texImage2D(gl.TEXTURE_2D, 0, gl.LUMINANCE, gl.LUMINANCE, gl.UNSIGNED_BYTE, img); s.key = a; } catch (e) { s.key = -1; } }
    s.used = this.tick; return s.t;
  }
  bind(unit, tex) { const gl = this.gl; gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, tex); }
  textUpload(cv) { const gl = this.gl; gl.activeTexture(gl.TEXTURE4); gl.bindTexture(gl.TEXTURE_2D, this.text); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, cv); }
  draw() { this.gl.drawArrays(this.gl.TRIANGLE_STRIP, 0, 4); }
}

// ---------------------------------------------------------------- depth atlases
const Depth = { imgs: [], ok: [], load() { return Promise.all(Array.from({ length: M.atlases }, (_, a) => new Promise(r => { const im = new Image(); im.crossOrigin = 'anonymous'; im.onload = () => { this.imgs[a] = im; this.ok[a] = 1; r(); }; im.onerror = () => r(); im.src = depthURL(a); }))); } };
function depthFor(f) { // fractional film frame -> two depth tiles + mix
  const di = M.dindex, ds = M.dstep; let j = Math.min(di.length - 2, Math.floor(f / ds)); if (j < 0) j = 0;
  const fa = di[j], fb = di[j + 1]; const t = clamp((f - fa) / ((fb - fa) || 1));
  const tile = k => { const G = M.grid, per = G * G, a = Math.floor(k / per), t2 = k % per; return { a, r: [(t2 % G) / G, Math.floor(t2 / G) / G, 1 / G, 1 / G] }; };
  return [tile(j), tile(j + 1), t];
}

// ---------------------------------------------------------------- depth-placed type (drawn to a canvas, composited in the shader)
const TXT = [
  { s: 'MANI', a: -1, b: 0, c: .012, d: .07, y: .42, size: 1, dep: .34, warm: 0, mode: 'push', intro: true },
  { s: 'SIGNAL', a: .118, b: .15, c: .162, d: .19, y: .36, size: .78, dep: .52, warm: 1, mode: 'assemble', exit: 'up' },
  { s: 'MIRROR', a: .335, b: .358, c: .382, d: .405, y: .44, size: .8, dep: .22, warm: 0, mode: 'assemble', mirror: true, exit: 'through' },
  { s: 'STORM', a: .505, b: .53, c: .55, d: .575, y: .5, size: .82, dep: .2, warm: 0, mode: 'assemble', exit: 'through' },
  { s: 'ORBIT', a: .606, b: .63, c: .64, d: .66, y: .5, size: .86, dep: .3, warm: 1, mode: 'assemble', exit: 'through' },
  { s: 'VAULT', a: .742, b: .76, c: .766, d: .782, y: .5, size: .82, dep: .25, warm: 0, mode: 'assemble', exit: 'through' },
  // giant outlined words that rush past on the fast moves (stroke only, depth-occluded)
  { s: 'BELOW', a: .034, b: .048, c: .062, d: .09, y: .6, size: 1.25, dep: .3, warm: 0, mode: 'assemble', exit: 'through', outline: true },
  { s: 'ASCENT', a: .262, b: .276, c: .288, d: .318, y: .3, size: 1.2, dep: .45, warm: 1, mode: 'assemble', exit: 'up', outline: true },
  { s: 'HIGHER', a: .512, b: .522, c: .53, d: .548, y: .72, size: 1.15, dep: .35, warm: 0, mode: 'assemble', exit: 'through', outline: true },
];
const Type = {
  cv: document.createElement('canvas'), ctx: null, dpr: 1, active: false, wasActive: false, base: 200,
  init() { this.ctx = this.cv.getContext('2d'); for (const t of TXT) t.r = [...t.s].map(() => [rnd() * 2 - 1, rnd() * 2 - 1, rnd()]); },
  resize() { this.dpr = Math.min(devicePixelRatio || 1, SET === 'phone' ? 1.25 : 1.5); this.cv.width = Math.round(S.W * this.dpr); this.cv.height = Math.round(S.H * this.dpr); },
  draw(p) {
    const { ctx, cv } = this, W = cv.width, H = cv.height;
    const act = TXT.filter(t => (t.intro && p < t.d) || (p > t.a && p < t.d));
    this.active = act.length > 0;
    if (!this.active) { if (this.wasActive) { ctx.clearRect(0, 0, W, H); this.wasActive = false; return true; } return false; }
    this.wasActive = true; ctx.clearRect(0, 0, W, H);
    const fpx = 1000 * (H / 900);
    for (const t of act) {
      const n = t.s.length; const fs = Math.min(W * .92 / (n * .88), H * .34) * t.size;
      ctx.font = `900 ${fs}px Unbounded, "Arial Black", sans-serif`; ctx.textBaseline = 'middle'; ctx.textAlign = 'center';
      const ws = [...t.s].map(ch => ctx.measureText(ch).width * .98); const tot = ws.reduce((a, b) => a + b, 0);
      let x0 = W / 2 - tot / 2; const yc = H * t.y;
      const qin = t.intro ? eOut(clamp(S.intro)) : norm(p, t.a, t.b), qout = norm(p, t.c, t.d);
      const skew = clamp(-S.vs * .9, -.35, .35);
      for (let i = 0; i < n; i++) {
        const ch = t.s[i], w = ws[i], cx = x0 + w / 2; x0 += w; const [r1, r2, r3] = t.r[i];
        const st = (i / n) * .38, li = eOut(clamp((qin - st) / .62));
        let z = lerp(-2600 - r3 * 1200, 0, li), ox = (1 - li) * r1 * W * .35, oy = (1 - li) * r2 * H * .3;
        let dep = t.dep * lerp(.4, 1, li), alpha = clamp(li * 1.4);
        if (qout > 0) {
          if (t.exit === 'up') { const e = eIn(qout); oy -= e * H * (1.1 + r3 * .4); ox += e * r1 * W * .1; z += e * 300; alpha *= 1 - sstep(.6, 1, qout); }
          else { const e = eIn(qout); z = lerp(z, fpx * .93, e); ox += (cx - W / 2) * e * 1.6; dep = lerp(dep, 1, sstep(0, .55, qout)); alpha *= 1 - sstep(.75, 1, qout); }
        }
        if (t.mode === 'push' && !t.intro) {}
        if (alpha <= .003) continue;
        const sc = fpx / Math.max(40, fpx - z);
        const px = W / 2 + (cx - W / 2 + ox) * sc + S.smx * W * .012 * (1 - t.dep), py = H / 2 + (yc - H / 2 + oy) * sc + S.smy * H * .01;
        ctx.save(); ctx.translate(px, py); ctx.transform(1, 0, skew, 1, 0, 0); ctx.scale(sc, sc * lerp(.25, 1, li));
        ctx.globalAlpha = alpha;
        const col = `rgb(255,${Math.round(clamp(dep) * 255)},${t.warm ? 255 : 0})`;
        if (t.outline) { ctx.strokeStyle = col; ctx.lineWidth = Math.max(1.5, fs * .012); ctx.strokeText(ch, 0, 0); }
        else { ctx.fillStyle = col; ctx.fillText(ch, 0, 0); }
        if (Math.abs(S.vs) > .08 && !t.outline) { ctx.globalAlpha = alpha * .18; ctx.fillText(ch, 0, -S.vs * 60); ctx.fillText(ch, 0, -S.vs * 120); }
        ctx.restore();
        if (t.mirror && qout < 1) { // reflection on the flood: never occluded, rippled, fading down
          const ry = H * .5 + (H * .5 - py) * -1 + (yc - H * .5) * 0;
          const base = py + fs * sc * .52;
          for (let k = 0; k < 7; k++) {
            ctx.save(); ctx.beginPath(); ctx.rect(0, base + k * fs * sc * .1, W, fs * sc * .1 + 1); ctx.clip();
            ctx.translate(px + Math.sin(S.t * 2.4 + k * .9) * 3 * k, base + (base - py)); ctx.scale(sc, -sc * .85);
            ctx.globalAlpha = alpha * .3 * (1 - k / 7); ctx.fillStyle = 'rgb(200,255,0)'; ctx.fillText(ch, 0, 0); ctx.restore();
          }
        }
      }
    }
    return true;
  }
};

// ---------------------------------------------------------------- 3D fly-by lines (DOM)
const LINES = [[.078, .118, 'Every world starts underground.'], [.12, .156, 'One light is enough.'], [.262, .305, 'Then it climbs.'],
  [.318, .352, 'Past the flood —'], [.355, .395, 'into a city that remembers.'], [.512, .552, 'Through the noise.'],
  [.584, .628, 'Above it, quiet.'], [.618, .66, 'Even the sky answers.'], [.74, .785, 'Some doors open for one person.']];
const Fly = { els: [], init() { const box = $('#fly'); for (const [a, b, s] of LINES) { const el = document.createElement('p'); el.textContent = s; box.appendChild(el); this.els.push({ el, a, b, x: (rnd() - .5) * .1, y: (rnd() - .5) * .45, r: (rnd() - .5) * 14 }); } },
  update(p) { for (const o of this.els) { const t = norm(p, o.a, o.b); if (t <= 0 || t >= 1) { if (o.v) { o.el.style.opacity = 0; o.v = 0; } continue; } o.v = 1;
      const z = lerp(-700, 520, t), op = bell(t, 0, .45, 1) * 1, sk = clamp(-S.vs * 30, -14, 14);
      o.el.style.opacity = op.toFixed(3);
      o.el.style.transform = `translate(-50%,-50%) translate3d(${(o.x * S.W + S.smx * -20).toFixed(1)}px,${(o.y * S.H * .6 + S.smy * -14).toFixed(1)}px,${z.toFixed(1)}px) rotateY(${(o.r * (1 - t)).toFixed(2)}deg) skewX(${sk.toFixed(2)}deg)`; } } };

// ---------------------------------------------------------------- sound: generated, scroll-synced, off by default
const Sound = {
  on: false, ctx: null, nodes: null, lastP: 0,
  ensure() {
    if (this.ctx) return; const A = window.AudioContext || window.webkitAudioContext; if (!A) return;
    const c = this.ctx = new A(); const m = c.createGain(); m.gain.value = 0; const comp = c.createDynamicsCompressor(); m.connect(comp); comp.connect(c.destination);
    const nb = c.createBuffer(1, c.sampleRate * 2, c.sampleRate), d = nb.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    const noise = () => { const s = c.createBufferSource(); s.buffer = nb; s.loop = true; s.start(); return s; };
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 300; lp.Q.value = 4; const dg = c.createGain(); dg.gain.value = .0;
    for (const [f, dt] of [[55, -7], [55, 6], [82.4, 0], [110, 3]]) { const o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f; o.detune.value = dt; o.connect(lp); o.start(); }
    lp.connect(dg); dg.connect(m);
    const pad = c.createGain(); pad.gain.value = 0; for (const f of [440, 659.3, 880, 1318.5]) { const o = c.createOscillator(); o.type = 'sine'; o.frequency.value = f; const g = c.createGain(); g.gain.value = .05; o.connect(g); g.connect(pad); o.start(); } pad.connect(m);
    const rain = c.createBiquadFilter(); rain.type = 'bandpass'; rain.frequency.value = 2400; rain.Q.value = .5; const rg = c.createGain(); rg.gain.value = 0; noise().connect(rain); rain.connect(rg); rg.connect(m);
    const wind = c.createBiquadFilter(); wind.type = 'bandpass'; wind.frequency.value = 500; wind.Q.value = 1.4; const wg = c.createGain(); wg.gain.value = 0; noise().connect(wind); wind.connect(wg); wg.connect(m);
    this.nodes = { m, lp, dg, pad, rain, rg, wind, wg, noise, nb };
  },
  set(v) { this.on = v; if (v) { this.ensure(); if (!this.ctx) return; this.ctx.resume(); } if (this.ctx) this.nodes.m.gain.setTargetAtTime(v ? .9 : 0, this.ctx.currentTime, .4);
    const b = $('#snd'); b.classList.toggle('on', v); b.setAttribute('aria-pressed', v); b.querySelector('b').textContent = v ? 'Sound on' : 'Sound off'; },
  hit(kind) { if (!this.on || !this.ctx) return; const c = this.ctx, t = c.currentTime, n = this.nodes;
    const o = c.createOscillator(), g = c.createGain(); o.type = 'sine'; o.frequency.setValueAtTime(kind === 'light' ? 140 : 90, t); o.frequency.exponentialRampToValueAtTime(28, t + 1.2);
    g.gain.setValueAtTime(.0001, t); g.gain.exponentialRampToValueAtTime(kind === 'soft' ? .35 : .9, t + .02); g.gain.exponentialRampToValueAtTime(.0001, t + 1.6); o.connect(g); g.connect(n.m); o.start(t); o.stop(t + 1.7);
    const s = c.createBufferSource(); s.buffer = n.nb; const f = c.createBiquadFilter(); f.type = kind === 'light' ? 'highpass' : 'lowpass'; f.frequency.value = kind === 'light' ? 1800 : 900;
    const sg = c.createGain(); sg.gain.setValueAtTime(kind === 'light' ? .6 : .35, t); sg.gain.exponentialRampToValueAtTime(.0001, t + (kind === 'light' ? 1.8 : .7)); s.connect(f); f.connect(sg); sg.connect(n.m); s.start(t); s.stop(t + 2); },
  update(p) { if (!this.on || !this.ctx) return; const c = this.ctx, t = c.currentTime, n = this.nodes, k = .25;
    const space = sstep(.59, .64, p) * (1 - sstep(.88, .95, p)); const wet = (1 - sstep(.58, .62, p));
    n.lp.frequency.setTargetAtTime(220 + 1600 * sstep(.25, .6, p) * (1 - space * .6) + Math.abs(S.vs) * 2000, t, k);
    n.dg.gain.setTargetAtTime((.05 + .05 * sstep(.1, .5, p)) * (1 - space * .7) * (1 - sstep(.9, .97, p)), t, k);
    n.pad.gain.setTargetAtTime(space * .5 + sstep(.86, .93, p) * .4, t, .6);
    n.rg.gain.setTargetAtTime(wet * (.05 + .07 * bell(p, .5, .56, .6)), t, k);
    n.wind.frequency.setTargetAtTime(300 + Math.min(2400, Math.abs(S.vs) * 6000), t, .08);
    n.wg.gain.setTargetAtTime(Math.min(.5, Math.abs(S.vs) * 2.2) * (1 - space * .5), t, .08);
    const ev = [[.142, 'hit'], [.559, 'light'], [.582, 'light'], [.602, 'soft'], [.87, 'hit']];
    for (const [e, kk] of ev) if (this.lastP < e && p >= e) this.hit(kk);
    this.lastP = p; }
};

// ---------------------------------------------------------------- overlays
const Cases = $$('.case').map((el, i) => ({ el, i, title: $$('.c-title span', el), line: $('.c-line', el), meta: $('.c-meta', el), shots: $$('.glass', el), go: $('.c-go', el), on: false }));
const hero = $('#hero'), contact = $('#contact');
function vis(el, o, live) { const on = o > .002; if (on !== !!el._on) { el._on = on; el.classList.toggle('on', on); } el.style.opacity = o.toFixed(3); el.classList.toggle('live', !!live && o > .6); }
function updateOverlays(p) {
  // hero lines
  const ho = (S.entered ? clamp(S.intro * 1.6 - .5) : 0) * (1 - sstep(.004, .02, p));
  vis(hero, ho, false); hero.style.transform = `translate3d(0,${(-p * S.H * 3).toFixed(1)}px,0)`;
  for (const c of Cases) {
    const [a, b] = CASES[c.i], qi = eOut(norm(p, a, a + .028)), qo = eIn(norm(p, b - .024, b)), o = qi * (1 - qo);
    vis(c.el, o, true); if (o <= .002) continue;
    const sk = clamp(-S.vs * 22, -10, 10), local = norm(p, a, b);
    c.title[0].style.transform = `translate3d(${((1 - qi) * -40 + qo * -60).toFixed(2)}vw,0,0) skewX(${sk.toFixed(2)}deg)`;
    c.title[1].style.transform = `translate3d(${((1 - qi) * 40 + qo * 60 + (local - .5) * -6).toFixed(2)}vw,0,0) skewX(${sk.toFixed(2)}deg)`;
    c.line.style.transform = `translate3d(0,${((1 - qi) * 40 - qo * 30).toFixed(1)}px,0)`; c.line.style.opacity = clamp(qi * 1.4 - .3) * (1 - qo);
    c.meta.style.transform = `translate3d(0,${((1 - qi) * -20).toFixed(1)}px,0)`;
    c.shots.forEach((g, k) => { const z = lerp(-900, 0, qi) + qo * 500, ry = lerp(-55, -14, qi) + (k ? 8 : 0) + S.smx * 10 + qo * 40, rx = S.smy * -6 + (local - .5) * 6;
      g.style.transform = `translate3d(0,${((k ? 1 : -1) * 18 + (local - .5) * (k ? -50 : 30)).toFixed(1)}px,${z.toFixed(0)}px) rotateY(${ry.toFixed(2)}deg) rotateX(${rx.toFixed(2)}deg)`;
      g.style.setProperty('--sheen', ((local - .5) * 160).toFixed(1) + '%'); });
    if (c.go) c.go.style.opacity = clamp(qi * 2 - 1) * (1 - qo);
  }
  const co = sstep(.89, .922, p); vis(contact, co, true);
  contact.style.transform = `translate3d(0,${((1 - co) * 40).toFixed(1)}px,0) scale(${lerp(1.06, 1, co).toFixed(4)})`;
}
const chapEl = $('#chap'), chN = $('.ch-n'), chT = $('.ch-t'), altV = $('#altV'), railF = $('#railFill'); let chI = -1, altLast = '';
function updateHud(p) {
  let i = 0; for (let k = 0; k < CH.length; k++) if (p >= CH[k][0]) i = k;
  if (i !== chI) { chI = i; chN.textContent = CH[i][1]; chT.textContent = CH[i][2]; chapEl.animate([{ opacity: 0, transform: 'translateY(8px)' }, { opacity: 1, transform: 'none' }], { duration: 600, easing: 'cubic-bezier(.16,1,.3,1)' }); }
  const a = fmtAlt(altAt(p)); if (a !== altLast) { altLast = a; altV.textContent = a; }
  railF.style.transform = `scaleX(${p.toFixed(4)})`;
  const dark = p > .915; body.classList.toggle('lit', dark);
}

// ---------------------------------------------------------------- input
addEventListener('pointermove', e => { if (e.pointerType === 'mouse') { S.mx = e.clientX / S.W * 2 - 1; S.my = e.clientY / S.H * 2 - 1; } }, { passive: true });
addEventListener('deviceorientation', e => { if (e.gamma == null) return; S.gyro = true; S.mx = clamp(e.gamma / 28, -1, 1); S.my = clamp((e.beta - 45) / 28, -1, 1); }, { passive: true });
$$('.btn-mag').forEach(b => {
  b.addEventListener('pointermove', e => { const r = b.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
    b.style.setProperty('--mx', (x / r.width * 100) + '%'); b.style.setProperty('--my', (y / r.height * 100) + '%');
    if (e.pointerType === 'mouse') b.style.transform = `translate(${((x - r.width / 2) * .28).toFixed(1)}px,${((y - r.height / 2) * .38).toFixed(1)}px)`; });
  b.addEventListener('pointerleave', () => { b.style.transform = ''; });
  b.addEventListener('touchstart', () => { b.classList.add('tap'); setTimeout(() => b.classList.remove('tap'), 650); }, { passive: true });
});

// ---------------------------------------------------------------- scroll
const story = $('#story');
let lenis = null, storyLen = 1;
function measure() {
  S.W = innerWidth; S.H = innerHeight; storyLen = Math.max(1, story.offsetHeight - S.H);
  if (gl) gl.resize(Math.min(devicePixelRatio || 1, SET === 'phone' ? 1.5 : 1.5)); Type.resize();
}
function yFor(p) { return p * storyLen; }
function jump(key) {
  const p = key === '0' || key === 0 ? 0 : JUMP[key] ?? 0; const y = yFor(p), dist = Math.abs(y - scrollY);
  menu(false);
  if (lenis) lenis.scrollTo(y, { duration: clamp(dist / S.H * .09, 1.4, 6), easing: eIO, force: true }); else scrollTo(0, y);
}
document.addEventListener('click', e => { const j = e.target.closest('[data-jump]'); if (j) { e.preventDefault(); jump(j.dataset.jump); } });
const menuEl = $('#menu'), menuBtn = $('#menuBtn');
function menu(v) { menuEl.classList.toggle('open', v); menuEl.setAttribute('aria-hidden', !v); menuBtn.setAttribute('aria-expanded', v); menuBtn.querySelector('span').textContent = v ? 'Close' : 'Worlds'; }
menuBtn.addEventListener('click', () => menu(!menuEl.classList.contains('open')));
$('#snd').addEventListener('click', () => Sound.set(!Sound.on));

// ---------------------------------------------------------------- render loop
let gl = null, frames = null, last = performance.now(), loopOn = false;
function render() {
  const p = S.ps, f = clamp(frameAt(p), 0, M.count - 1);
  S.df = f - S.f; S.f = f; if (frames) { if (Math.abs(S.df) > .01) frames.dir = S.df > 0 ? 1 : -1; frames.cur = f; }
  const [i0, i1, fr] = bracket(f);
  const [sa, ka] = frames.best(i0), [sb, kb] = frames.best(i1);
  const g = gl.gl, u = gl.u;
  if (sa) gl.bind(0, gl.frameTex(sa, ka)); if (sb) gl.bind(1, gl.frameTex(sb, kb));
  g.uniform1f(u.uMix, (ka !== kb && sb) ? fr : 0);
  const [da, db, dm] = depthFor(f);
  if (Depth.ok[da.a]) gl.bind(2, gl.depthTex(Depth.imgs[da.a], da.a)); if (Depth.ok[db.a]) gl.bind(3, gl.depthTex(Depth.imgs[db.a], db.a));
  g.uniform4fv(u.uDRA, da.r); g.uniform4fv(u.uDRB, db.r); g.uniform1f(u.uDMix, dm);
  // cover fit
  const ia = M[SET].w / M[SET].h, sa_ = S.W / S.H; const zoom = .955;
  g.uniform2f(u.uS, Math.min(1, sa_ / ia) * zoom, Math.min(1, ia / sa_) * zoom); g.uniform1f(u.uAspect, sa_);
  const shk = Math.max(bell(p, .138, .142, .152), bell(p, .557, .5595, .566), bell(p, .58, .5825, .589), bell(p, .866, .872, .885) * .6) * .012;
  g.uniform2f(u.uPar, S.smx * .016 + (Math.random() - .5) * shk, S.smy * .011 + (Math.random() - .5) * shk);
  // motion blur from film speed, shaped by the shot's camera move
  const shot = M.shots.find(s => f >= s.start && f <= s.end + 1) || M.shots[0];
  const sp = Math.abs(S.df) * (1000 / Math.max(8, S.dt || 16)) / (M.fps || 24); // film-seconds per second
  const bl = clamp((sp - 1.4) * .012, 0, .045);
  g.uniform1f(u.uBlurOn, bl > .002 ? 1 : 0); g.uniform2f(u.uBlur, shot.motion[0] * bl, shot.motion[1] * bl * Math.sign(S.df || 1)); g.uniform1f(u.uZoom, shot.motion[2] * bl * .9 * Math.sign(S.df || 1));
  // chapter transitions
  const ring = norm(p, .134, .175); g.uniform4f(u.uRing, .5, .44, eOut(ring) * 1.3, ring > 0 && ring < 1 ? (1 - ring) * 1.2 : 0);
  const fl1 = bell(p, .555, .559, .568), fl2 = bell(p, .578, .582, .592), ig = bell(p, .136, .142, .158) * .35;
  const ng1 = bell(p, .5585, .5605, .5635), ng2 = bell(p, .5815, .5835, .586);
  g.uniform1f(u.uNeg, Math.max(ng1, ng2) * .95);
  g.uniform1f(u.uFlash, Math.max(fl1 * .6 * (1 - ng1), fl2 * .5 * (1 - ng2), ig)); g.uniform3fv(u.uFlashC, ig > Math.max(fl1, fl2) ? [1, .6, .3] : [.85, .9, 1]);
  g.uniform1f(u.uAb, Math.max(fl1, fl2) + clamp(Math.abs(S.vs) * 2 - .2, 0, .8));
  g.uniform1f(u.uRip, bell(p, .33, .352, .39) * 1.2);
  const lk = norm(p, .597, .622); g.uniform1f(u.uLeak, bell(lk, 0, .35, 1)); g.uniform1f(u.uLeakX, lerp(-.3, 1.3, lk));
  g.uniform1f(u.uSeam, sstep(.858, .912, p));
  g.uniform1f(u.uWarm, 1); g.uniform1f(u.uPhone, SET === 'phone' ? 1 : 0); g.uniform1f(u.uLetter, 0);
  g.uniform1f(u.uGrain, SET === 'phone' ? .07 : .06); g.uniform1f(u.uTime, S.t);
  g.uniform1f(u.uFade, S.entered ? 1 - clamp(S.intro * 2) : 1);
  const tdirty = Type.draw(p); if (tdirty) gl.textUpload(Type.cv); else gl.bind(4, gl.text);
  g.uniform1f(u.uTextOn, Type.active ? 1 : 0);
  gl.draw();
}
function step(now) {
  const dt = Math.min(64, now - last); last = now; S.dt = dt; S.t = now / 1000;
  if (lenis) lenis.raf(now);
  const y = scrollY; S.vel = lerp(S.vel, y - S.y, .3); S.y = y;
  S.p = clamp(y / storyLen);
  const k = 1 - Math.exp(-dt / (SET === 'phone' ? 95 : 110));
  S.ps = Math.abs(S.p - S.ps) < 1e-5 ? S.p : lerp(S.ps, S.p, k);
  S.vs = lerp(S.vs, (S.vel / S.H) * 6, .15);
  if (!fine && !S.gyro) { S.mx = Math.sin(S.t * .35) * .4; S.my = Math.cos(S.t * .27) * .3; }
  S.smx = lerp(S.smx, S.mx, .06); S.smy = lerp(S.smy, S.my, .06);
  if (S.entered && S.intro < 1) S.intro = clamp((now - S.introT) / 2600);
  if (frames) { frames.kick(); frames.decodeAhead(); }
  render(); Fly.update(S.ps); updateOverlays(S.ps); updateHud(S.ps); Sound.update(S.ps);
}
let manual = false, vnow = 0;
function loop(now) { requestAnimationFrame(loop); if (!manual) step(now); }

// ---------------------------------------------------------------- boot
const ldLine = $('.ld-line i'), ldPct = $('#ldPct'), loader = $('#loader');
const setLd = v => { ldLine.style.width = (v * 100).toFixed(1) + '%'; ldPct.textContent = Math.round(v * 100) + '%'; };
async function boot() {
  M = await (await fetch('frames/film.json')).json();
  SET = (innerWidth / innerHeight) < 1 ? 'phone' : 'desk';
  html.classList.add('set-' + SET);
  buildTimeline(); AV = M[SET].avail || Array.from({ length: M.count }, (_, i) => i);
  if (reduce) return bootReduced();
  try { gl = new GL($('#gl')); } catch (e) { console.warn(e); return bootReduced(); }
  Type.init(); Fly.init(); measure();
  frames = new Frames();
  const fontP = document.fonts ? Promise.race([document.fonts.load('900 100px Unbounded'), new Promise(r => setTimeout(r, 2500))]) : Promise.resolve();
  let lo = 0, dp = 0; const tick = () => setLd(lo * .8 + dp * .2);
  const depthP = Depth.load().then(() => { dp = 1; tick(); });
  await Promise.all([frames.loadLo(v => { lo = v; tick(); }), depthP, fontP]);
  frames.startHi();
  setLd(1);
  lenis = typeof Lenis === 'function' ? new Lenis({ duration: 1.35, easing: t => Math.min(1, 1.001 - Math.pow(2, -10 * t)), smoothWheel: true, wheelMultiplier: .8, touchMultiplier: 1.3 }) : null;
  if (lenis) lenis.stop(); body.classList.add('locked');
  requestAnimationFrame(loop);
  loader.classList.add('ready');
  const enter = snd => { if (S.entered) return; S.entered = true; S.introT = performance.now(); loader.classList.add('gone'); body.classList.remove('locked'); body.classList.add('in'); if (lenis) lenis.start(); if (snd) Sound.set(true); };
  $$('[data-enter]').forEach(b => b.addEventListener('click', () => enter(b.dataset.enter === 'sound')));
  window.oneTake = { jump, M: () => M, S, frames: () => frames, enter, manual: on => { manual = on; vnow = performance.now(); last = vnow; }, tick: ms => { vnow += ms; step(vnow); }, seek: p => { const y = yFor(p); if (lenis) lenis.scrollTo(y, { immediate: true, force: true }); else scrollTo(0, y); S.ps = S.p = p; } };
}
function bootReduced() {
  html.classList.add('rm');
  const still = $('#still'); still.style.opacity = 1;
  const posters = ['k0', 'k2', 'k4', 'k5', 'k7', 'k8', 'k9'];
  const pick = p => p < .11 ? 'k0' : p < .27 ? 'k2' : p < .34 ? 'k4' : p < .51 ? 'k5' : p < .6 ? 'k7' : p < .75 ? 'k8' : 'k9';
  let cur = ''; Type.init = () => {};
  loader.classList.add('ready'); setLd(1);
  const enter = () => { S.entered = true; S.intro = 1; loader.classList.add('gone'); body.classList.add('in'); };
  $$('[data-enter]').forEach(b => b.addEventListener('click', () => { enter(); if (b.dataset.enter === 'sound') Sound.set(true); }));
  measure();
  const tickR = () => { S.W = innerWidth; S.H = innerHeight; S.p = S.ps = clamp(scrollY / storyLen); const k = pick(S.p); if (k !== cur) { cur = k; still.src = ((M && M.hosts && M.hosts.posters) || '') + `posters/${k}-${SET}.webp`; }
    updateOverlays(S.p); updateHud(S.p); requestAnimationFrame(tickR); };
  requestAnimationFrame(tickR);
  window.oneTake = { jump, S, enter };
}
addEventListener('resize', () => { clearTimeout(measure.t); measure.t = setTimeout(() => { const ns = (innerWidth / innerHeight) < 1 ? 'phone' : 'desk'; measure(); if (M && ns !== SET && !reduce && frames) location.reload(); }, 160); });
boot().catch(e => { console.error(e); loader.classList.add('ready'); });
})();
