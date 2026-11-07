/*!
 * liquid-glass.js — The Best Liquid Glass
 * Physically based Liquid Glass for the web: Snell refraction on a squircle bevel,
 * spectral dispersion, Fresnel reflection, content-tinted specular, liquid merging.
 * MIT License.
 *
 * Two engines:
 *   - "webgl": glass over an image / video / canvas / gradient background. Full fidelity, all browsers with WebGL2.
 *   - "dom":   glass over live page content. Real refraction via SVG backdrop-filter in Chromium,
 *              automatic frosted fallback in Safari / Firefox.
 *
 *   const lg = LiquidGlass.create({ background: '#hero-img', preset: 'auto' });
 *   lg.add('.glass-nav', { role: 'navbar' });
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.LiquidGlass = api;
})(typeof self !== 'undefined' ? self : typeof window !== 'undefined' ? window : this, function () {
  'use strict';

  const SH = /*__SHADERS__*/ null;

  const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
  const lerp = (a, b, t) => a + (b - a) * t;
  const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
  const hexRGB = (h) => {
    let s = String(h || '#ffffff').replace('#', '');
    if (s.length === 3) s = s.split('').map((c) => c + c).join('');
    const n = parseInt(s, 16);
    return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
  };
  const lum = (c) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  const $ = (q) => (typeof q === 'string' ? document.querySelector(q) : q);
  const $$ = (q) => (typeof q === 'string' ? Array.from(document.querySelectorAll(q)) : q instanceof Element ? [q] : Array.from(q || []));

  class Spring {
    constructor(v, response = 0.35, damping = 0.8) { this.v = v; this.t = v; this.vel = 0; this.k = (2 * Math.PI / response) ** 2; this.c = (4 * Math.PI * damping) / response; }
    step(dt) {
      const n = Math.max(1, Math.ceil(dt * 240)), h = dt / n;
      for (let i = 0; i < n; i++) { const a = this.k * (this.t - this.v) - this.c * this.vel; this.vel += a * h; this.v += this.vel * h; }
    }
  }

  /* ------------------------------------------------------------------ *
   * Parameters
   * ------------------------------------------------------------------ */
  const DEFAULTS = {
    ior: 1.5,          // index of refraction (1.0 = no bend, 1.5 = glass, 2.4 = diamond)
    thickness: 44,     // px, height of the dome
    bezel: 30,         // px, width of the curved rim where lensing happens
    base: 0,           // px, extra flat slab under the dome (sharper rim refraction)
    refr: 1.2,         // refraction multiplier (negative = concave look)
    profile: 0,        // 0 convex squircle, 1 convex circle, 2 lip
    disp: 0.08,        // dispersion: IOR spread across the visible spectrum
    dispN: 7,          // spectral samples (1 = off)
    frost: 1.5,        // px, backdrop blur sigma
    sat: 1.35,         // vibrancy (saturation of what is behind)
    bright: 1.04,
    tint: '#ffffff', tintA: 0,
    lightAngle: -135,  // degrees, screen space (−135 = light from top-left)
    rimI: 0.85, rimW: 2.2, rimFar: 0.6,
    glareI: 0.9, glareR: 14, glareConv: 2.2, glareFar: 0.55,
    fresnel: 0.5,
    shadowA: 0.22, shadowR: 24, shadowY: 8,
    contact: 1.2,      // shadow under the glass refracted into the rim (grey inner ring on light backgrounds)
    mergeK: 0,         // px, liquid merge distance for elements in the same group
    cornerN: 3.25,     // superellipse exponent of corners (≈3.25 ≈ iOS continuous corners)
    adapt: 1,          // light/dark adaptivity strength
    veil: 0.06,        // adaptive veil amount
    zoom: 1,           // center magnification
    interactive: true, // press = energize + glow
    maxDpr: 2,
  };
  const PRESETS = {
    regular: {},
    clear: { frost: 0, veil: 0.02, sat: 1.15, disp: 0.1, dispN: 8, refr: 1.3 },
    thick: { frost: 12, veil: 0.14, sat: 1.5, thickness: 54, bezel: 36, refr: 1.25, disp: 0.06, shadowA: 0.28 },
    prism: { frost: 0, veil: 0.02, disp: 0.3, dispN: 12, refr: 1.6, thickness: 52, bezel: 34, ior: 1.6, glareI: 0.7 },
    subtle: { frost: 5, refr: 0.7, disp: 0.03, dispN: 3, rimI: 0.45, glareI: 0.4, shadowA: 0.14, contact: 0.6 },
    tinted: { frost: 5, tint: '#0a84ff', tintA: 0.3, veil: 0.04 },
  };

  /* ------------------------------------------------------------------ *
   * recommend(scene) — scene description → parameters.
   * The heuristics mirror how Apple chooses between Regular / Clear materials.
   * ------------------------------------------------------------------ */
  function recommend(desc) {
    const d = Object.assign({ surface: 'photo', brightness: 0.5, busyness: 0.5, role: 'auto', size: null, emphasis: 'normal', motion: 'static', hasText: null }, desc || {});
    const w = d.size ? d.size.w || d.size.width || 200 : 200;
    const h = d.size ? d.size.h || d.size.height || 60 : 60;
    let role = d.role;
    if (role === 'auto') {
      const m = Math.min(w, h), M = Math.max(w, h);
      role = m <= 64 && M <= 80 ? 'button' : m <= 90 && M / m > 3 ? 'navbar' : M > 420 || m > 220 ? 'panel' : 'card';
    }
    const p = {};
    const half = Math.min(w, h) / 2;
    // 1) role → geometry & material weight
    if (role === 'button' || role === 'toggle' || role === 'badge') {
      Object.assign(p, { bezel: Math.min(half, 22), thickness: Math.min(half, 22) * 1.4, frost: 1, rimI: 0.85, glareI: 0.9, shadowA: 0.2, shadowR: 16, shadowY: 5 });
    } else if (role === 'navbar' || role === 'tabbar' || role === 'toolbar') {
      Object.assign(p, { bezel: Math.min(half * 0.95, 30), thickness: 44, frost: 2, rimI: 0.85, glareI: 0.9, shadowA: 0.22 });
    } else if (role === 'lens' || role === 'magnifier') {
      Object.assign(p, { bezel: Math.min(half * 0.7, 40), thickness: 54, frost: 0, refr: 1.4, disp: 0.12, dispN: 9, zoom: 1.18, veil: 0.02, rimI: 0.9, glareI: 0.9 });
    } else if (role === 'panel' || role === 'sheet' || role === 'sidebar' || role === 'menu') {
      Object.assign(p, { bezel: Math.min(half * 0.5, 34), thickness: 48, frost: 9, veil: 0.12, sat: 1.45, shadowA: 0.28, shadowR: 36, shadowY: 12, glareR: 16 });
    } else { // card
      Object.assign(p, { bezel: Math.min(half * 0.6, 32), thickness: 46, frost: 4, veil: 0.08, shadowA: 0.24, shadowR: 28, shadowY: 10 });
    }
    const hasText = d.hasText !== null ? d.hasText : role !== 'lens';
    // 2) what is behind
    const s = d.surface;
    if (s === 'photo' || s === 'video' || s === 'gradient' || s === 'map' || s === '3d') {
      // Clear material: keep the lensing visible, add only the frost legibility requires.
      p.frost = role === 'lens' ? 0 : hasText ? Math.max(0, (p.frost || 0) * 0.5 + d.busyness * 3) : (p.frost || 0) * 0.25;
      p.veil = Math.min(p.veil == null ? 0.1 : p.veil, 0.06 + (hasText ? d.busyness * 0.08 : 0));
      p.disp = p.disp == null ? 0.1 : p.disp;
      p.sat = p.sat == null ? 1.2 : p.sat;
      if (s === 'video' || d.motion === 'video') p.frost = Math.min(p.frost, 4);
    } else if (s === 'text' || s === 'ui' || s === 'list') {
      // Busy high-frequency content: Regular material, calmer fringes.
      p.frost = Math.max(p.frost || 0, role === 'lens' ? 0 : 1.5 + d.busyness * 2.5);
      p.disp = role === 'lens' ? 0.08 : 0.05;
      p.dispN = role === 'lens' ? 7 : 5;
      p.veil = Math.max(p.veil == null ? 0.1 : p.veil, 0.1);
    } else if (s === 'solid' || s === 'flat') {
      // Nothing to refract: definition must come from rim light and shadow.
      p.rimI = 0.95; p.glareI = 0.95; p.shadowA = Math.max(p.shadowA || 0.2, 0.28); p.disp = 0.02; p.dispN = 3;
      p.frost = Math.min(p.frost || 0, 4); p.fresnel = 0.6; p.contact = 1.6;
    }
    // 3) brightness → appearance
    const b = d.brightness;
    const tone = b > 0.58 ? 'light' : b < 0.42 ? 'dark' : (d.theme === 'dark' ? 'dark' : 'light');
    if (tone === 'dark') { p.rimI = Math.max(p.rimI || 0.85, 0.9); p.glareI = Math.max(p.glareI || 0.9, 0.95); p.shadowA = Math.min(p.shadowA || 0.22, 0.3) + 0.05; }
    else { p.shadowA = (p.shadowA || 0.22) + 0.03; }
    // 4) emphasis
    if (d.emphasis === 'showcase') { p.disp = Math.max(p.disp || 0.08, 0.18); p.dispN = 10; p.refr = Math.max(p.refr || 1, 1.3); p.frost = Math.min(p.frost || 0, 2); }
    else if (d.emphasis === 'subtle') { p.disp = Math.min(p.disp == null ? 0.08 : p.disp, 0.04); p.refr = Math.min(p.refr || 1, 0.8); p.rimI = Math.min(p.rimI || 0.55, 0.45); }
    // 5) motion / perf
    if (d.motion === 'scrolling' || d.motion === 'video') p.dispN = Math.min(p.dispN || 7, 7);
    p.frost = Math.round(p.frost * 2) / 2;
    for (const key in p) if (typeof p[key] === 'number') p[key] = Math.round(p[key] * 1000) / 1000;
    return { params: p, tone, role, material: (p.frost || 0) <= 1.5 ? 'clear' : 'regular' };
  }

  function spectral(P) {
    const N = P.disp <= 0.0001 ? 1 : Math.max(1, Math.min(16, Math.round(P.dispN)));
    const dw = new Float32Array(64);
    if (N <= 1) { dw.set([1, 1, 1, 0.5], 0); return { dw, N: 1 }; }
    const g = (x, m, s) => Math.exp(-0.5 * ((x - m) / s) ** 2);
    let sr = 0, sg = 0, sb = 0;
    const a = [];
    for (let i = 0; i < N; i++) {
      const t = i / (N - 1);
      const r = g(t, 0.1, 0.2) + 0.16 * g(t, 1, 0.12), gg = g(t, 0.5, 0.18), bb = g(t, 0.88, 0.18);
      a.push([r, gg, bb, t]); sr += r; sg += gg; sb += bb;
    }
    a.forEach((v, i) => dw.set([v[0] / sr, v[1] / sg, v[2] / sb, v[3]], i * 4));
    return { dw, N };
  }

  function parseRadius(el, w, h) {
    const cs = getComputedStyle(el);
    const v = cs.borderTopLeftRadius || '0';
    let r = parseFloat(v) || 0;
    if (v.includes('%')) r = (r / 100) * Math.min(w, h);
    return Math.min(r, Math.min(w, h) / 2);
  }
  function guessRole(w, h) {
    const m = Math.min(w, h), M = Math.max(w, h);
    return m <= 64 && M <= 80 ? 'button' : m <= 90 && M / m > 3 ? 'navbar' : M > 420 || m > 220 ? 'panel' : 'card';
  }
  function pageTone(el) {
    let n = el && el.parentElement;
    while (n) {
      const c = getComputedStyle(n).backgroundColor;
      const m = c && c.match(/rgba?\(([^)]+)\)/);
      if (m) {
        const v = m[1].split(',').map(parseFloat);
        if (v.length < 4 || v[3] > 0.5) return lum([v[0] / 255, v[1] / 255, v[2] / 255]) > 0.5 ? 'light' : 'dark';
      }
      n = n.parentElement;
    }
    return window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  function setTone(el, tone) {
    if (el.dataset.lgTone === tone) return;
    el.dataset.lgTone = tone;
    el.style.setProperty('--lg-fg', tone === 'light' ? '#0b0b0f' : '#ffffff');
    el.style.setProperty('--lg-fg-2', tone === 'light' ? 'rgba(11,11,15,.6)' : 'rgba(255,255,255,.7)');
  }

  /* ================================================================== *
   * WebGL engine
   * ================================================================== */
  const MAXS = 10;
  class GLEngine {
    constructor(opts) {
      this.kind = 'webgl';
      this.opts = opts;
      this.P = Object.assign({}, DEFAULTS, PRESETS[opts.preset] || {}, opts.params || {});
      this.auto = opts.preset === 'auto';
      this.items = [];
      this.groupSeq = 100;
      this.bg = null;
      this.time = 0;
      this.visible = true;
      this.glow = { x: 0, y: 0, a: new Spring(0, 0.22, 1) };

      const bgEl = opts.background instanceof Element ? opts.background : (typeof opts.background === 'string' && !/^(https?:|data:|blob:|\/|\.\/|\.\.\/)/.test(opts.background) && !/\.(png|jpe?g|webp|gif|avif|svg)(\?|$)/i.test(opts.background) ? $(opts.background) : null);
      this.bgEl = bgEl;
      this.container = $(opts.container) || (bgEl && bgEl.parentElement) || document.body;
      this._savedContainer = { position: this.container.style.position, isolation: this.container.style.isolation };
      if (getComputedStyle(this.container).position === 'static') this.container.style.position = 'relative';
      // The canvas lives at z-index -1 inside an isolated container: above the container's own
      // background, below all of its content. The original background element is hidden (it is redrawn by the canvas).
      this.container.style.isolation = 'isolate';
      if (bgEl && bgEl !== this.container) { this._savedBgOpacity = bgEl.style.opacity; bgEl.style.opacity = '0'; }

      const cv = (this.canvas = document.createElement('canvas'));
      cv.className = 'lg-canvas';
      cv.setAttribute('aria-hidden', 'true');
      cv.style.cssText = 'position:absolute;left:0;top:0;width:0;height:0;pointer-events:none;z-index:' + (opts.zIndex == null ? -1 : opts.zIndex);
      this.container.prepend(cv);

      const gl = (this.gl = cv.getContext('webgl2', { antialias: false, alpha: false, depth: false, stencil: false, premultipliedAlpha: false, powerPreference: 'high-performance' }));
      if (!gl) throw new Error('WebGL2 unavailable');
      this._init();
      this.setBackground(opts.background);
      this._ro = new ResizeObserver(() => (this._dirtySize = true));
      this._ro.observe(this.container);
      if (bgEl) this._ro.observe(bgEl);
      this._io = new IntersectionObserver((e) => (this.visible = e[0].isIntersecting));
      this._io.observe(cv);
      this._dirtySize = true;
      this._last = performance.now();
      this._loop = this._loop.bind(this);
      this._raf = requestAnimationFrame(this._loop);
    }

    _init() {
      const gl = this.gl;
      const compile = (type, src) => {
        const s = gl.createShader(type);
        gl.shaderSource(s, src); gl.compileShader(s);
        if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
        return s;
      };
      const prog = (fs) => {
        const p = gl.createProgram();
        gl.attachShader(p, compile(gl.VERTEX_SHADER, SH.vert));
        gl.attachShader(p, compile(gl.FRAGMENT_SHADER, fs));
        gl.linkProgram(p);
        if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
        const u = {};
        const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
        for (let i = 0; i < n; i++) { const info = gl.getActiveUniform(p, i); u[info.name.replace(/\[0\]$/, '')] = gl.getUniformLocation(p, info.name); }
        return { p, u: new Proxy(u, { get: (t, k) => (k in t ? t[k] : null) }) };
      };
      this.pScene = prog(SH.scene);
      this.pDown = prog(SH.down);
      this.pGlass = prog(SH.glass);
      gl.bindVertexArray(gl.createVertexArray());
      this.texBg = this._tex();
      this.lv = [];
      this.U = { g0: new Float32Array(MAXS * 4), g1: new Float32Array(MAXS * 4), g2: new Float32Array(MAXS * 4), m0: new Float32Array(MAXS * 4), m1: new Float32Array(MAXS * 4), m2: new Float32Array(MAXS * 4) };
      this.spec = spectral(this.P);
    }
    _tex() {
      const gl = this.gl, t = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, t);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([128, 128, 128, 255]));
      return t;
    }
    _target(w, h) {
      const gl = this.gl, tex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGBA8, w, h);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      const fbo = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
      return { tex, fbo, w, h };
    }
    _upload(src) {
      const gl = this.gl;
      gl.bindTexture(gl.TEXTURE_2D, this.texBg);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
      try { gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src); } catch (e) { console.warn('[liquid-glass] background upload failed (CORS?)', e); }
    }

    /** background: <img> | <video> | <canvas> | selector | URL | { colors: [...], angle } | CSS color string */
    setBackground(bg) {
      if (typeof bg === 'string' && (/^(https?:|data:|blob:|\/|\.\/|\.\.\/)/.test(bg) || /\.(png|jpe?g|webp|gif|avif|svg)(\?|$)/i.test(bg))) {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => this._setMedia(img, img.naturalWidth, img.naturalHeight, false);
        img.src = bg;
        return;
      }
      if (typeof bg === 'string' && /^(#[0-9a-f]{3,8}$|rgb|hsl)/i.test(bg)) bg = { colors: [bg, bg] };
      if (typeof bg === 'string') bg = $(bg);
      if (bg && bg.colors) {
        const c = document.createElement('canvas'); c.width = 512; c.height = 512;
        const x = c.getContext('2d');
        const a = ((bg.angle == null ? 135 : bg.angle) * Math.PI) / 180;
        const g = x.createLinearGradient(256 - Math.cos(a) * 362, 256 - Math.sin(a) * 362, 256 + Math.cos(a) * 362, 256 + Math.sin(a) * 362);
        bg.colors.forEach((col, i) => g.addColorStop(i / Math.max(1, bg.colors.length - 1), col));
        x.fillStyle = g; x.fillRect(0, 0, 512, 512);
        this._setMedia(c, 512, 512, false);
        return;
      }
      if (bg instanceof HTMLImageElement) {
        const go = () => this._setMedia(bg, bg.naturalWidth, bg.naturalHeight, false);
        if (bg.complete && bg.naturalWidth) go(); else bg.addEventListener('load', go, { once: true });
      } else if (bg instanceof HTMLVideoElement) {
        const go = () => this._setMedia(bg, bg.videoWidth, bg.videoHeight, true);
        if (bg.readyState >= 2) go(); else bg.addEventListener('loadeddata', go, { once: true });
      } else if (bg instanceof HTMLCanvasElement) {
        this._setMedia(bg, bg.width, bg.height, this.opts.liveBackground !== false);
      }
    }
    _setMedia(src, w, h, live) {
      this.bg = { src, w: Math.max(1, w), h: Math.max(1, h), live };
      this._upload(src);
      this._buildLum();
    }
    _buildLum() {
      const b = this.bg;
      if (!b) return;
      try {
        const c = this._lumCv || (this._lumCv = document.createElement('canvas'));
        const tw = 96, th = Math.max(1, Math.round((96 * b.h) / b.w));
        c.width = tw; c.height = th;
        const x = c.getContext('2d', { willReadFrequently: true });
        x.drawImage(b.src, 0, 0, tw, th);
        const d = x.getImageData(0, 0, tw, th).data;
        const L = new Float32Array(tw * th);
        for (let i = 0, j = 0; i < L.length; i++, j += 4) L[i] = (0.2126 * d[j] + 0.7152 * d[j + 1] + 0.0722 * d[j + 2]) / 255;
        this.lum = { L, w: tw, h: th };
      } catch (e) { this.lum = null; }
    }

    /* layout of the background media inside the canvas (CSS px) */
    _mediaRect() {
      const b = this.bg;
      const cw = this.cssW, ch = this.cssH;
      if (!b) return { x: 0, y: 0, w: cw, h: ch };
      let fit = 'cover', posX = 0.5, posY = 0.5;
      if (this.bgEl && this.bgEl !== this.container) {
        const cs = getComputedStyle(this.bgEl);
        fit = cs.objectFit || 'cover';
        const op = (cs.objectPosition || '50% 50%').split(' ');
        const pp = (v) => (v.includes('%') ? parseFloat(v) / 100 : v === 'left' || v === 'top' ? 0 : v === 'right' || v === 'bottom' ? 1 : 0.5);
        posX = pp(op[0] || '50%'); posY = pp(op[1] || '50%');
        if (this.bgEl instanceof HTMLCanvasElement) fit = 'fill';
      }
      if (fit === 'fill') return { x: 0, y: 0, w: cw, h: ch };
      const s = fit === 'contain' ? Math.min(cw / b.w, ch / b.h) : Math.max(cw / b.w, ch / b.h);
      const w = b.w * s, h = b.h * s;
      return { x: (cw - w) * posX, y: (ch - h) * posY, w, h };
    }

    _resize() {
      const gl = this.gl;
      const cr = this.container.getBoundingClientRect();
      let host = this.bgEl && this.bgEl !== this.container ? this.bgEl : this.container;
      let hr = host.getBoundingClientRect();
      if (hr.width < 2 || hr.height < 2) { host = this.container; hr = cr; } // hidden source (e.g. offscreen canvas)
      const left = hr.left - cr.left + this.container.scrollLeft - this.container.clientLeft;
      const top = hr.top - cr.top + this.container.scrollTop - this.container.clientTop;
      this.cssW = Math.max(1, hr.width);
      this.cssH = Math.max(1, hr.height);
      const dpr = Math.min(window.devicePixelRatio || 1, this.P.maxDpr);
      const cw = Math.max(1, Math.round(this.cssW * dpr)), ch = Math.max(1, Math.round(this.cssH * dpr));
      Object.assign(this.canvas.style, { left: left + 'px', top: top + 'px', width: this.cssW + 'px', height: this.cssH + 'px' });
      if (cw === this.cw && ch === this.ch) return;
      this.cw = cw; this.ch = ch; this.px = cw / this.cssW;
      this.canvas.width = cw; this.canvas.height = ch;
      const free = (t) => { if (t) { gl.deleteTexture(t.tex); gl.deleteFramebuffer(t.fbo); } };
      free(this.sceneT); this.lv.forEach(free);
      this.sceneT = this._target(cw, ch);
      this.lv = [null];
      let w = cw, h = ch;
      for (let k = 1; k <= 6; k++) { w = Math.max(1, Math.ceil(w / 2)); h = Math.max(1, Math.ceil(h / 2)); this.lv.push(this._target(w, h)); }
    }

    add(target, o) {
      const els = $$(target);
      const out = [];
      for (const el of els) {
        const it = {
          el, o: Object.assign({}, o || {}), press: new Spring(0, 0.3, 0.55), adapt: new Spring(1, 0.5, 1), light: true, seen: false,
          group: o && o.group != null ? o.group : this.groupSeq++,
          saved: { background: el.style.background, backdropFilter: el.style.backdropFilter, webkitBackdropFilter: el.style.webkitBackdropFilter, boxShadow: el.style.boxShadow, position: el.style.position, zIndex: el.style.zIndex },
        };
        el.style.background = 'transparent';
        el.style.backdropFilter = 'none';
        el.style.webkitBackdropFilter = 'none';
        el.style.boxShadow = 'none';
        el.classList.add('lg-glass');
        if (this.P.interactive && it.o.interactive !== false) {
          it.onDown = (e) => { it.press.t = 1; this._glowAt(e, 1); this._pressed = it; };
          it.onMove = (e) => { if (this._pressed === it) this._glowAt(e); };
          it.onUp = () => { it.press.t = 0; this.glow.a.t = 0; this._pressed = null; };
          el.addEventListener('pointerdown', it.onDown);
          el.addEventListener('pointermove', it.onMove);
          window.addEventListener('pointerup', it.onUp);
          window.addEventListener('pointercancel', it.onUp);
        }
        this.items.push(it);
        out.push(it);
      }
      // groups must be contiguous for the shader's merge loop
      this.items.sort((a, b) => a.group - b.group);
      return out;
    }
    remove(target) {
      const els = $$(target);
      this.items = this.items.filter((it) => {
        if (!els.includes(it.el)) return true;
        Object.assign(it.el.style, it.saved);
        it.el.classList.remove('lg-glass');
        if (it.onDown) { it.el.removeEventListener('pointerdown', it.onDown); it.el.removeEventListener('pointermove', it.onMove); window.removeEventListener('pointerup', it.onUp); window.removeEventListener('pointercancel', it.onUp); }
        return false;
      });
    }
    _glowAt(e, on) {
      const r = this.canvas.getBoundingClientRect();
      this.glow.x = e.clientX - r.left; this.glow.y = e.clientY - r.top;
      if (on) this.glow.a.t = 1;
    }
    set(params) {
      Object.assign(this.P, params);
      this.spec = spectral(this.P);
      this._dirtySize = true;
    }
    _sampleLum(x, y) {
      if (!this.lum) return null;
      const m = this._mr;
      const u = (x - m.x) / m.w, v = (y - m.y) / m.h;
      if (u < 0 || v < 0 || u > 1 || v > 1) return null;
      return this.lum.L[Math.min(this.lum.h - 1, (v * this.lum.h) | 0) * this.lum.w + Math.min(this.lum.w - 1, (u * this.lum.w) | 0)];
    }
    _analyze(it, x, y, w, h) {
      let s = 0, s2 = 0, n = 0, edge = 0, prev = null;
      for (let iy = -3; iy <= 3; iy++) {
        prev = null;
        for (let ix = -3; ix <= 3; ix++) {
          const v = this._sampleLum(x + (ix / 3.5) * (w / 2), y + (iy / 3.5) * (h / 2));
          if (v === null) continue;
          s += v; s2 += v * v; n++;
          if (prev !== null) edge += Math.abs(v - prev);
          prev = v;
        }
      }
      if (!n) return null;
      const mean = s / n, sd = Math.sqrt(Math.max(0, s2 / n - mean * mean));
      return { brightness: mean, busyness: clamp(sd * 2.2 + (edge / n) * 3, 0, 1) };
    }

    _loop(now) {
      this._raf = requestAnimationFrame(this._loop);
      const dt = Math.min(0.05, Math.max(0.001, (now - this._last) / 1000));
      this._last = now;
      if (!this.visible || document.hidden) return;
      try { this.render(dt); } catch (e) { console.error('[liquid-glass]', e); cancelAnimationFrame(this._raf); }
    }

    render(dt) {
      const gl = this.gl, P = this.P;
      if (this._dirtySize) { this._dirtySize = false; this._resize(); }
      this._resize(); // cheap when unchanged; keeps the canvas glued to the host while scrolling
      this.time += dt;
      this.glow.a.step(dt);
      const k = this.px;
      if (this.bg && this.bg.live) {
        if (!(this.bg.src instanceof HTMLVideoElement) || this.bg.src.readyState >= 2) this._upload(this.bg.src);
        if ((this._lumTick = (this._lumTick || 0) + 1) % 20 === 0) this._buildLum();
      }
      this._mr = this._mediaRect();

      // ---- shapes from element rects ----
      const cr = this.canvas.getBoundingClientRect();
      const shapes = [];
      for (const it of this.items) {
        it.press.step(dt); it.adapt.step(dt);
        const r = it.el.getBoundingClientRect();
        if (r.width < 1 || r.height < 1) continue;
        const w = r.width, h = r.height, x = r.left - cr.left + w / 2, y = r.top - cr.top + h / 2;
        if (x + w / 2 < -50 || y + h / 2 < -50 || x - w / 2 > this.cssW + 50 || y - h / 2 > this.cssH + 50) continue;
        const o = it.o;
        let per = {};
        // adaptivity (+ auto tuning)
        const an = this._analyze(it, x, y, w, h);
        if (an) {
          if (an.brightness > 0.6) it.light = true; else if (an.brightness < 0.42) it.light = false;
          it.adapt.t = it.light ? 1 : 0;
          if (!it.seen) { it.adapt.v = it.adapt.t; it.seen = true; }
          setTone(it.el, it.light ? 'light' : 'dark');
          if (this.auto && (!it.rec || (it.recTick = (it.recTick || 0) + 1) % 30 === 0)) {
            it.rec = recommend({ surface: o.surface || 'photo', brightness: an.brightness, busyness: an.busyness, role: o.role || 'auto', size: { w, h }, emphasis: o.emphasis || 'normal' }).params;
          }
        }
        if (this.auto && it.rec) per = it.rec;
        const sc = 1 + 0.04 * it.press.v;
        const rad = o.radius != null ? o.radius : parseRadius(it.el, w, h);
        const frost = o.frost != null ? o.frost : per.frost != null ? per.frost : P.frost;
        const bez = o.bezel != null ? o.bezel : per.bezel != null ? per.bezel : 0;
        const thick = o.thickness != null ? o.thickness / P.thickness : per.thickness != null ? per.thickness / P.thickness : 1;
        shapes.push({
          x, y, w: w * sc, h: h * sc, r: rad * sc, g: it.group,
          tint: o.tint ? [...hexRGB(o.tint), o.tintA == null ? 0.25 : o.tintA] : P.tintA > 0 ? [...hexRGB(P.tint), P.tintA] : [1, 1, 1, 0],
          frost, adapt: it.adapt.v, zoom: o.zoom || per.zoom || P.zoom,
          veil: (o.veil != null ? o.veil : per.veil != null ? per.veil : P.veil) / Math.max(P.veil, 1e-3),
          rim: o.rim != null ? o.rim : per.rimI != null ? per.rimI / Math.max(P.rimI, 1e-3) : 1,
          bezel: bez, thick, refr: o.refr != null ? o.refr : per.refr != null ? per.refr : 1,
          sh: o.shadow != null ? o.shadow : per.shadowA != null ? per.shadowA / Math.max(P.shadowA, 1e-3) : 1,
        });
      }

      // ---- 1. scene ----
      let u = this.pScene.u;
      gl.useProgram(this.pScene.p);
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.sceneT.fbo);
      gl.viewport(0, 0, this.cw, this.ch);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.texBg);
      gl.uniform1i(u.u_tex, 0);
      gl.uniform2f(u.u_res, this.cw, this.ch);
      gl.uniform1i(u.u_mode, 2);
      gl.uniform4f(u.u_img, this._mr.x * k, this._mr.y * k, this._mr.w * k, this._mr.h * k);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      // ---- 2. pyramid ----
      u = this.pDown.u;
      gl.useProgram(this.pDown.p);
      gl.uniform1i(u.u_src, 0);
      for (let i = 1; i <= 6; i++) {
        const src = i === 1 ? this.sceneT : this.lv[i - 1], dst = this.lv[i];
        gl.bindFramebuffer(gl.FRAMEBUFFER, dst.fbo);
        gl.viewport(0, 0, dst.w, dst.h);
        gl.bindTexture(gl.TEXTURE_2D, src.tex);
        gl.uniform2f(u.u_texel, 1 / src.w, 1 / src.h);
        gl.uniform2f(u.u_dst, dst.w, dst.h);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
      }
      // ---- 3. glass → screen ----
      u = this.pGlass.u;
      gl.useProgram(this.pGlass.p);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, this.cw, this.ch);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.sceneT.tex);
      for (let i = 1; i <= 6; i++) { gl.activeTexture(gl.TEXTURE0 + i); gl.bindTexture(gl.TEXTURE_2D, this.lv[i].tex); }
      ['u_bg0', 'u_bg1', 'u_bg2', 'u_bg3', 'u_bg4', 'u_bg5', 'u_bg6'].forEach((n, i) => gl.uniform1i(u[n], i));
      ['u_sp0', 'u_sp1', 'u_sp2', 'u_sp3', 'u_sp4', 'u_sp5'].forEach((n) => gl.uniform1i(u[n], 1));
      const a = ((P.lightAngle * Math.PI) / 180);
      gl.uniform2f(u.u_res, this.cw, this.ch);
      gl.uniform1i(u.u_pass, 1);
      gl.uniform1f(u.u_px, k);
      gl.uniform1f(u.u_lodBias, 0.25);
      gl.uniform1f(u.u_ior, P.ior); gl.uniform1f(u.u_disp, P.disp);
      gl.uniform1i(u.u_dispN, this.spec.N); gl.uniform4fv(u.u_dw, this.spec.dw);
      gl.uniform1f(u.u_thick, P.thickness * k); gl.uniform1f(u.u_bezel, P.bezel * k); gl.uniform1f(u.u_base, P.base * k);
      gl.uniform1f(u.u_refr, P.refr); gl.uniform1i(u.u_profile, P.profile);
      gl.uniform1f(u.u_mergeK, P.mergeK * k);
      gl.uniform1f(u.u_margin, (Math.max(P.mergeK, P.shadowR * 1.2 + Math.abs(P.shadowY), 8) + 6) * k);
      gl.uniform2f(u.u_L, Math.cos(a), Math.sin(a));
      gl.uniform1f(u.u_rimI, P.rimI); gl.uniform1f(u.u_rimW, P.rimW * k); gl.uniform1f(u.u_rimFar, P.rimFar);
      gl.uniform1f(u.u_glareI, P.glareI); gl.uniform1f(u.u_glareR, P.glareR * k); gl.uniform1f(u.u_glareConv, P.glareConv); gl.uniform1f(u.u_glareFar, P.glareFar);
      gl.uniform1f(u.u_fresnel, P.fresnel);
      gl.uniform1f(u.u_contact, P.contact);
      gl.uniform1f(u.u_shA, P.shadowA); gl.uniform1f(u.u_shR, P.shadowR * k); gl.uniform2f(u.u_shOff, 0, P.shadowY * k);
      gl.uniform1f(u.u_sat, P.sat); gl.uniform1f(u.u_bright, P.bright); gl.uniform1f(u.u_veil, P.veil); gl.uniform1f(u.u_adaptI, P.adapt);
      gl.uniform4f(u.u_glow, this.glow.x * k, this.glow.y * k, 70 * k, clamp(this.glow.a.v, 0, 1.2) * 0.8);
      gl.uniform1i(u.u_debug, 0); gl.uniform1i(u.u_lazy, 0);
      gl.uniform1i(u.u_nf, 0); gl.uniform1i(u.u_nsp, 0);
      this._uploadShapes(u, shapes);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }
    _uploadShapes(u, arr) {
      const gl = this.gl, k = this.px, U = this.U, P = this.P;
      const n = Math.min(arr.length, MAXS);
      for (let i = 0; i < n; i++) {
        const s = arr[i];
        const hw = (s.w / 2) * k, hh = (s.h / 2) * k, minHalf = Math.min(hw, hh);
        const r = Math.min(s.r * k, minHalf);
        let R = r * 1.528, cn = P.cornerN;
        if (R > minHalf) { cn = lerp(P.cornerN, 2, clamp((R - minHalf) / (minHalf * 0.528 + 1e-6), 0, 1)); R = minHalf; }
        U.g0.set([s.x * k, s.y * k, hw, hh], i * 4);
        U.g1.set([R, cn, 0, 0], i * 4);
        U.g2.set([s.g, 1, s.sh, s.refr], i * 4);
        U.m0.set(s.tint, i * 4);
        U.m1.set([s.frost * k, 0, s.adapt, s.zoom], i * 4);
        U.m2.set([s.veil, s.rim, s.bezel * k, s.thick], i * 4);
      }
      gl.uniform1i(u.u_n, n);
      gl.uniform4fv(u.u_g0, U.g0); gl.uniform4fv(u.u_g1, U.g1); gl.uniform4fv(u.u_g2, U.g2);
      gl.uniform4fv(u.u_m0, U.m0); gl.uniform4fv(u.u_m1, U.m1); gl.uniform4fv(u.u_m2, U.m2);
    }
    destroy() {
      cancelAnimationFrame(this._raf);
      this._ro.disconnect(); this._io.disconnect();
      this.remove(this.items.map((i) => i.el));
      this.canvas.remove();
      Object.assign(this.container.style, this._savedContainer);
      if (this.bgEl && this._savedBgOpacity !== undefined) this.bgEl.style.opacity = this._savedBgOpacity;
      const ext = this.gl.getExtension('WEBGL_lose_context');
      if (ext) ext.loseContext();
    }
  }

  /* ================================================================== *
   * DOM engine — SVG backdrop-filter with physically computed maps
   * ================================================================== */
  const isChromium = (() => {
    if (typeof navigator === 'undefined') return false;
    const b = navigator.userAgentData && navigator.userAgentData.brands;
    if (b) return b.some((x) => /Chromium|Google Chrome|Microsoft Edge|Opera/.test(x.brand));
    return /Chrome\/|Edg\//.test(navigator.userAgent) && !/Firefox|FxiOS|CriOS/.test(navigator.userAgent) && !!window.chrome;
  })();

  function profH(x, profile) {
    x = clamp(x, 0, 1);
    const cv = Math.pow(Math.max(1 - Math.pow(1 - x, 4), 0), 0.25);
    if (profile === 1) return Math.sqrt(Math.max(1 - (1 - x) * (1 - x), 0));
    if (profile === 2) { const s = x * x * x * (x * (x * 6 - 15) + 10); return cv * (1 - 0.32 * s); }
    return cv;
  }
  function makeSdf(w, h, r, cornerN) {
    const hw = w / 2, hh = h / 2, minHalf = Math.min(hw, hh);
    const rr = Math.min(r, minHalf);
    let R = rr * 1.528, n = cornerN;
    if (R > minHalf) { n = lerp(cornerN, 2, clamp((R - minHalf) / (minHalf * 0.528 + 1e-6), 0, 1)); R = minHalf; }
    return (x, y) => {
      const dx = Math.abs(x) - hw + R, dy = Math.abs(y) - hh + R;
      const mx = Math.max(dx, 0), my = Math.max(dy, 0);
      let c;
      if (mx > 0 && my > 0) {
        if (n < 2.02) c = Math.hypot(mx, my);
        else { const m = Math.max(mx, my); c = m * Math.pow(Math.pow(mx / m, n) + Math.pow(my / m, n), 1 / n); }
      } else c = Math.max(mx, my);
      return c + Math.min(Math.max(dx, dy), 0) - R;
    };
  }
  /** Bakes displacement + specular maps for an element of size w×h with the same physics as the shader. */
  function bakeMaps(w, h, r, P) {
    const W = Math.max(2, Math.round(w)), H = Math.max(2, Math.round(h));
    const sdf = makeSdf(W, H, r, P.cornerN);
    const minHalf = Math.min(W, H) / 2;
    const bw = clamp(P.bezel, 1, minHalf * 0.98);
    const T = P.thickness * (bw / Math.max(P.bezel, 1));
    const a = (P.lightAngle * Math.PI) / 180, Lx = Math.cos(a), Ly = Math.sin(a);
    const eta = 1 / Math.max(P.ior, 1);
    const dx = new Float32Array(W * H), dy = new Float32Array(W * H);
    const spec = new Uint8ClampedArray(W * H * 4);
    const shade = new Uint8ClampedArray(W * H * 4);
    const sband = Math.max(P.shadowR * 0.5, 2);
    let maxD = 0.5;
    const band = Math.max(bw, P.glareR * 3, P.rimW * 2) + 2;
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const px = x + 0.5 - W / 2, py = y + 0.5 - H / 2;
        const d = sdf(px, py);
        if (d > 0) continue;
        const dIn = -d;
        if (dIn > band) continue;
        let gx = sdf(px + 0.5, py) - sdf(px - 0.5, py), gy = sdf(px, py + 0.5) - sdf(px, py - 0.5);
        const gl = Math.hypot(gx, gy) || 1; gx /= gl; gy /= gl;
        const xx = dIn / bw;
        let hgt = 1, slope = 0;
        if (xx < 1) {
          const xc = Math.max(xx, 0.002), e = 0.002, xa = Math.max(xc - e, 0), xb = Math.min(xc + e, 1);
          hgt = profH(xc, P.profile);
          slope = ((profH(xb, P.profile) - profH(xa, P.profile)) / (xb - xa)) * (T / bw);
        }
        // N = normalize(n2*slope, 1); refract I=(0,0,-1)
        let nx = gx * slope, ny = gy * slope, nz = 1;
        const nl = Math.hypot(nx, ny, nz); nx /= nl; ny /= nl; nz /= nl;
        const cosi = nz; // -dot(N,I)
        const k2 = 1 - eta * eta * (1 - cosi * cosi);
        const c = eta * cosi - Math.sqrt(Math.max(k2, 0));
        const rx = c * nx, ry = c * ny, rz = -eta + c * nz;
        const depth = hgt * T + P.base;
        let ox = (rx / Math.max(-rz, 0.06)) * depth * P.refr, oy = (ry / Math.max(-rz, 0.06)) * depth * P.refr;
        const dl = Math.hypot(ox, oy), lim = Math.max(minHalf - dIn, 0) * 0.9 + 0.5;
        if (dl > lim) { ox *= lim / dl; oy *= lim / dl; } // never cross the medial axis (no rod-like inversion)
        const i = y * W + x;
        dx[i] = ox; dy[i] = oy;
        maxD = Math.max(maxD, Math.abs(ox), Math.abs(oy));
        // specular: rim line + glare + fresnel
        const ndl = gx * Lx + gy * Ly;
        const rimM = 1 - sstep(P.rimW * 0.3, P.rimW, dIn);
        const rimA = lerp(0.25, 1, Math.pow(Math.abs(ndl), 1.6)) * (ndl >= 0 ? 1 : P.rimFar);
        const ang = Math.pow(Math.max(ndl, 0), P.glareConv) + P.glareFar * Math.pow(Math.max(-ndl, 0), P.glareConv);
        const geo = Math.exp(-dIn / Math.max(P.glareR, 0.5));
        const F = Math.pow(1 - clamp(nz, 0, 1), 5);
        const al = clamp(rimM * rimA * P.rimI + ang * geo * P.glareI * 0.5 + F * P.fresnel * 0.5, 0, 1);
        spec[i * 4] = spec[i * 4 + 1] = spec[i * 4 + 2] = 255;
        spec[i * 4 + 3] = al * 255;
        // contact shade: the shadow under the glass, refracted into the rim
        shade[i * 4 + 3] = clamp(Math.exp(-(dIn + Math.hypot(ox, oy)) / sband) * P.contact * 0.28 * P.shadowA / 0.22, 0, 0.6) * 255;
      }
    }
    const cv = document.createElement('canvas');
    cv.width = W; cv.height = H;
    const ctx = cv.getContext('2d');
    const img = ctx.createImageData(W, H);
    for (let i = 0; i < W * H; i++) {
      img.data[i * 4] = 128 + (dx[i] / maxD) * 127;
      img.data[i * 4 + 1] = 128 + (dy[i] / maxD) * 127;
      img.data[i * 4 + 2] = 128;
      img.data[i * 4 + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    const dispURL = cv.toDataURL();
    ctx.putImageData(new ImageData(spec, W, H), 0, 0);
    const specURL = cv.toDataURL();
    ctx.putImageData(new ImageData(shade, W, H), 0, 0);
    const shadeURL = cv.toDataURL();
    return { W, H, dispURL, specURL, shadeURL, scale: (maxD * 2 * 255) / 254 };
  }

  let svgHost = null, filterSeq = 0;
  const SVGNS = 'http://www.w3.org/2000/svg';
  function svgEl(tag, attrs, parent) {
    const e = document.createElementNS(SVGNS, tag);
    for (const k in attrs) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  }

  class DOMEngine {
    constructor(opts) {
      this.kind = isChromium ? 'dom' : 'dom-fallback';
      this.opts = opts;
      this.P = Object.assign({}, DEFAULTS, PRESETS[opts.preset] || {}, opts.params || {});
      this.items = [];
      if (!svgHost) {
        svgHost = svgEl('svg', { width: '0', height: '0', 'aria-hidden': 'true', style: 'position:absolute;width:0;height:0;overflow:hidden;pointer-events:none' });
        document.body.appendChild(svgHost);
        svgEl('defs', {}, svgHost);
      }
      this._ro = new ResizeObserver((entries) => entries.forEach((e) => { const it = this.items.find((i) => i.el === e.target); if (it) this._schedule(it); }));
    }
    _schedule(it) { clearTimeout(it.timer); it.timer = setTimeout(() => this._apply(it), 40); }
    add(target, o) {
      const out = [];
      for (const el of $$(target)) {
        const it = { el, o: Object.assign({}, o || {}), id: 'lg-f' + ++filterSeq, saved: { backdropFilter: el.style.backdropFilter, webkitBackdropFilter: el.style.webkitBackdropFilter, background: el.style.background, boxShadow: el.style.boxShadow, transition: el.style.transition, transform: el.style.transform } };
        el.classList.add('lg-glass');
        if (this.P.interactive && it.o.interactive !== false) {
          el.style.transition = (el.style.transition ? el.style.transition + ', ' : '') + 'transform .45s cubic-bezier(.34,1.56,.64,1)';
          it.down = () => (el.style.transform = 'scale(1.04)');
          it.up = () => (el.style.transform = it.saved.transform || '');
          el.addEventListener('pointerdown', it.down);
          window.addEventListener('pointerup', it.up);
          window.addEventListener('pointercancel', it.up);
        }
        this.items.push(it);
        this._ro.observe(el);
        this._apply(it);
        out.push(it);
      }
      return out;
    }
    _params(it) {
      const r = it.el.getBoundingClientRect();
      const o = it.o;
      let P = Object.assign({}, this.P);
      if (this.opts.preset === 'auto' || o.role || o.surface) {
        const tone0 = o.tone || pageTone(it.el);
        const rec = recommend({ surface: o.surface || 'text', brightness: tone0 === 'light' ? 0.85 : 0.15, busyness: o.busyness == null ? 0.6 : o.busyness, role: o.role || 'auto', size: { w: r.width, h: r.height }, emphasis: o.emphasis || 'normal' });
        if (this.opts.preset === 'auto') Object.assign(P, rec.params);
      }
      for (const k in o) if (k in DEFAULTS) P[k] = o[k];
      return { P, w: r.width, h: r.height };
    }
    _apply(it) {
      const el = it.el;
      const { P, w, h } = this._params(it);
      if (w < 2 || h < 2) return;
      const tone = it.o.tone || pageTone(el);
      setTone(el, tone);
      const veil = tone === 'light' ? `rgba(255,255,255,${P.veil * 1.2})` : `rgba(0,0,0,${P.veil * 1.4})`;
      const tint = P.tintA > 0 ? (() => { const c = hexRGB(P.tint).map((v) => Math.round(v * 255)); return `rgba(${c[0]},${c[1]},${c[2]},${P.tintA * 0.6})`; })() : null;
      el.style.background = tint ? `linear-gradient(${tint},${tint}), ${veil}` : veil;
      el.style.boxShadow = `0 ${P.shadowY}px ${P.shadowR}px rgba(0,0,0,${P.shadowA}), 0 0 0 0.5px rgba(0,0,0,${P.shadowA * 0.35})`;
      if (!isChromium) {
        const f = `blur(${Math.max(P.frost, 2)}px) saturate(${P.sat}) brightness(${P.bright})`;
        el.style.backdropFilter = f;
        el.style.webkitBackdropFilter = f;
        el.style.boxShadow += `, inset 1px 1px 0 rgba(255,255,255,${0.5 * P.rimI + 0.15}), inset -1px -1px 0 rgba(255,255,255,${0.3 * P.rimI * P.rimFar + 0.05})`;
        return;
      }
      const r = it.o.radius != null ? it.o.radius : parseRadius(el, w, h);
      const key = [Math.round(w), Math.round(h), Math.round(r), P.ior, P.thickness, P.bezel, P.base, P.refr, P.profile, P.lightAngle, P.rimI, P.rimW, P.glareI, P.glareR, P.cornerN, P.fresnel, P.contact, P.shadowR, P.shadowA].join('|');
      if (it.key !== key) {
        it.key = key;
        it.maps = bakeMaps(w, h, r, P);
      }
      const m = it.maps;
      if (it.filter) it.filter.remove();
      const defs = svgHost.firstChild;
      const f = (it.filter = svgEl('filter', { id: it.id, x: '0', y: '0', width: m.W, height: m.H, filterUnits: 'userSpaceOnUse', primitiveUnits: 'userSpaceOnUse', 'color-interpolation-filters': 'sRGB' }, defs));
      let src = 'SourceGraphic';
      if (P.frost > 0.3) { svgEl('feGaussianBlur', { in: src, stdDeviation: P.frost, edgeMode: 'duplicate', result: 'blur' }, f); src = 'blur'; }
      svgEl('feImage', { href: m.dispURL, x: 0, y: 0, width: m.W, height: m.H, preserveAspectRatio: 'none', result: 'map' }, f);
      const dispOn = P.disp > 0.001 && P.dispN > 1;
      const chan = (sc, sel, res) => svgEl('feDisplacementMap', { in: src, in2: 'map', scale: sc, xChannelSelector: 'R', yChannelSelector: 'G', result: res }, f);
      if (dispOn) {
        chan(m.scale * (1 - P.disp), 'R', 'dr');
        chan(m.scale, 'G', 'dg');
        chan(m.scale * (1 + P.disp), 'B', 'db');
        svgEl('feColorMatrix', { in: 'dr', type: 'matrix', values: '1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0', result: 'r' }, f);
        svgEl('feColorMatrix', { in: 'dg', type: 'matrix', values: '0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 1 0', result: 'g' }, f);
        svgEl('feColorMatrix', { in: 'db', type: 'matrix', values: '0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 1 0', result: 'b' }, f);
        svgEl('feBlend', { in: 'r', in2: 'g', mode: 'screen', result: 'rg' }, f);
        svgEl('feBlend', { in: 'rg', in2: 'b', mode: 'screen', result: 'refr' }, f);
      } else chan(m.scale, 'G', 'refr');
      svgEl('feColorMatrix', { in: 'refr', type: 'saturate', values: P.sat, result: 'sat' }, f);
      const ct = svgEl('feComponentTransfer', { in: 'sat', result: 'lit' }, f);
      ['feFuncR', 'feFuncG', 'feFuncB'].forEach((fn) => svgEl(fn, { type: 'linear', slope: P.bright }, ct));
      svgEl('feImage', { href: m.shadeURL, x: 0, y: 0, width: m.W, height: m.H, preserveAspectRatio: 'none', result: 'shade' }, f);
      svgEl('feComposite', { in: 'shade', in2: 'lit', operator: 'over', result: 'shaded' }, f);
      svgEl('feImage', { href: m.specURL, x: 0, y: 0, width: m.W, height: m.H, preserveAspectRatio: 'none', result: 'spec' }, f);
      svgEl('feComposite', { in: 'spec', in2: 'shaded', operator: 'over' }, f);
      el.style.backdropFilter = `url(#${it.id})`;
      el.style.webkitBackdropFilter = `url(#${it.id})`;
    }
    set(params) { Object.assign(this.P, params); this.items.forEach((it) => this._apply(it)); }
    remove(target) {
      const els = $$(target);
      this.items = this.items.filter((it) => {
        if (!els.includes(it.el)) return true;
        this._ro.unobserve(it.el);
        if (it.filter) it.filter.remove();
        Object.assign(it.el.style, it.saved);
        it.el.classList.remove('lg-glass');
        if (it.down) { it.el.removeEventListener('pointerdown', it.down); window.removeEventListener('pointerup', it.up); window.removeEventListener('pointercancel', it.up); }
        return false;
      });
    }
    destroy() { this.remove(this.items.map((i) => i.el)); this._ro.disconnect(); }
  }

  /* ================================================================== *
   * Public API
   * ================================================================== */
  function create(opts) {
    opts = opts || {};
    const reduce = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-transparency: reduce)').matches;
    if (reduce && opts.respectReducedTransparency !== false) {
      opts = Object.assign({}, opts, { params: Object.assign({}, opts.params, { frost: 24, veil: 0.6, disp: 0, refr: 0.3 }) });
    }
    const wantGL = opts.engine === 'webgl' || (opts.engine !== 'dom' && opts.background != null);
    let engine;
    if (wantGL) {
      try { engine = new GLEngine(opts); } catch (e) { console.warn('[liquid-glass] WebGL engine unavailable, using DOM engine:', e.message); }
    }
    if (!engine) engine = new DOMEngine(opts);
    const api = {
      engine: engine.kind,
      add(t, o) { engine.add(t, o); return api; },
      remove(t) { engine.remove(t); return api; },
      set(p) { engine.set(p); return api; },
      get params() { return engine.P; },
      destroy() { engine.destroy(); },
      _engine: engine,
    };
    return api;
  }

  return {
    version: '1.0.0',
    create,
    recommend,
    presets: PRESETS,
    defaults: DEFAULTS,
    bakeMaps,
    supports: { webgl2: typeof document !== 'undefined' && !!document.createElement('canvas').getContext('webgl2'), svgBackdrop: isChromium },
  };
});
