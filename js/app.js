/* =====================================================================
 *  液态玻璃实验室 · 主程序
 *  渲染管线（每帧）：
 *    1. 场景 → sceneFBO
 *    2. 13-tap 降采样 → 6 级模糊金字塔
 *    3. 底层玻璃（标签栏 / 透镜 / 水滴 / 面板 / 按钮）+ 平面元素 + 图标 → fboA
 *    4. 顶层玻璃（标签栏水滴 / 滑块旋钮 / 开关旋钮）采样 fboA → 屏幕
 * ===================================================================== */
(function () {
  'use strict';
  const LG = window.LG;
  const $ = (s) => document.querySelector(s);
  const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
  const lerp = (a, b, t) => a + (b - a) * t;
  const sstep = (a, b, x) => {
    const t = clamp((x - a) / (b - a), 0, 1);
    return t * t * (3 - 2 * t);
  };
  const hex = (h) => {
    let s = h.slice(1);
    if (s.length === 3) s = s[0] + s[0] + s[1] + s[1] + s[2] + s[2];
    const n = parseInt(s, 16);
    return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
  };

  /* ------------------------------ 弹簧（SwiftUI 式 response / damping） ------------------------------ */
  class Spring {
    constructor(v, response = 0.35, damping = 0.8) {
      this.v = v; this.t = v; this.vel = 0;
      this.tune(response, damping);
    }
    tune(r, d) { this.k = (2 * Math.PI / r) ** 2; this.c = (4 * Math.PI * d) / r; return this; }
    step(dt) {
      const n = Math.max(1, Math.ceil(dt * 240));
      const h = dt / n;
      for (let i = 0; i < n; i++) {
        const a = this.k * (this.t - this.v) - this.c * this.vel;
        this.vel += a * h;
        this.v += this.vel * h;
      }
    }
    snap(v) { this.v = this.t = v; this.vel = 0; }
  }
  class Spring2 {
    constructor(x, y, r, d) { this.x = new Spring(x, r, d); this.y = new Spring(y, r, d); }
    step(dt) { this.x.step(dt); this.y.step(dt); }
    set(x, y) { this.x.t = x; this.y.t = y; }
    snap(x, y) { this.x.snap(x); this.y.snap(y); }
  }
  /* 果冻形变：沿速度方向拉伸，停下时欠阻尼回弹 */
  class Jelly {
    constructor(scale = 1) { this.amt = new Spring(0, 0.3, 0.38); this.ang = 0; this.scale = scale; }
    update(vx, vy, dt) {
      const sp = Math.hypot(vx, vy);
      if (sp > 60) this.ang = Math.atan2(vy, vx);
      this.amt.t = clamp(sp / 2600, 0, 0.3) * this.scale;
      this.amt.step(dt);
    }
    get() {
      let a = this.amt.v, ang = this.ang;
      if (a < 0) { ang += Math.PI / 2; a = -a * 0.8; }
      return { sa: ang, s: Math.min(a, 0.45) };
    }
  }

  /* ------------------------------ 参数与预设 ------------------------------ */
  const DEF = {
    scene: 'article', dark: false, autoScroll: false, edgeFx: true,
    ior: 1.5, thickness: 44, bezel: 30, base: 0, refr: 1.2, profile: 0, lensZoom: 1.0,
    disp: 0.08, dispN: 7,
    frost: 1.5, frostPanel: 8, sat: 1.35, bright: 1.04, tintColor: '#0a84ff', tintA: 0,
    lightMode: 'fixed', lightAngle: -135,
    rimI: 0.85, rimW: 2.2, rimFar: 0.6, glareI: 0.9, glareR: 14, glareConv: 2.2, glareFar: 0.55, fresnel: 0.5,
    shadowA: 0.22, shadowR: 24, shadowY: 8, contact: 1.2,
    mergeK: 40, cornerN: 3.25,
    adapt: 1.0, veil: 0.06,
    lazy: false, debug: 0, renderScale: 1, dprCap: 2,
  };
  const NON_OPTICAL = ['scene', 'dark', 'autoScroll', 'edgeFx', 'lightMode', 'renderScale', 'dprCap', 'debug'];
  const tr = LG.t;
  const PRESETS = {
    regular: { label: tr('常规 Regular', 'Regular'), v: {} },
    clear: { label: tr('清透 Clear', 'Clear'), v: { frost: 0, frostPanel: 4, veil: 0.02, sat: 1.15, disp: 0.1, dispN: 8, refr: 1.3 } },
    thick: { label: tr('厚磨砂', 'Thick frosted'), v: { frost: 12, frostPanel: 24, veil: 0.14, sat: 1.5, thickness: 54, bezel: 36, refr: 1.25, disp: 0.06, shadowA: 0.28 } },
    prism: { label: tr('棱镜色散', 'Prism'), v: { frost: 0, frostPanel: 4, veil: 0.02, disp: 0.3, dispN: 12, refr: 1.6, thickness: 52, bezel: 34, ior: 1.6, glareI: 0.7 } },
    tinted: { label: tr('彩色着色', 'Tinted'), v: { frost: 5, tintColor: '#0a84ff', tintA: 0.3, veil: 0.04 } },
    lazy: { label: tr('普通 AI 毛玻璃', 'Typical "AI glass"'), v: { lazy: true } },
  };
  const P = Object.assign({}, DEF);

  const px = (v) => v + 'px';
  const SCHEMA = [
    { title: tr('预设', 'Presets'), items: [
      { type: 'buttons', cols: 2, buttons: Object.keys(PRESETS).map((k) => ({ label: PRESETS[k].label, action: 'preset:' + k })) },
      { type: 'buttons', cols: 1, buttons: [{ label: tr('重置玻璃位置', 'Reset glass layout'), action: 'resetLayout' }] },
    ] },
    { title: tr('背景内容', 'Background'), items: [
      { type: 'select', key: 'scene', label: tr('场景', 'Scene'), options: [['article', tr('图文页面', 'Article')], ['grid', tr('测试网格', 'Test grid')], ['wallpaper', tr('动态壁纸', 'Wallpaper')], ['photo', tr('在线照片', 'Online photo')], ['upload', tr('本地图片/视频', 'Your image/video')]] },
      { type: 'check', key: 'dark', label: tr('深色内容（测试明暗自适应）', 'Dark content (test adaptivity)') },
      { type: 'check', key: 'autoScroll', label: tr('自动滚动', 'Auto scroll') },
      { type: 'check', key: 'edgeFx', label: tr('滚动边缘渐隐', 'Scroll edge effect') },
      { type: 'buttons', cols: 2, buttons: [{ label: tr('上传图片/视频', 'Upload image/video'), action: 'upload' }, { label: tr('换一张在线照片', 'Next photo'), action: 'nextPhoto' }] },
    ] },
    { title: tr('折射 · Lensing', 'Lensing'), note: tr('玻璃边缘是一段凸起的弧面：越靠近边缘越陡，光线被弯折得越厉害。', 'The rim is a convex bevel: the closer to the edge, the steeper the surface and the stronger the bend.'), items: [
      { type: 'range', key: 'ior', label: tr('折射率 IOR', 'IOR'), min: 1, max: 2.4, step: 0.01, def: 1.5 },
      { type: 'range', key: 'thickness', label: tr('玻璃厚度', 'Thickness'), min: 0, max: 90, step: 1, def: 44, fmt: px },
      { type: 'range', key: 'bezel', label: tr('弧面宽度', 'Bezel width'), min: 4, max: 70, step: 1, def: 30, fmt: px },
      { type: 'range', key: 'base', label: tr('底座厚度', 'Base slab'), min: 0, max: 30, step: 0.5, def: 0, fmt: px },
      { type: 'range', key: 'refr', label: tr('折射倍数', 'Refraction ×'), min: -2, max: 3, step: 0.01, def: 1.2, tip: tr('负值 = 反向（凹透镜式，边缘显示外侧内容）', 'Negative = concave-like, rim shows outside content') },
      { type: 'select', key: 'profile', label: tr('表面曲线', 'Surface'), options: [[0, tr('凸面 Squircle', 'Convex squircle')], [1, tr('凸面圆弧', 'Convex circle')], [2, tr('唇边 Lip', 'Lip')]] },
      { type: 'range', key: 'lensZoom', label: tr('透镜放大', 'Lens zoom'), min: 0.6, max: 2, step: 0.01, def: 1, fmt: (v) => (+v).toFixed(2) + '×' },
    ] },
    { title: tr('色散 · Dispersion', 'Dispersion'), note: tr('把可见光拆成多个波长，每个波长用各自的折射率折射后再合成。', 'Visible light is split into wavelengths; each is refracted with its own IOR and recombined.'), items: [
      { type: 'range', key: 'disp', label: tr('色散强度', 'Dispersion'), min: 0, max: 0.5, step: 0.005, def: 0.08 },
      { type: 'range', key: 'dispN', label: tr('光谱采样', 'Spectral taps'), min: 1, max: 16, step: 1, def: 7, fmt: (v) => (v <= 1 ? tr('关', 'off') : String(v)) },
    ] },
    { title: tr('磨砂与色彩', 'Frost & color'), items: [
      { type: 'range', key: 'frost', label: tr('控件磨砂', 'Control frost'), min: 0, max: 40, step: 0.5, def: 1.5, fmt: px },
      { type: 'range', key: 'frostPanel', label: tr('面板磨砂', 'Panel frost'), min: 0, max: 60, step: 0.5, def: 8, fmt: px },
      { type: 'range', key: 'sat', label: tr('饱和度', 'Saturation'), min: 0, max: 2.5, step: 0.01, def: 1.35 },
      { type: 'range', key: 'bright', label: tr('亮度', 'Brightness'), min: 0.6, max: 1.4, step: 0.01, def: 1.04 },
      { type: 'color', key: 'tintColor', label: tr('着色颜色', 'Tint color') },
      { type: 'range', key: 'tintA', label: tr('着色强度', 'Tint amount'), min: 0, max: 1, step: 0.01, def: 0 },
    ] },
    { title: tr('高光 · Specular', 'Specular'), items: [
      { type: 'select', key: 'lightMode', label: tr('光源', 'Light'), options: [['fixed', tr('固定角度', 'Fixed angle')], ['mouse', tr('跟随鼠标', 'Follow mouse')], ['spin', tr('自动旋转', 'Auto rotate')], ['gyro', tr('陀螺仪（手机）', 'Gyroscope (phone)')]] },
      { type: 'range', key: 'lightAngle', label: tr('光源角度', 'Light angle'), min: -180, max: 180, step: 1, def: -135, fmt: (v) => v + '°' },
      { type: 'range', key: 'rimI', label: tr('边缘亮线', 'Rim light'), min: 0, max: 1, step: 0.01, def: 0.85 },
      { type: 'range', key: 'rimW', label: tr('亮线宽度', 'Rim width'), min: 0.3, max: 6, step: 0.1, def: 2.2, fmt: px },
      { type: 'range', key: 'rimFar', label: tr('背光侧亮线', 'Far-side rim'), min: 0, max: 1.5, step: 0.01, def: 0.6 },
      { type: 'range', key: 'glareI', label: tr('镜面眩光', 'Glare'), min: 0, max: 1.5, step: 0.01, def: 0.9 },
      { type: 'range', key: 'glareR', label: tr('眩光范围', 'Glare range'), min: 1, max: 60, step: 0.5, def: 14, fmt: px },
      { type: 'range', key: 'glareConv', label: tr('眩光集中度', 'Glare focus'), min: 0.3, max: 8, step: 0.1, def: 2.2 },
      { type: 'range', key: 'glareFar', label: tr('背光侧眩光', 'Far-side glare'), min: 0, max: 1.5, step: 0.01, def: 0.55 },
      { type: 'range', key: 'fresnel', label: 'Fresnel', min: 0, max: 1, step: 0.01, def: 0.5 },
    ] },
    { title: tr('阴影', 'Shadow'), items: [
      { type: 'range', key: 'shadowA', label: tr('浓度', 'Opacity'), min: 0, max: 0.7, step: 0.01, def: 0.22 },
      { type: 'range', key: 'shadowR', label: tr('柔和度', 'Softness'), min: 1, max: 80, step: 1, def: 24, fmt: px },
      { type: 'range', key: 'shadowY', label: tr('偏移', 'Offset'), min: -20, max: 40, step: 1, def: 8, fmt: px },
      { type: 'range', key: 'contact', label: tr('接触阴影', 'Contact shade'), min: 0, max: 3, step: 0.01, def: 1.2, tip: tr('玻璃脚下的阴影被折射进弧面，形成边缘内侧的灰色环', 'The shadow under the glass refracted into the rim (grey inner ring)') },
    ] },
    { title: tr('形状与融合', 'Shape & merging'), items: [
      { type: 'range', key: 'mergeK', label: tr('融合距离', 'Merge distance'), min: 0, max: 140, step: 1, def: 40, fmt: px },
      { type: 'range', key: 'cornerN', label: tr('圆角曲率', 'Corner shape'), min: 2, max: 6, step: 0.05, def: 3.25, tip: tr('2 = 普通圆角；≈3.25 逼近 iOS 连续曲率圆角', '2 = circular; ~3.25 ≈ iOS continuous corners') },
    ] },
    { title: tr('明暗自适应', 'Adaptivity'), items: [
      { type: 'range', key: 'adapt', label: tr('自适应强度', 'Adaptivity'), min: 0, max: 1, step: 0.01, def: 1 },
      { type: 'range', key: 'veil', label: tr('薄纱浓度', 'Veil'), min: 0, max: 0.5, step: 0.01, def: 0.06 },
    ] },
    { title: tr('对照与调试', 'Compare & debug'), items: [
      { type: 'check', key: 'lazy', label: tr('对照：普通「AI 毛玻璃」', 'Compare: typical "AI glass" (blur + border)') },
      { type: 'select', key: 'debug', label: tr('调试视图', 'Debug view'), options: [[0, tr('正常渲染', 'Normal')], [1, tr('SDF 距离场', 'SDF field')], [2, tr('表面法线', 'Surface normals')], [3, tr('折射位移场', 'Displacement')], [4, tr('表面高度', 'Height map')]] },
    ] },
    { title: tr('性能', 'Performance'), open: false, items: [
      { type: 'range', key: 'renderScale', label: tr('渲染分辨率', 'Render scale'), min: 0.35, max: 1, step: 0.05, def: 1, fmt: (v) => Math.round(v * 100) + '%' },
      { type: 'select', key: 'dprCap', label: tr('最高像素比', 'Max DPR'), options: [[1, '1x'], [1.5, '1.5x'], [2, '2x'], [3, '3x']] },
    ] },
  ];

  /* ------------------------------ DOM ------------------------------ */
  const stage = $('#stage');
  const canvas = $('#gl');
  const toastEl = $('#toast');
  let toastTimer = 0;
  function toast(msg, ms = 2200) {
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove('show'), ms);
  }
  function fatal(msg) {
    const e = $('#err');
    e.hidden = false;
    e.textContent = msg;
  }

  /* ------------------------------ WebGL ------------------------------ */
  const gl = canvas.getContext('webgl2', {
    antialias: false, alpha: false, depth: false, stencil: false,
    premultipliedAlpha: false, preserveDrawingBuffer: false, powerPreference: 'high-performance',
  });
  if (!gl) {
    fatal(tr('你的浏览器不支持 WebGL2，无法运行本测试页。请使用最新版 Chrome / Edge / Safari / Firefox。', 'WebGL2 is not available in this browser. Please use a recent Chrome / Edge / Safari / Firefox.'));
    return;
  }

  function compile(type, src) {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      const log = gl.getShaderInfoLog(s);
      console.error(log + '\n' + src.split('\n').map((l, i) => i + 1 + ': ' + l).join('\n'));
      throw new Error('着色器编译失败：' + log);
    }
    return s;
  }
  function program(vs, fs) {
    const p = gl.createProgram();
    gl.attachShader(p, compile(gl.VERTEX_SHADER, vs));
    gl.attachShader(p, compile(gl.FRAGMENT_SHADER, fs));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error('程序链接失败：' + gl.getProgramInfoLog(p));
    const map = {};
    const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < n; i++) {
      const info = gl.getActiveUniform(p, i);
      map[info.name.replace(/\[0\]$/, '')] = gl.getUniformLocation(p, info.name);
    }
    const u = new Proxy(map, { get: (t, k) => (k in t ? t[k] : null) });
    return { p, u };
  }

  let progScene, progDown, progGlass;
  try {
    progScene = program(LG.SH.vert, LG.SH.scene);
    progDown = program(LG.SH.vert, LG.SH.down);
    progGlass = program(LG.SH.vert, LG.SH.glass);
  } catch (e) {
    fatal(String(e.message || e));
    console.error(e);
    return;
  }
  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);
  gl.disable(gl.DEPTH_TEST);
  gl.disable(gl.BLEND);

  function texParams() {
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  }
  function makeTex() {
    const t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    texParams();
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([255, 255, 255, 0]));
    return t;
  }
  function uploadTex(t, src) {
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src);
  }
  function makeTarget(w, h) {
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGBA8, w, h);
    texParams();
    const fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    return { tex, fbo, w, h };
  }
  function freeTarget(t) {
    if (!t) return;
    gl.deleteTexture(t.tex);
    gl.deleteFramebuffer(t.fbo);
  }

  const texContent = makeTex();
  const texImg = makeTex();

  /* ------------------------------ 全局状态 ------------------------------ */
  const S = { W: 1, H: 1, px: 1, cw: 1, ch: 1, time: 0, mouse: { x: 0, y: 0 }, lazyHold: false };
  const TG = { scene: null, lv: [], A: null };
  const scene = { mode: 0, cTexW: 1, cTexH: 1, cScale: 1, contentH: 1, page: [1, 1, 1], img: null, imgW: 1, imgH: 1, isVideo: false };
  const scroll = { y: 0, v: 0, drag: null, max: 0, toTop: false, autoDir: 1 };

  /* ------------------------------ 布局 ------------------------------ */
  const L = {};
  const LENS_SHAPES = [
    { w: 250, h: 160, r: 48 }, { w: 180, h: 180, r: 90 }, { w: 330, h: 100, r: 50 }, { w: 220, h: 220, r: 66 },
  ];
  const TABS = [
    { icon: 'home', label: tr('首页', 'Home') }, { icon: 'music', label: tr('音乐', 'Music') }, { icon: 'heart', label: tr('收藏', 'Saved') }, { icon: 'user', label: tr('我的', 'Profile') },
  ];
  const MENU = [
    { icon: 'copy', label: tr('复制链接', 'Copy link') }, { icon: 'share', label: tr('分享', 'Share') }, { icon: 'heart', label: tr('添加到收藏', 'Add to favorites') }, { icon: 'trash', label: tr('删除', 'Delete'), red: true },
  ];
  const ACCENT = '#0a84ff';

  function layout() {
    const W = S.W, H = S.H;
    L.narrow = W < 560;
    L.top = 14;
    L.back = { x: 16 + 22, y: L.top + 22, d: 44 };
    L.capRight = W - 16;
    L.capTop = L.top;
    L.capRest = { w: 96, h: 44, r: 22 };
    L.capOpen = { w: Math.min(236, W - 32), h: 20 + MENU.length * 48, r: 30 };
    const sd = 62, gap = 12;
    const barW = Math.max(200, Math.min(372, W - 32 - sd - gap));
    const gx = (W - (barW + gap + sd)) / 2;
    L.bar = { x: gx, y: H - 22 - 62, w: barW, h: 62 };
    L.bar.cy = L.bar.y + 31;
    L.search = { x: gx + barW + gap + sd / 2, y: L.bar.cy, d: sd };
    L.tabW = (barW - 8) / TABS.length;
    L.panelW = Math.min(300, W - 32);
    L.panelH = 156;
    L.lensScale = L.narrow ? 0.78 : 1;
    L.blobD = L.narrow ? 86 : 104;
  }
  function tabCenter(i) { return L.bar.x + 4 + (i + 0.5) * L.tabW; }

  /* ------------------------------ 组件状态 ------------------------------ */
  const st = {
    lens: { pos: new Spring2(0, 0, 0.2, 0.7), w: new Spring(250, 0.42, 0.68), h: new Spring(160, 0.42, 0.68), r: new Spring(48, 0.42, 0.68), press: new Spring(0, 0.3, 0.55), jelly: new Jelly(1), shape: 0, moved: false, lastTap: 0 },
    blobs: [0, 1].map(() => ({ pos: new Spring2(0, 0, 0.2, 0.7), press: new Spring(0, 0.3, 0.55), jelly: new Jelly(1.2), moved: false })),
    panel: { pos: new Spring2(0, 0, 0.22, 0.85), moved: false },
    slider: { v: 0.62, kx: new Spring(0.62, 0.14, 0.82), act: new Spring(0, 0.32, 0.62), jelly: new Jelly(0.9) },
    toggle: { on: true, knob: new Spring(1, 0.36, 0.66), act: new Spring(0, 0.3, 0.62), onC: new Spring(1, 0.25, 1), jelly: new Jelly(0.9), sx: 0, k0: 0 },
    tab: { sel: 0, x: new Spring(0, 0.3, 0.72), lift: new Spring(0, 0.32, 0.6), jelly: new Jelly(1.1), pressing: false },
    search: { press: new Spring(0, 0.3, 0.5) },
    back: { press: new Spring(0, 0.3, 0.5) },
    cap: { press: new Spring(0, 0.3, 0.5), morph: new Spring(0, 0.46, 0.76), open: false, hover: -1 },
    glowA: { x: 0, y: 0, a: new Spring(0, 0.22, 1) },
    glowB: { x: 0, y: 0, a: new Spring(0, 0.22, 1) },
  };

  function placeWidgets(force) {
    const W = S.W, H = S.H, n = L.narrow;
    const lens = st.lens, ls = LENS_SHAPES[lens.shape];
    const sc = L.lensScale;
    if (force || !lens.moved) lens.pos.snap(n ? W * 0.5 : W * 0.3, n ? H * 0.3 : H * 0.36);
    lens.w.snap(ls.w * sc); lens.h.snap(ls.h * sc); lens.r.snap(ls.r * sc);
    const bp = n ? [[W * 0.3, H * 0.52], [W * 0.7, H * 0.55]] : [[W * 0.62, H * 0.27], [W * 0.75, H * 0.37]];
    st.blobs.forEach((b, i) => { if (force || !b.moved) b.pos.snap(bp[i][0], bp[i][1]); });
    if (force || !st.panel.moved) {
      let py = n ? H * 0.72 : H * 0.6;
      py = Math.min(py, L.bar.y - 20 - L.panelH / 2);
      st.panel.pos.snap(n ? W * 0.5 : W * 0.66, py);
    }
    // 防止窗口缩小后组件跑出屏幕
    const keep = (sp, hw, hh) => sp.snap(clamp(sp.x.t, hw, W - hw), clamp(sp.y.t, hh, H - hh));
    keep(lens.pos, 40, 40);
    st.blobs.forEach((b) => keep(b.pos, 30, 30));
    keep(st.panel.pos, L.panelW / 2, L.panelH / 2);
    st.tab.x.snap(tabCenter(st.tab.sel));
  }

  // 面板内部几何（相对屏幕）
  function panelGeo() {
    const cx = st.panel.pos.x.v, cy = st.panel.pos.y.v;
    const x = cx - L.panelW / 2, y = cy - L.panelH / 2;
    const w = L.panelW;
    const track = { x: x + 20, y: y + 92, w: w - 40 };
    const tog = { x: x + w - 20 - 64, y: y + 128, w: 64, h: 28 };
    return { x, y, w, h: L.panelH, cx, cy, track, tog };
  }
  const KNOB = { w: 38, h: 24 };

  /* ------------------------------ 精灵（玻璃上的图标/文字） ------------------------------ */
  const SPR = [];
  for (let i = 0; i < 6; i++) SPR.push({ tex: makeTex(), cv: document.createElement('canvas'), x: 0, y: 0, w: 1, h: 1, alpha: 1, scale: 1, pvx: 0, pvy: 0, dirty: true });
  function paintSprite(sp, w, h, fn) {
    const k = S.px;
    sp.cv.width = Math.max(1, Math.ceil(w * k));
    sp.cv.height = Math.max(1, Math.ceil(h * k));
    const c = sp.cv.getContext('2d');
    c.setTransform(sp.cv.width / w, 0, 0, sp.cv.height / h, 0, 0);
    c.clearRect(0, 0, w, h);
    fn(c);
    uploadTex(sp.tex, sp.cv);
    sp.w = w; sp.h = h; sp.dirty = false;
  }
  const F = () => LG.FONT;
  function paintTab() {
    paintSprite(SPR[0], L.bar.w, L.bar.h, (c) => {
      TABS.forEach((t, i) => {
        const cx = 4 + (i + 0.5) * L.tabW;
        const col = i === st.tab.sel ? ACCENT : '#ffffff';
        LG.Content.icon(c, t.icon, cx, 23, 23, col, { filled: true, lw: 1.8 });
        c.font = `600 10px ${F()}`;
        c.textAlign = 'center';
        c.fillStyle = col;
        c.fillText(t.label, cx, 49);
      });
    });
  }
  function paintIcon(sp, name, size, d, lw) {
    paintSprite(sp, d, d, (c) => LG.Content.icon(c, name, d / 2, d / 2, size, '#ffffff', { lw: lw || 2.2 }));
  }
  function paintCap() {
    paintSprite(SPR[3], L.capRest.w, L.capRest.h, (c) => {
      LG.Content.icon(c, 'plus', 27, 22, 22, '#ffffff', { lw: 2.2 });
      LG.Content.icon(c, 'more', 69, 22, 22, '#ffffff', {});
    });
  }
  function paintMenu() {
    const o = L.capOpen;
    paintSprite(SPR[4], o.w, o.h, (c) => {
      MENU.forEach((m, i) => {
        const y = 10 + i * 48;
        if (i === st.cap.hover) {
          c.fillStyle = 'rgba(255,255,255,0.16)';
          LG.Content.rrPath(c, 8, y + 2, o.w - 16, 44, 16);
          c.fill();
        }
        const col = m.red ? '#ff453a' : '#ffffff';
        LG.Content.icon(c, m.icon, 30, y + 24, 19, col, { lw: 2 });
        c.font = `500 16px ${F()}`;
        c.textAlign = 'left';
        c.fillStyle = col;
        c.fillText(m.label, 54, y + 30);
        if (i < MENU.length - 1) {
          c.fillStyle = 'rgba(255,255,255,0.18)';
          c.fillRect(54, y + 47.5, o.w - 70, 1);
        }
      });
    });
  }
  function paintPanel() {
    const w = L.panelW, h = L.panelH;
    paintSprite(SPR[5], w, h, (c) => {
      c.font = `600 13px ${F()}`;
      c.textAlign = 'left';
      c.fillStyle = 'rgba(255,255,255,0.55)';
      c.fillText(tr('控制', 'Controls'), 20, 30);
      LG.Content.icon(c, 'sun', 29, 62, 17, '#ffffff', { filled: true, lw: 2 });
      c.font = `500 15px ${F()}`;
      c.fillStyle = '#ffffff';
      c.fillText(tr('亮度', 'Brightness'), 44, 67);
      c.textAlign = 'right';
      c.fillStyle = 'rgba(255,255,255,0.55)';
      c.font = `500 14px ${F()}`;
      c.fillText(Math.round(st.slider.v * 100) + '%', w - 20, 67);
      c.textAlign = 'left';
      LG.Content.icon(c, 'drop', 29, 128, 17, '#ffffff', { filled: true, lw: 2 });
      c.font = `500 15px ${F()}`;
      c.fillStyle = '#ffffff';
      c.fillText(tr('液态开关', 'Liquid mode'), 44, 133);
    });
  }
  function paintAllSprites() {
    paintTab();
    paintIcon(SPR[1], 'search', 23, 62, 2.4);
    paintIcon(SPR[2], 'back', 22, 44, 2.6);
    paintCap();
    paintMenu();
    paintPanel();
  }

  /* ------------------------------ 尺寸与渲染目标 ------------------------------ */
  let frameNo = 0;
  function allocTargets() {
    freeTarget(TG.scene); freeTarget(TG.A);
    TG.lv.forEach(freeTarget);
    TG.scene = makeTarget(S.cw, S.ch);
    TG.A = makeTarget(S.cw, S.ch);
    TG.lv = [null];
    let w = S.cw, h = S.ch;
    for (let k = 1; k <= 6; k++) {
      w = Math.max(1, Math.ceil(w / 2));
      h = Math.max(1, Math.ceil(h / 2));
      TG.lv.push(makeTarget(w, h));
    }
    frameNo = 0;
  }

  function resize() {
    const r = stage.getBoundingClientRect();
    S.W = Math.max(1, r.width);
    S.H = Math.max(1, r.height);
    const dpr = Math.min(window.devicePixelRatio || 1, P.dprCap);
    S.cw = Math.max(1, Math.round(S.W * dpr * P.renderScale));
    S.ch = Math.max(1, Math.round(S.H * dpr * P.renderScale));
    S.px = S.cw / S.W;
    canvas.width = S.cw;
    canvas.height = S.ch;
    $('#res').textContent = `${S.cw}×${S.ch}`;
    allocTargets();
    layout();
    placeWidgets(false);
    paintAllSprites();
    scheduleContent();
  }

  /* ------------------------------ 场景内容 ------------------------------ */
  let contentTimer = 0;
  function scheduleContent(now) {
    clearTimeout(contentTimer);
    contentTimer = setTimeout(buildContent, now ? 0 : 120);
  }
  function buildContent() {
    if (S.W < 50 || S.H < 50) return;
    if (P.scene === 'article' || P.scene === 'grid') {
      const res = P.scene === 'article' ? LG.Content.article(S.W, P.dark) : LG.Content.grid(S.W, S.H, P.dark);
      const maxTex = gl.getParameter(gl.MAX_TEXTURE_SIZE);
      let sc = Math.min(S.px, (maxTex - 4) / res.height, (maxTex - 4) / S.W, Math.sqrt(32e6 / (S.W * res.height)));
      const cv = document.createElement('canvas');
      cv.width = Math.ceil(S.W * sc);
      cv.height = Math.ceil(res.height * sc);
      const ctx = cv.getContext('2d');
      ctx.setTransform(sc, 0, 0, sc, 0, 0);
      res.draw(ctx);
      uploadTex(texContent, cv);
      buildLum(cv, S.W, res.height);
      scene.cTexW = cv.width;
      scene.cTexH = cv.height;
      scene.cScale = sc;
      scene.contentH = res.height;
      scene.page = hex(res.page);
      cv.width = cv.height = 1;
    }
    updateScrollMax();
  }
  function updateScrollMax() {
    if (scene.mode === 0) scroll.max = Math.max(0, scene.contentH - S.H);
    else if (scene.mode === 2) {
      const s = Math.max(S.W / scene.imgW, S.H / scene.imgH);
      scroll.max = Math.max(0, scene.imgH * s - S.H);
    } else scroll.max = 0;
    scroll.y = clamp(scroll.y, 0, scroll.max);
  }
  const PHOTO_SEEDS = ['liquidglass', 'aurora7', 'coast22', 'city88', 'bloom3', 'alps5', 'reef9', 'tokyo4'];
  let photoIdx = 0;
  function loadPhoto() {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      if (P.scene !== 'photo') return;
      setImage(img, img.naturalWidth, img.naturalHeight, false);
      toast(tr('在线照片已加载', 'Photo loaded'));
    };
    img.onerror = () => toast(tr('在线照片加载失败（可能无网络）——请改用「上传图片/视频」', 'Could not load the online photo — try uploading your own image'), 3500);
    img.src = `https://picsum.photos/seed/${PHOTO_SEEDS[photoIdx % PHOTO_SEEDS.length]}/2400/1600`;
    toast(tr('正在加载在线照片…', 'Loading photo…'), 8000);
  }
  function setImage(src, w, h, isVideo) {
    if (scene.isVideo && scene.img && scene.img !== src) { try { scene.img.pause(); } catch (e) { /* noop */ } }
    scene.img = src; scene.imgW = w; scene.imgH = h; scene.isVideo = isVideo;
    uploadTex(texImg, src);
    try { buildLum(src, w, h); } catch (e) { lumMap.data = null; }
    scene.mode = 2;
    scroll.y = 0;
    updateScrollMax();
  }
  function loadFile(file) {
    if (!file) return;
    const url = URL.createObjectURL(file);
    P.scene = 'upload';
    panelApi && panelApi.refresh();
    if (file.type.startsWith('video/')) {
      const v = document.createElement('video');
      v.muted = true; v.loop = true; v.playsInline = true; v.autoplay = true;
      v.src = url;
      v.addEventListener('loadeddata', () => { setImage(v, v.videoWidth, v.videoHeight, true); v.play(); toast(tr('视频已加载', 'Video loaded')); }, { once: true });
    } else {
      const img = new Image();
      img.onload = () => { setImage(img, img.naturalWidth, img.naturalHeight, false); toast(tr('图片已加载', 'Image loaded')); };
      img.src = url;
    }
  }
  function setScene() {
    if (P.scene === 'article' || P.scene === 'grid') { scene.mode = 0; scroll.y = 0; scheduleContent(true); }
    else if (P.scene === 'wallpaper') { scene.mode = 1; updateScrollMax(); }
    else if (P.scene === 'photo') { scene.mode = 2; loadPhoto(); }
    else if (P.scene === 'upload') {
      if (scene.img && scene.mode === 2) return;
      $('#file').click();
    }
  }

  /* ------------------------------ 光谱权重 ------------------------------ */
  const dw = new Float32Array(16 * 4);
  let dwN = 1;
  function computeSpectral() {
    const N = P.disp <= 0.0001 ? 1 : Math.round(P.dispN);
    dw.fill(0);
    if (N <= 1) { dw.set([1, 1, 1, 0.5], 0); dwN = 1; return; }
    const g = (x, m, s) => Math.exp(-0.5 * ((x - m) / s) ** 2);
    let sr = 0, sg = 0, sb = 0;
    const arr = [];
    for (let i = 0; i < N; i++) {
      const t = i / (N - 1);                            // 0 = 红（长波） → 1 = 紫（短波）
      const r = g(t, 0.1, 0.2) + 0.16 * g(t, 1.0, 0.12);
      const gg = g(t, 0.5, 0.18);
      const b = g(t, 0.88, 0.18);
      arr.push([r, gg, b, t]);
      sr += r; sg += gg; sb += b;
    }
    arr.forEach((a, i) => dw.set([a[0] / sr, a[1] / sg, a[2] / sb, a[3]], i * 4));
    dwN = N;
  }

  /* ------------------------------ 明暗自适应 ------------------------------
   * 不做 GPU 回读（会让管线停顿）：在 CPU 端保留一张 1/8 分辨率的亮度图，
   * 按玻璃覆盖区域采样，带迟滞地切换明/暗外观。 */
  const adapt = {};
  function adaptOf(id) {
    return adapt[id] || (adapt[id] = { sp: new Spring(1, 0.5, 1), light: true, seen: false });
  }
  const lumMap = { w: 0, h: 0, data: null };
  const lumCv = document.createElement('canvas');
  function buildLum(src, sw, sh) {
    const tw = Math.max(1, Math.min(512, Math.round(sw / 8))), th = Math.max(1, Math.min(2048, Math.round(sh / 8)));
    lumCv.width = tw;
    lumCv.height = th;
    const x = lumCv.getContext('2d', { willReadFrequently: true });
    x.drawImage(src, 0, 0, tw, th);
    const d = x.getImageData(0, 0, tw, th).data;
    if (!lumMap.data || lumMap.data.length !== tw * th) lumMap.data = new Float32Array(tw * th);
    for (let i = 0, j = 0; i < tw * th; i++, j += 4) lumMap.data[i] = (0.2126 * d[j] + 0.7152 * d[j + 1] + 0.0722 * d[j + 2]) / 255;
    lumMap.w = tw;
    lumMap.h = th;
  }
  function lumMapAt(u, v) {
    if (!lumMap.data || u < 0 || v < 0 || u > 1 || v > 1) return null;
    return lumMap.data[Math.min(lumMap.h - 1, (v * lumMap.h) | 0) * lumMap.w + Math.min(lumMap.w - 1, (u * lumMap.w) | 0)];
  }
  const WALL = [[1, 0.33, 0.45], [0.3, 0.4, 1], [0.1, 0.86, 0.78], [1, 0.72, 0.2], [0.62, 0.26, 0.98]];
  function sceneLum(x, y) {                       // x, y 为 CSS 像素
    if (scene.mode === 0) {
      const v = lumMapAt(x / S.W, (y + scroll.y) / scene.contentH);
      return v === null ? luminance(scene.page) : v;
    }
    if (scene.mode === 2) {
      const s = Math.max(S.W / scene.imgW, S.H / scene.imgH);
      const dW = scene.imgW * s, dH = scene.imgH * s;
      const ox = (S.W - dW) / 2, oy = scroll.max > 0 ? -scroll.y : (S.H - dH) / 2;
      const v = lumMapAt((x - ox) / dW, (y - oy) / dH);
      return v === null ? 0.5 : v;
    }
    // 动态壁纸：在 CPU 上复现着色器里的色团混合
    const t = S.time * 0.08, ux = x / S.H, uy = y / S.H, asp = S.W / S.H;
    let r = 0, g = 0, b = 0, ws = 0;
    for (let i = 0; i < 5; i++) {
      const cx = asp * (0.5 + 0.38 * Math.sin(t * (0.7 + 0.13 * i) + i * 1.9)), cy = 0.5 + 0.36 * Math.cos(t * (0.9 + 0.11 * i) + i * 2.7);
      const d2 = (ux - cx) ** 2 + (uy - cy) ** 2, w = Math.exp(-d2 * 5) + 0.002;
      r += WALL[i][0] * w; g += WALL[i][1] * w; b += WALL[i][2] * w; ws += w;
    }
    return luminance([r / ws, g / ws, b / ws]);
  }
  const luminance = (c) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  function updateAdapt(shapes) {
    if (scene.mode === 2 && scene.isVideo && scene.img && scene.img.readyState >= 2) buildLum(scene.img, scene.imgW, scene.imgH);
    for (const s of shapes) {
      const a = adaptOf(s.id);
      let sum = 0, n = 0;
      for (let iy = -2; iy <= 2; iy++)
        for (let ix = -2; ix <= 2; ix++) {
          sum += sceneLum(s.x + (ix / 2.5) * (s.w / 2), s.y + (iy / 2.5) * (s.h / 2));
          n++;
        }
      const lum = sum / n;
      if (lum > 0.6) a.light = true;
      else if (lum < 0.42) a.light = false;
      a.sp.t = a.light ? 1 : 0;
      if (!a.seen) { a.sp.snap(a.sp.t); a.seen = true; }
    }
  }

  /* ------------------------------ 每帧组装形状 ------------------------------ */
  function buildShapes() {
    const base = [], top = [];
    const tint = P.tintA > 0 ? [...hex(P.tintColor), P.tintA] : [1, 1, 1, 0];
    const ad = (id) => adaptOf(id).sp.v;

    // 组 1：可融合的透镜 + 两颗水滴
    const ln = st.lens, lsc = 1 + 0.05 * ln.press.v, lj = ln.jelly.get();
    base.push({ id: 'lens', g: 1, x: ln.pos.x.v, y: ln.pos.y.v, w: Math.max(10, ln.w.v * lsc), h: Math.max(10, ln.h.v * lsc), r: Math.max(2, ln.r.v * lsc), sa: lj.sa, s: lj.s, zoom: P.lensZoom, tint, adapt: ad('lens') });
    st.blobs.forEach((b, i) => {
      const s = (1 + 0.1 * b.press.v) * L.blobD, j = b.jelly.get();
      base.push({ id: 'blob' + i, g: 1, x: b.pos.x.v, y: b.pos.y.v, w: s, h: s, r: s / 2, sa: j.sa, s: j.s, tint, adapt: ad('blob' + i) });
    });
    // 标签栏、搜索、返回
    base.push({ id: 'bar', g: 2, x: L.bar.x + L.bar.w / 2, y: L.bar.cy, w: L.bar.w, h: L.bar.h, r: 31, tint, adapt: ad('bar') });
    const ss = 1 + 0.14 * st.search.press.v;
    base.push({ id: 'search', g: 3, x: L.search.x, y: L.search.y, w: 62 * ss, h: 62 * ss, r: 31 * ss, tint, adapt: ad('search') });
    const bs = 1 + 0.16 * st.back.press.v;
    base.push({ id: 'back', g: 4, x: L.back.x, y: L.back.y, w: 44 * bs, h: 44 * bs, r: 22 * bs, tint, adapt: ad('back') });
    // 胶囊按钮 ↔ 菜单（形状连续变形）
    const m = st.cap.morph.v, cps = 1 + 0.1 * st.cap.press.v * (1 - clamp(m, 0, 1));
    const cw = Math.max(20, lerp(L.capRest.w, L.capOpen.w, m)), ch = Math.max(20, lerp(L.capRest.h, L.capOpen.h, m));
    base.push({ id: 'cap', g: 5, x: L.capRight - cw / 2, y: L.capTop + ch / 2, w: cw * cps, h: ch * cps, r: lerp(22, 30, clamp(m, 0, 1)) * cps, frost: lerp(P.frost, P.frostPanel, clamp(m, 0, 1)), veil: lerp(1, 1.6, clamp(m, 0, 1)), tint, adapt: ad('cap') });
    // 控制面板
    const pg = panelGeo();
    base.push({ id: 'panel', g: 6, x: pg.cx, y: pg.cy, w: pg.w, h: pg.h, r: 34, frost: P.frostPanel, veil: 1.6, tint, adapt: ad('panel') });

    // ---- 顶层 ----
    const tb = st.tab, lift = tb.lift.v;
    if (lift > 0.004) {
      const pw = L.tabW - 2, ph = L.bar.h - 8, dw2 = L.tabW + 18, dh = L.bar.h + 16;
      const w = lerp(pw, dw2, lift), h = lerp(ph, dh, lift), j = tb.jelly.get();
      top.push({ id: 'drop', g: 1, x: tb.x.v, y: L.bar.cy, w, h, r: h / 2, sa: j.sa, s: j.s, op: sstep(0, 0.3, lift), frost: 0, zoom: 1 + 0.12 * clamp(lift, 0, 1.2), veil: 0.15, sh: 0.6, adapt: ad('bar') });
    }
    const sl = st.slider, sa = sl.act.v, sj = sl.jelly.get();
    const kx = pg.track.x + KNOB.w / 2 + sl.kx.v * (pg.track.w - KNOB.w);
    const ks = 1 + 0.55 * sa;
    top.push({ id: 'sknob', g: 2, x: kx, y: pg.track.y, w: KNOB.w * ks, h: KNOB.h * ks, r: KNOB.h * ks / 2, sa: sj.sa, s: sj.s, white: clamp(1 - sa * 1.6, 0, 1), frost: 0, zoom: 1 + 0.25 * clamp(sa, 0, 1), veil: 0, sh: 0.9, adapt: ad('panel') });
    const tg = st.toggle, ta = tg.act.v, tj = tg.jelly.get();
    const tkx = pg.tog.x + 2 + KNOB.w / 2 + tg.knob.v * (pg.tog.w - 4 - KNOB.w);
    const tw = KNOB.w * (1 + 0.42 * ta), th = KNOB.h * (1 + 0.38 * ta);
    top.push({ id: 'tknob', g: 3, x: tkx, y: pg.tog.y, w: tw, h: th, r: th / 2, sa: tj.sa, s: tj.s, white: clamp(1 - ta * 1.6, 0, 1), frost: 0, zoom: 1 + 0.15 * clamp(ta, 0, 1), veil: 0, sh: 0.9, adapt: ad('panel') });
    return { base, top, pg, kx };
  }

  /* ------------------------------ 上传形状 uniform ------------------------------ */
  const MAXS = 10;
  const U = { g0: new Float32Array(MAXS * 4), g1: new Float32Array(MAXS * 4), g2: new Float32Array(MAXS * 4), m0: new Float32Array(MAXS * 4), m1: new Float32Array(MAXS * 4), m2: new Float32Array(MAXS * 4) };
  function uploadShapes(u, arr) {
    const k = S.px, n = Math.min(arr.length, MAXS);
    for (let i = 0; i < n; i++) {
      const s = arr[i];
      const hw = (s.w / 2) * k, hh = (s.h / 2) * k;
      const minHalf = Math.min(hw, hh);
      const r = Math.min(s.r * k, minHalf);
      // iOS 连续曲率圆角：R = 1.528r 的超椭圆角；胶囊形退化为半圆
      let R = r * 1.528, cn = P.cornerN;
      if (R > minHalf) {
        const t = clamp((R - minHalf) / (minHalf * 0.528 + 1e-6), 0, 1);
        cn = lerp(P.cornerN, 2, t);
        R = minHalf;
      }
      U.g0.set([s.x * k, s.y * k, hw, hh], i * 4);
      U.g1.set([R, cn, s.sa || 0, s.s || 0], i * 4);
      U.g2.set([s.g, s.op === undefined ? 1 : s.op, s.sh === undefined ? 1 : s.sh, s.refr === undefined ? 1 : s.refr], i * 4);
      U.m0.set(s.tint || [1, 1, 1, 0], i * 4);
      U.m1.set([(s.frost === undefined ? P.frost : s.frost) * k, s.white || 0, s.adapt === undefined ? 0.5 : s.adapt, s.zoom || 1], i * 4);
      U.m2.set([s.veil === undefined ? 1 : s.veil, s.rim === undefined ? 1 : s.rim, (s.bezel || 0) * k, s.thick === undefined ? 1 : s.thick], i * 4);
    }
    gl.uniform1i(u.u_n, n);
    gl.uniform4fv(u.u_g0, U.g0); gl.uniform4fv(u.u_g1, U.g1); gl.uniform4fv(u.u_g2, U.g2);
    gl.uniform4fv(u.u_m0, U.m0); gl.uniform4fv(u.u_m1, U.m1); gl.uniform4fv(u.u_m2, U.m2);
  }

  /* ------------------------------ 光源方向 ------------------------------ */
  const gyro = { on: false, gamma: 0, beta: 45 };
  let spinAngle = -135;
  function lightDir(dt) {
    let a = (P.lightAngle * Math.PI) / 180;
    if (P.lightMode === 'mouse') {
      const dx = S.mouse.x - S.W / 2, dy = S.mouse.y - S.H / 2;
      if (Math.hypot(dx, dy) > 4) a = Math.atan2(dy, dx);
    } else if (P.lightMode === 'spin') {
      spinAngle += dt * 50;
      a = (spinAngle * Math.PI) / 180;
    } else if (P.lightMode === 'gyro' && gyro.on) {
      const lx = -gyro.gamma / 35 - 0.45, ly = -(gyro.beta - 45) / 35 - 0.55;
      a = Math.atan2(ly, lx);
    }
    return [Math.cos(a), Math.sin(a)];
  }
  function requestGyro() {
    const D = window.DeviceOrientationEvent;
    const attach = () => {
      window.addEventListener('deviceorientation', (e) => {
        if (e.gamma == null) return;
        gyro.on = true; gyro.gamma = e.gamma; gyro.beta = e.beta;
      });
      toast(tr('已启用陀螺仪：倾斜手机观察高光移动', 'Gyroscope on — tilt your phone to move the highlights'));
    };
    if (!D) return toast(tr('当前设备不支持陀螺仪', 'No gyroscope on this device'));
    if (typeof D.requestPermission === 'function') D.requestPermission().then((r) => (r === 'granted' ? attach() : toast(tr('陀螺仪权限被拒绝', 'Gyroscope permission denied')))).catch(() => toast(tr('陀螺仪权限请求失败', 'Gyroscope permission failed')));
    else attach();
  }

  /* ------------------------------ 交互 ------------------------------ */
  let ptr = null;
  function local(e) {
    const r = canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }
  const inRect = (p, x, y, w, h, pad = 0) => p.x >= x - pad && p.x <= x + w + pad && p.y >= y - pad && p.y <= y + h + pad;
  function inRR(p, cx, cy, w, h, r, pad = 0) {
    const qx = Math.abs(p.x - cx) - w / 2 + r, qy = Math.abs(p.y - cy) - h / 2 + r;
    const d = Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r;
    return d <= pad;
  }
  function hitTest(p) {
    const pg = panelGeo();
    if (st.cap.open) {
      const o = L.capOpen;
      const x = L.capRight - o.w, y = L.capTop;
      if (inRect(p, x, y, o.w, o.h)) {
        const i = Math.floor((p.y - y - 10) / 48);
        return { type: 'menu', item: i >= 0 && i < MENU.length ? i : -1 };
      }
      return { type: 'menuClose' };
    }
    if (inRect(p, pg.tog.x, pg.tog.y - pg.tog.h / 2, pg.tog.w, pg.tog.h, 10)) return { type: 'toggle' };
    if (inRect(p, pg.track.x, pg.track.y - 16, pg.track.w, 32, 6)) return { type: 'slider' };
    if (inRR(p, L.search.x, L.search.y, 62, 62, 31, 2)) return { type: 'search' };
    if (inRect(p, L.bar.x, L.bar.y, L.bar.w, L.bar.h, 4)) return { type: 'tab' };
    if (inRR(p, L.back.x, L.back.y, 44, 44, 22, 4)) return { type: 'back' };
    if (inRect(p, L.capRight - L.capRest.w, L.capTop, L.capRest.w, L.capRest.h, 4)) return { type: 'cap' };
    for (let i = st.blobs.length - 1; i >= 0; i--) {
      const b = st.blobs[i];
      if (Math.hypot(p.x - b.pos.x.v, p.y - b.pos.y.v) <= L.blobD / 2 + 4) return { type: 'drag', obj: b };
    }
    const ln = st.lens;
    if (inRR(p, ln.pos.x.v, ln.pos.y.v, ln.w.v, ln.h.v, Math.min(ln.r.v, ln.w.v / 2, ln.h.v / 2), 4)) return { type: 'drag', obj: ln, isLens: true };
    if (inRR(p, pg.cx, pg.cy, pg.w, pg.h, 34)) return { type: 'panel' };
    return { type: 'scroll' };
  }
  function sliderValueAt(x) {
    const pg = panelGeo();
    return clamp((x - pg.track.x - KNOB.w / 2) / (pg.track.w - KNOB.w), 0, 1);
  }
  function dropClamp(x) {
    return clamp(x, L.bar.x + 4 + L.tabW / 2 - 8, L.bar.x + L.bar.w - 4 - L.tabW / 2 + 8);
  }
  function setGlow(g, p, on) {
    g.x = p.x; g.y = p.y;
    if (on !== undefined) g.a.t = on ? 1 : 0;
  }

  canvas.addEventListener('pointerdown', (e) => {
    if (ptr) return;
    const p = local(e);
    try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* 合成事件 */ }
    const hit = hitTest(p);
    ptr = { id: e.pointerId, hit, start: p, last: p, t0: performance.now(), moved: false, samples: [{ x: p.x, y: p.y, t: performance.now() }] };
    switch (hit.type) {
      case 'toggle': st.toggle.act.t = 1; st.toggle.sx = p.x; st.toggle.k0 = st.toggle.knob.t; setGlow(st.glowB, p, true); break;
      case 'slider': st.slider.act.t = 1; st.slider.v = sliderValueAt(p.x); st.slider.kx.t = st.slider.v; SPR[5].dirty = true; setGlow(st.glowB, p, true); break;
      case 'tab': st.tab.pressing = true; st.tab.lift.t = 1; st.tab.x.t = dropClamp(p.x); setGlow(st.glowB, p, true); break;
      case 'search': st.search.press.t = 1; setGlow(st.glowA, p, true); break;
      case 'back': st.back.press.t = 1; setGlow(st.glowA, p, true); break;
      case 'cap': st.cap.press.t = 1; setGlow(st.glowA, p, true); break;
      case 'drag': {
        const o = hit.obj;
        o.press.t = 1;
        o.dragging = true;
        o.moved = true;
        hit.gx = p.x - o.pos.x.v; hit.gy = p.y - o.pos.y.v;
        setGlow(st.glowA, p, true);
        break;
      }
      case 'panel': hit.gx = p.x - st.panel.pos.x.v; hit.gy = p.y - st.panel.pos.y.v; st.panel.moved = true; break;
      case 'menu': st.cap.hover = hit.item; SPR[4].dirty = true; break;
      case 'scroll': scroll.drag = { y0: scroll.y, p0: p.y }; scroll.v = 0; scroll.toTop = false; break;
    }
  });

  canvas.addEventListener('pointermove', (e) => {
    const p = local(e);
    S.mouse = p;
    if (!ptr || e.pointerId !== ptr.id) {
      const h = hitTest(p).type;
      canvas.style.cursor = h === 'drag' || h === 'panel' ? 'grab' : h === 'scroll' ? 'default' : 'pointer';
      return;
    }
    const now = performance.now();
    ptr.samples.push({ x: p.x, y: p.y, t: now });
    while (ptr.samples.length > 2 && now - ptr.samples[0].t > 100) ptr.samples.shift();
    if (Math.hypot(p.x - ptr.start.x, p.y - ptr.start.y) > 6) ptr.moved = true;
    ptr.last = p;
    const hit = ptr.hit;
    switch (hit.type) {
      case 'toggle':
        if (ptr.moved) {
          const pg = panelGeo();
          st.toggle.knob.t = clamp(st.toggle.k0 + (p.x - st.toggle.sx) / (pg.tog.w - 4 - KNOB.w), 0, 1);
        }
        setGlow(st.glowB, p);
        break;
      case 'slider': st.slider.v = sliderValueAt(p.x); st.slider.kx.t = st.slider.v; SPR[5].dirty = true; setGlow(st.glowB, p); break;
      case 'tab': st.tab.x.t = dropClamp(p.x); setGlow(st.glowB, p); break;
      case 'drag': hit.obj.pos.set(p.x - hit.gx, p.y - hit.gy); setGlow(st.glowA, p); break;
      case 'panel': st.panel.pos.set(clamp(p.x - hit.gx, L.panelW / 2, S.W - L.panelW / 2), clamp(p.y - hit.gy, L.panelH / 2, S.H - L.panelH / 2)); break;
      case 'search': case 'back': case 'cap': setGlow(st.glowA, p); break;
      case 'menu': {
        const y = L.capTop;
        const i = Math.floor((p.y - y - 10) / 48);
        const it = inRect(p, L.capRight - L.capOpen.w, y, L.capOpen.w, L.capOpen.h) && i >= 0 && i < MENU.length ? i : -1;
        if (it !== st.cap.hover) { st.cap.hover = it; SPR[4].dirty = true; }
        break;
      }
      case 'scroll': {
        let y = scroll.drag.y0 - (p.y - scroll.drag.p0);
        scroll.y = rubber(y);
        break;
      }
    }
  });

  function rubber(y) {
    const dim = S.H * 0.55;
    const f = (o) => (1 - 1 / ((o * 0.55) / dim + 1)) * dim;
    if (y < 0) return -f(-y);
    if (y > scroll.max) return scroll.max + f(y - scroll.max);
    return y;
  }

  function endPointer(e) {
    if (!ptr || e.pointerId !== ptr.id) return;
    const hit = ptr.hit, p = ptr.last;
    const tap = !ptr.moved && performance.now() - ptr.t0 < 450;
    st.glowA.a.t = 0;
    st.glowB.a.t = 0;
    switch (hit.type) {
      case 'toggle': {
        const t = st.toggle;
        if (!ptr.moved) t.on = !t.on;
        else t.on = t.knob.t > 0.5;
        t.knob.t = t.on ? 1 : 0;
        t.onC.t = t.on ? 1 : 0;
        t.act.t = 0;
        break;
      }
      case 'slider': st.slider.act.t = 0; break;
      case 'tab': {
        const tb = st.tab;
        tb.pressing = false;
        const sel = clamp(Math.round((tb.x.t - L.bar.x - 4) / L.tabW - 0.5), 0, TABS.length - 1);
        tb.x.t = tabCenter(sel);
        tb.lift.t = 0;
        if (sel !== tb.sel) { tb.sel = sel; paintTab(); }
        break;
      }
      case 'search':
        st.search.press.t = 0;
        if (tap) { P.dark = !P.dark; panelApi.refresh(); onChange('dark'); toast(P.dark ? tr('已切换为深色内容', 'Dark content') : tr('已切换为浅色内容', 'Light content')); }
        break;
      case 'back':
        st.back.press.t = 0;
        if (tap) { scroll.toTop = true; scroll.v = 0; }
        break;
      case 'cap':
        st.cap.press.t = 0;
        if (tap) { st.cap.open = true; st.cap.morph.t = 1; st.cap.hover = -1; SPR[4].dirty = true; }
        break;
      case 'menu':
        if (hit.item >= 0 && st.cap.hover === hit.item) toast(tr('「' + MENU[hit.item].label + '」（演示）', '"' + MENU[hit.item].label + '" (demo)'));
        closeMenu();
        break;
      case 'menuClose': closeMenu(); break;
      case 'drag': {
        const o = hit.obj;
        o.press.t = 0;
        o.dragging = false;
        if (hit.isLens && tap) {
          const now = performance.now();
          if (now - o.lastTap < 350) {
            o.shape = (o.shape + 1) % LENS_SHAPES.length;
            const ls = LENS_SHAPES[o.shape], sc = L.lensScale;
            o.w.t = ls.w * sc; o.h.t = ls.h * sc; o.r.t = ls.r * sc;
            o.lastTap = 0;
          } else o.lastTap = now;
        }
        break;
      }
      case 'scroll': {
        const s = ptr.samples;
        if (s.length >= 2) {
          const a = s[0], b = s[s.length - 1];
          const dt = Math.max(1, b.t - a.t) / 1000;
          scroll.v = -(b.y - a.y) / dt;
          if (performance.now() - b.t > 80) scroll.v = 0;
        }
        scroll.drag = null;
        break;
      }
    }
    ptr = null;
    void p;
  }
  function closeMenu() {
    st.cap.open = false;
    st.cap.morph.t = 0;
    st.cap.hover = -1;
    SPR[4].dirty = true;
  }
  canvas.addEventListener('pointerup', endPointer);
  canvas.addEventListener('pointercancel', endPointer);
  canvas.addEventListener('lostpointercapture', endPointer);
  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    const d = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaMode === 2 ? e.deltaY * S.H : e.deltaY;
    scroll.y = clamp(scroll.y + d, 0, scroll.max);
    scroll.v = 0;
    scroll.toTop = false;
  }, { passive: false });

  window.addEventListener('keydown', (e) => {
    if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT')) {
      if (e.code !== 'Space') return;
    }
    if (e.code === 'Space') { e.preventDefault(); S.lazyHold = true; }
    else if (e.key === 'p' || e.key === 'P') togglePanel();
    else if (e.key === 'd' || e.key === 'D') { P.debug = (P.debug + 1) % 5; panelApi.refresh(); }
  });
  window.addEventListener('keyup', (e) => { if (e.code === 'Space') S.lazyHold = false; });

  // 拖放上传
  const dz = $('#dropzone');
  stage.addEventListener('dragover', (e) => { e.preventDefault(); dz.classList.add('show'); });
  stage.addEventListener('dragleave', () => dz.classList.remove('show'));
  stage.addEventListener('drop', (e) => {
    e.preventDefault();
    dz.classList.remove('show');
    loadFile(e.dataTransfer.files[0]);
  });
  $('#file').addEventListener('change', (e) => { loadFile(e.target.files[0]); e.target.value = ''; });

  /* ------------------------------ 面板 ------------------------------ */
  function togglePanel() {
    document.body.classList.toggle('collapsed');
    setTimeout(resize, 30);
  }
  $('#collapse').addEventListener('click', togglePanel);
  $('#openPanel').addEventListener('click', togglePanel);

  function applyPreset(k) {
    for (const key of Object.keys(DEF)) if (!NON_OPTICAL.includes(key)) P[key] = DEF[key];
    Object.assign(P, PRESETS[k].v);
    computeSpectral();
    toast(tr('预设：', 'Preset: ') + PRESETS[k].label);
  }
  function onChange(key) {
    if (key === 'scene') setScene();
    else if (key === 'dark') { if (scene.mode === 0) scheduleContent(true); }
    else if (key === 'disp' || key === 'dispN') computeSpectral();
    else if (key === 'renderScale' || key === 'dprCap') resize();
    else if (key === 'lightMode' && P.lightMode === 'gyro') requestGyro();
  }
  function onAction(a) {
    if (a.startsWith('preset:')) { applyPreset(a.slice(7)); panelApi.refresh(); }
    else if (a === 'upload') $('#file').click();
    else if (a === 'nextPhoto') { photoIdx++; P.scene = 'photo'; panelApi.refresh(); setScene(); }
    else if (a === 'resetLayout') {
      st.lens.shape = 0;
      placeWidgets(true);
      st.lens.moved = false; st.blobs.forEach((b) => (b.moved = false)); st.panel.moved = false;
    }
  }
  const panelApi = LG.buildPanel($('#controls'), P, SCHEMA, onChange, onAction);

  /* ------------------------------ 物理更新 ------------------------------ */
  function physics(dt) {
    // 透镜 & 水滴
    const all = [st.lens, ...st.blobs];
    for (const o of all) {
      o.pos.step(dt);
      o.press.step(dt);
      o.jelly.update(o.pos.x.vel, o.pos.y.vel, dt);
    }
    st.lens.w.step(dt); st.lens.h.step(dt); st.lens.r.step(dt);
    st.panel.pos.step(dt);
    // 滑块
    const sl = st.slider;
    const prevK = sl.kx.v;
    sl.kx.step(dt); sl.act.step(dt);
    sl.jelly.update(((sl.kx.v - prevK) / Math.max(dt, 1e-4)) * (L.panelW - 40 - KNOB.w), 0, dt);
    // 开关
    const tg = st.toggle;
    const prevT = tg.knob.v;
    tg.knob.step(dt); tg.act.step(dt); tg.onC.step(dt);
    tg.jelly.update(((tg.knob.v - prevT) / Math.max(dt, 1e-4)) * 22, 0, dt);
    // 标签栏
    const tb = st.tab;
    tb.x.step(dt); tb.lift.step(dt);
    tb.jelly.update(tb.x.vel, 0, dt);
    st.search.press.step(dt); st.back.press.step(dt);
    st.cap.press.step(dt); st.cap.morph.step(dt);
    st.glowA.a.step(dt); st.glowB.a.step(dt);
    for (const id in adapt) adapt[id].sp.step(dt);

    // 滚动：iOS 式减速 + 橡皮筋回弹
    if (!scroll.drag) {
      if (scroll.toTop) {
        const a = (2 * Math.PI / 0.5) ** 2 * (0 - scroll.y) - (4 * Math.PI / 0.5) * scroll.v;
        scroll.v += a * dt;
        scroll.y += scroll.v * dt;
        if (Math.abs(scroll.y) < 0.5 && Math.abs(scroll.v) < 5) { scroll.y = 0; scroll.v = 0; scroll.toTop = false; }
      } else if (P.autoScroll && scroll.max > 0 && !ptr) {
        scroll.y += scroll.autoDir * 70 * dt;
        if (scroll.y >= scroll.max) { scroll.y = scroll.max; scroll.autoDir = -1; }
        if (scroll.y <= 0) { scroll.y = 0; scroll.autoDir = 1; }
      } else {
        scroll.y += scroll.v * dt;
        scroll.v *= Math.pow(0.135, dt);
        const lo = 0, hi = scroll.max;
        if (scroll.y < lo || scroll.y > hi) {
          const b = scroll.y < lo ? lo : hi;
          const k = (2 * Math.PI / 0.42) ** 2, c = (4 * Math.PI) / 0.42;
          scroll.v += (k * (b - scroll.y) - c * scroll.v) * dt;
          if (Math.abs(scroll.y - b) < 0.3 && Math.abs(scroll.v) < 4) { scroll.y = b; scroll.v = 0; }
        }
        if (Math.abs(scroll.v) < 2) scroll.v = 0;
      }
    }
  }

  /* ------------------------------ 渲染 ------------------------------ */
  function drawFS() { gl.drawArrays(gl.TRIANGLES, 0, 3); }
  function bindTex(unit, tex) { gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, tex); }

  function renderScene() {
    const { p, u } = progScene;
    gl.useProgram(p);
    gl.bindFramebuffer(gl.FRAMEBUFFER, TG.scene.fbo);
    gl.viewport(0, 0, S.cw, S.ch);
    gl.uniform2f(u.u_res, S.cw, S.ch);
    gl.uniform1i(u.u_mode, scene.mode);
    gl.uniform1f(u.u_time, S.time);
    gl.uniform1i(u.u_tex, 0);
    if (scene.mode === 0) {
      bindTex(0, texContent);
      gl.uniform2f(u.u_texSize, scene.cTexW, scene.cTexH);
      gl.uniform1f(u.u_cscale, scene.cScale / S.px);
      gl.uniform1f(u.u_scroll, scroll.y * S.px);
      gl.uniform3fv(u.u_page, scene.page);
      gl.uniform2f(u.u_edge, 96 * S.px, 70 * S.px);
      gl.uniform1f(u.u_edgeAmt, P.edgeFx ? 0.9 : 0);
    } else if (scene.mode === 2) {
      if (scene.isVideo && scene.img && scene.img.readyState >= 2) uploadTex(texImg, scene.img);
      bindTex(0, texImg);
      const s = Math.max(S.W / scene.imgW, S.H / scene.imgH);
      const dW = scene.imgW * s, dH = scene.imgH * s;
      const ox = (S.W - dW) / 2;
      const oy = scroll.max > 0 ? -scroll.y : (S.H - dH) / 2;
      gl.uniform4f(u.u_img, ox * S.px, oy * S.px, dW * S.px, dH * S.px);
    } else bindTex(0, texContent);
    drawFS();
  }
  function renderPyramid() {
    const { p, u } = progDown;
    gl.useProgram(p);
    gl.uniform1i(u.u_src, 0);
    for (let k = 1; k <= 6; k++) {
      const src = k === 1 ? TG.scene : TG.lv[k - 1], dst = TG.lv[k];
      gl.bindFramebuffer(gl.FRAMEBUFFER, dst.fbo);
      gl.viewport(0, 0, dst.w, dst.h);
      bindTex(0, src.tex);
      gl.uniform2f(u.u_texel, 1 / src.w, 1 / src.h);
      gl.uniform2f(u.u_dst, dst.w, dst.h);
      drawFS();
    }
  }

  const FL = { f0: new Float32Array(32), f1: new Float32Array(32), f2: new Float32Array(32) };
  const SP = { r: new Float32Array(24), x: new Float32Array(24) };
  function glassCommon(u, pass, L2) {
    const k = S.px;
    gl.uniform2f(u.u_res, S.cw, S.ch);
    gl.uniform1i(u.u_pass, pass);
    gl.uniform1f(u.u_px, k);
    gl.uniform1f(u.u_lodBias, 0.25);
    gl.uniform1f(u.u_ior, P.ior);
    gl.uniform1f(u.u_disp, P.disp);
    gl.uniform1i(u.u_dispN, dwN);
    gl.uniform4fv(u.u_dw, dw);
    gl.uniform1f(u.u_thick, P.thickness * k);
    gl.uniform1f(u.u_bezel, P.bezel * k);
    gl.uniform1f(u.u_base, P.base * k);
    gl.uniform1f(u.u_refr, P.refr);
    gl.uniform1i(u.u_profile, P.profile);
    gl.uniform1f(u.u_mergeK, P.mergeK * k);
    gl.uniform1f(u.u_margin, (Math.max(P.mergeK, P.shadowR * 1.2 + Math.abs(P.shadowY), 8) + 6) * k);
    gl.uniform2f(u.u_L, L2[0], L2[1]);
    gl.uniform1f(u.u_rimI, P.rimI);
    gl.uniform1f(u.u_rimW, P.rimW * k);
    gl.uniform1f(u.u_rimFar, P.rimFar);
    gl.uniform1f(u.u_glareI, P.glareI);
    gl.uniform1f(u.u_glareR, P.glareR * k);
    gl.uniform1f(u.u_glareConv, P.glareConv);
    gl.uniform1f(u.u_glareFar, P.glareFar);
    gl.uniform1f(u.u_fresnel, P.fresnel);
    gl.uniform1f(u.u_contact, P.contact);
    gl.uniform1f(u.u_shA, P.shadowA);
    gl.uniform1f(u.u_shR, P.shadowR * k);
    gl.uniform2f(u.u_shOff, 0, P.shadowY * k);
    gl.uniform1f(u.u_sat, P.sat);
    gl.uniform1f(u.u_bright, P.bright);
    gl.uniform1f(u.u_veil, P.veil);
    gl.uniform1f(u.u_adaptI, P.adapt);
    const g = pass === 0 ? st.glowA : st.glowB;
    gl.uniform4f(u.u_glow, g.x * k, g.y * k, 70 * k, clamp(g.a.v, 0, 1.2) * 0.9);
    gl.uniform1i(u.u_debug, P.debug);
    gl.uniform1i(u.u_lazy, P.lazy || S.lazyHold ? 1 : 0);
    ['u_bg0', 'u_bg1', 'u_bg2', 'u_bg3', 'u_bg4', 'u_bg5', 'u_bg6'].forEach((n, i) => gl.uniform1i(u[n], i));
    ['u_sp0', 'u_sp1', 'u_sp2', 'u_sp3', 'u_sp4', 'u_sp5'].forEach((n, i) => gl.uniform1i(u[n], 7 + i));
  }

  function renderGlass(shapes, L2) {
    const { p, u } = progGlass;
    const k = S.px;
    gl.useProgram(p);
    for (let i = 1; i <= 6; i++) bindTex(i, TG.lv[i].tex);
    SPR.forEach((s, i) => bindTex(7 + i, s.tex));

    // ---------- pass 0 → fboA ----------
    bindTex(0, TG.scene.tex);
    gl.bindFramebuffer(gl.FRAMEBUFFER, TG.A.fbo);
    gl.viewport(0, 0, S.cw, S.ch);
    glassCommon(u, 0, L2);
    uploadShapes(u, shapes.base);

    // 平面元素
    const pg = shapes.pg, tb = st.tab, lift = clamp(tb.lift.v, 0, 1);
    const flats = [];
    flats.push([tb.x.v, L.bar.cy, (L.tabW - 2) / 2, (L.bar.h - 8) / 2, 0, 0, 0, 0.075 * (1 - sstep(0, 0.35, lift)), (L.bar.h - 8) / 2, 1]);
    flats.push([pg.track.x + pg.track.w / 2, pg.track.y, pg.track.w / 2, 3, 0, 0, 0, 0.13, 3, 1]);
    const fx = Math.max(pg.track.x + 3, shapes.kx);
    flats.push([(pg.track.x + fx) / 2, pg.track.y, (fx - pg.track.x) / 2, 3, 0.04, 0.52, 1, 1, 3, 0]);
    flats.push([pg.tog.x + pg.tog.w / 2, pg.tog.y, pg.tog.w / 2, pg.tog.h / 2, 0, 0, 0, 0.12, pg.tog.h / 2, 1]);
    flats.push([pg.tog.x + pg.tog.w / 2, pg.tog.y, pg.tog.w / 2, pg.tog.h / 2, 0.2, 0.78, 0.35, clamp(st.toggle.onC.v, 0, 1), pg.tog.h / 2, 0]);
    FL.f0.fill(0); FL.f1.fill(0); FL.f2.fill(0);
    flats.forEach((f, i) => {
      FL.f0.set([f[0] * k, f[1] * k, f[2] * k, f[3] * k], i * 4);
      FL.f1.set([f[4], f[5], f[6], f[7]], i * 4);
      FL.f2.set([f[8] * k, f[9], 0, 0], i * 4);
    });
    gl.uniform1i(u.u_nf, flats.length);
    gl.uniform4fv(u.u_f0, FL.f0); gl.uniform4fv(u.u_f1, FL.f1); gl.uniform4fv(u.u_f2, FL.f2);

    // 精灵
    const m = clamp(st.cap.morph.v, 0, 1);
    const sprites = [
      [L.bar.x, L.bar.y, L.bar.w, L.bar.h, 1, 1, 0, 0],
      [L.search.x - 31, L.search.y - 31, 62, 62, 1, 1 + 0.14 * st.search.press.v, L.search.x, L.search.y],
      [L.back.x - 22, L.back.y - 22, 44, 44, 1, 1 + 0.16 * st.back.press.v, L.back.x, L.back.y],
      [L.capRight - L.capRest.w, L.capTop, L.capRest.w, L.capRest.h, 1 - sstep(0, 0.3, m), 1 + 0.1 * st.cap.press.v, L.capRight - L.capRest.w / 2, L.capTop + L.capRest.h / 2],
      [L.capRight - L.capOpen.w, L.capTop, L.capOpen.w, L.capOpen.h, sstep(0.45, 0.95, st.cap.morph.v), 1, 0, 0],
      [pg.x, pg.y, pg.w, pg.h, 1, 1, 0, 0],
    ];
    sprites.forEach((s, i) => {
      SP.r.set([s[0] * k, s[1] * k, s[2] * k, s[3] * k], i * 4);
      SP.x.set([s[4], s[5], s[6] * k, s[7] * k], i * 4);
    });
    gl.uniform1i(u.u_nsp, P.debug ? 0 : 6);
    gl.uniform4fv(u.u_spR, SP.r);
    gl.uniform4fv(u.u_spX, SP.x);
    drawFS();

    // ---------- pass 1 → 屏幕 ----------
    bindTex(0, TG.A.tex);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, S.cw, S.ch);
    glassCommon(u, 1, L2);
    gl.uniform1f(u.u_shR, P.shadowR * 0.45 * k);
    gl.uniform2f(u.u_shOff, 0, P.shadowY * 0.4 * k);
    uploadShapes(u, P.debug === 1 ? shapes.top.concat([]) : shapes.top);
    gl.uniform1i(u.u_nf, 0);
    gl.uniform1i(u.u_nsp, 0);
    drawFS();
  }

  /* ------------------------------ 主循环 ------------------------------ */
  let last = performance.now(), fpsAcc = 0, fpsN = 0;
  const fpsEl = $('#fps');
  const RECORD = /[?&]record/.test(location.search);
  function frame(now) {
    try {
      frameBody(now);
    } catch (e) {
      console.error(e);
      fatal(tr('运行出错：', 'Runtime error: ') + (e && e.message ? e.message : e) + '\n' + (e && e.stack ? e.stack : ''));
      return;
    }
    nextFrame();
  }
  function frameBody(now, fixedDt) {
    let dt = fixedDt || (now - last) / 1000;
    last = now;
    if (!(dt > 0)) dt = 1 / 60;
    dt = Math.min(dt, 1 / 20);
    S.time += dt;
    fpsAcc += dt; fpsN++;
    if (fpsAcc > 0.5) { fpsEl.textContent = Math.round(fpsN / fpsAcc) + ' fps'; fpsAcc = 0; fpsN = 0; }

    physics(dt);
    if (SPR[5].dirty) paintPanel();
    if (SPR[4].dirty) paintMenu();

    const shapes = buildShapes();
    const L2 = lightDir(dt);

    renderScene();
    renderPyramid();
    if (frameNo++ % 6 === 0) updateAdapt(shapes.base.concat(shapes.top));
    renderGlass(shapes, L2);
  }
  // ?timer：用 setTimeout 驱动（仅用于窗口被遮挡、rAF 被浏览器暂停时的调试）
  const useTimer = /[?&]timer/.test(location.search);
  function nextFrame() {
    if (RECORD) return;
    if (useTimer) setTimeout(() => frame(performance.now()), 16);
    else requestAnimationFrame(frame);
  }

  /* ------------------------------ 语言切换 ------------------------------ */
  document.querySelectorAll('.lang button').forEach((b) => {
    b.classList.toggle('on', b.dataset.lang === LG.lang);
    b.addEventListener('click', () => { if (b.dataset.lang !== LG.lang) LG.setLang(b.dataset.lang); });
  });

  /* ------------------------------ 录制模式（?record）：逐帧确定性渲染，供 tools/record.mjs 使用 ------------------------------ */
  if (RECORD) {
    document.body.classList.add('recording');
    const capEl = $('#caption');
    window.__lg = {
      step(n = 1, dt = 1 / 30) { for (let i = 0; i < n; i++) frameBody(performance.now(), dt); return true; },
      set(key, v) { P[key] = v; onChange(key); panelApi.refresh(); },
      preset(k) { applyPreset(k); panelApi.refresh(); },
      scene(s) { P.scene = s; setScene(); panelApi.refresh(); },
      ready() { return scene.mode !== 0 || scene.contentH > 1; },
      caption(main, sub) {
        if (!main) { capEl.classList.remove('show'); return; }
        capEl.innerHTML = main + (sub ? '<small>' + sub + '</small>' : '');
        capEl.classList.add('show');
      },
      scrollTo(y) { scroll.y = y; scroll.v = 0; },
      geo() {
        const pg = panelGeo();
        return {
          W: S.W, H: S.H,
          lens: { x: st.lens.pos.x.v, y: st.lens.pos.y.v },
          blobs: st.blobs.map((b) => ({ x: b.pos.x.v, y: b.pos.y.v })),
          bar: { ...L.bar, tabW: L.tabW, centers: TABS.map((_, i) => tabCenter(i)) },
          search: { x: L.search.x, y: L.search.y },
          cap: { x: L.capRight - L.capRest.w / 2, y: L.capTop + L.capRest.h / 2 },
          menu: { x: L.capRight - L.capOpen.w, y: L.capTop, w: L.capOpen.w, h: L.capOpen.h },
          back: { x: L.back.x, y: L.back.y },
          panel: { x: pg.cx, y: pg.cy, w: pg.w, h: pg.h },
          track: pg.track, tog: pg.tog,
          knob: KNOB,
        };
      },
    };
  }

  /* ------------------------------ 启动 ------------------------------ */
  computeSpectral();
  new ResizeObserver(() => resize()).observe(stage);
  if (RECORD || window.matchMedia('(max-width: 760px)').matches) document.body.classList.add('collapsed');
  resize();
  setScene();
  nextFrame();
  setTimeout(() => $('#hint').classList.add('hide'), RECORD ? 0 : 9000);
  canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); fatal(tr('WebGL 上下文丢失，请刷新页面。', 'WebGL context lost — please reload.')); });
})();
