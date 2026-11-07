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

  const SH = {"vert":"#version 300 es\nvoid main(){\n  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));\n  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);\n}","scene":"#version 300 es\nprecision highp float;\nuniform vec2  u_res;\nuniform int   u_mode;      // 0 内容纹理 1 壁纸 2 图片/视频\nuniform sampler2D u_tex;\nuniform vec2  u_texSize;\nuniform float u_scroll;    // 画布像素\nuniform float u_cscale;    // 内容纹理像素 / 画布像素\nuniform vec3  u_page;\nuniform vec2  u_edge;      // 顶部/底部渐隐高度\nuniform float u_edgeAmt;\nuniform float u_time;\nuniform vec4  u_img;       // 图片在画布上的 offset.xy, size.xy\nout vec4 o;\n\nvec3 hsv(float h, float s, float v){\n  vec3 k = clamp(abs(mod(h * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0);\n  return v * mix(vec3(1.0), k, s);\n}\n\nvec3 wallpaper(vec2 p){\n  float t = u_time * 0.08;\n  vec2 uv = p / u_res.y;\n  float asp = u_res.x / u_res.y;\n  vec3 cols[5];\n  cols[0] = vec3(1.00, 0.33, 0.45);\n  cols[1] = vec3(0.30, 0.40, 1.00);\n  cols[2] = vec3(0.10, 0.86, 0.78);\n  cols[3] = vec3(1.00, 0.72, 0.20);\n  cols[4] = vec3(0.62, 0.26, 0.98);\n  vec3 acc = vec3(0.0); float ws = 0.0;\n  for (int i = 0; i < 5; i++) {\n    float fi = float(i);\n    vec2 c = vec2(asp * (0.5 + 0.38 * sin(t * (0.7 + 0.13 * fi) + fi * 1.9)),\n                  0.5 + 0.36 * cos(t * (0.9 + 0.11 * fi) + fi * 2.7));\n    float d = length(uv - c);\n    float w = exp(-d * d * 5.0) + 0.002;\n    acc += cols[i] * w; ws += w;\n  }\n  vec3 col = acc / ws;\n  col = mix(col, col * col * 1.4, 0.25);\n  // 细白色正弦线：用来观察折射\n  for (int k = 0; k < 9; k++) {\n    float fk = float(k);\n    float yk = (fk + 0.5) / 9.0 + 0.03 * sin(uv.x * 3.5 + t * 3.0 + fk * 1.7);\n    float dpx = abs(uv.y - yk) * u_res.y;\n    col = mix(col, vec3(1.0), (1.0 - smoothstep(0.6, 2.0, dpx)) * 0.6);\n  }\n  // 同心圆环\n  vec2 rc = vec2(asp * (0.5 + 0.18 * sin(t * 0.8)), 0.5 + 0.12 * cos(t * 0.6));\n  float rr = length(uv - rc) * 7.0 - t * 0.6;\n  float ring = abs(fract(rr) - 0.5) / 7.0 * u_res.y;\n  col = mix(col, col * 0.55, (1.0 - smoothstep(0.8, 2.6, ring)) * 0.45);\n  // 斜向窄条纹\n  float st = abs(fract((p.x + p.y) / (u_res.y * 0.045)) - 0.5);\n  col = mix(col, col * 1.12 + 0.03, step(0.42, st) * 0.35);\n  return clamp(col, 0.0, 1.0);\n}\n\nvoid main(){\n  vec2 p = vec2(gl_FragCoord.x, u_res.y - gl_FragCoord.y);\n  vec3 c;\n  if (u_mode == 0) {\n    vec2 cp = vec2(p.x, p.y + u_scroll) * u_cscale;\n    vec2 uv = cp / u_texSize;\n    c = (uv.y < 0.0 || uv.y > 1.0) ? u_page : textureLod(u_tex, uv, 0.0).rgb;\n    if (u_edgeAmt > 0.0) {\n      float ft = 1.0 - smoothstep(0.0, u_edge.x, p.y);\n      float fb = 1.0 - smoothstep(0.0, u_edge.y, u_res.y - p.y);\n      float f = max(ft * ft, fb * fb) * u_edgeAmt;\n      c = mix(c, u_page, f);\n    }\n  } else if (u_mode == 1) {\n    c = wallpaper(p);\n  } else {\n    vec2 uv = (p - u_img.xy) / u_img.zw;\n    c = textureLod(u_tex, clamp(uv, 0.0, 1.0), 0.0).rgb;\n  }\n  o = vec4(c, 1.0);\n}","down":"#version 300 es\nprecision highp float;\nuniform sampler2D u_src;\nuniform vec2 u_texel;   // 1/源尺寸\nuniform vec2 u_dst;     // 目标尺寸\nout vec4 o;\nvec3 T(vec2 uv){ return textureLod(u_src, uv, 0.0).rgb; }\nvoid main(){\n  vec2 uv = gl_FragCoord.xy / u_dst;\n  vec2 t = u_texel;\n  vec3 a = T(uv + t * vec2(-2.0,  2.0)), b = T(uv + t * vec2(0.0,  2.0)), c = T(uv + t * vec2(2.0,  2.0));\n  vec3 d = T(uv + t * vec2(-2.0,  0.0)), e = T(uv),                       f = T(uv + t * vec2(2.0,  0.0));\n  vec3 g = T(uv + t * vec2(-2.0, -2.0)), h = T(uv + t * vec2(0.0, -2.0)), i = T(uv + t * vec2(2.0, -2.0));\n  vec3 j = T(uv + t * vec2(-1.0,  1.0)), k = T(uv + t * vec2(1.0,  1.0));\n  vec3 l = T(uv + t * vec2(-1.0, -1.0)), m = T(uv + t * vec2(1.0, -1.0));\n  vec3 r = e * 0.125 + (a + c + g + i) * 0.03125 + (b + d + f + h) * 0.0625 + (j + k + l + m) * 0.125;\n  o = vec4(r, 1.0);\n}","glass":"#version 300 es\nprecision highp float;\nprecision highp int;\nout vec4 o;\n\n#define MAXS 10\n#define MAXF 8\n#define MAXSP 6\n#define PI 3.14159265359\n\nuniform vec2  u_res;\nuniform int   u_pass;\nuniform float u_px;\nuniform sampler2D u_bg0, u_bg1, u_bg2, u_bg3, u_bg4, u_bg5, u_bg6;\nuniform float u_lodBias;\n\n// ---- 形状（每个 6 个 vec4）----\nuniform int  u_n;\nuniform vec4 u_g0[MAXS];   // cx, cy, 半宽, 半高\nuniform vec4 u_g1[MAXS];   // 圆角R, 超椭圆指数n, 拉伸角, 拉伸量\nuniform vec4 u_g2[MAXS];   // 融合组, 不透明度, 阴影系数, 折射系数\nuniform vec4 u_m0[MAXS];   // 着色 rgb, 着色量\nuniform vec4 u_m1[MAXS];   // 磨砂px, 实心白, 明暗(1=亮背景), 中心放大\nuniform vec4 u_m2[MAXS];   // 薄纱系数, 高光系数, 边缘宽度覆盖px(0=全局), 厚度系数\n\n// ---- 光学 ----\nuniform float u_ior, u_disp;\nuniform int   u_dispN;\nuniform vec4  u_dw[16];    // rgb 光谱权重, w = 波长位置 t（0 红 → 1 紫）\nuniform float u_thick, u_bezel, u_base, u_refr;\nuniform int   u_profile;\nuniform float u_mergeK, u_margin;\nuniform vec2  u_L;\nuniform float u_rimI, u_rimW, u_rimFar;\nuniform float u_glareI, u_glareR, u_glareConv, u_glareFar;\nuniform float u_fresnel;\nuniform float u_contact;\nuniform float u_shA, u_shR;\nuniform vec2  u_shOff;\nuniform float u_sat, u_bright, u_veil, u_adaptI;\nuniform vec4  u_glow;      // x, y, 半径, 强度\nuniform int   u_debug, u_lazy;\n\n// ---- 平面元素（滑轨等）----\nuniform int  u_nf;\nuniform vec4 u_f0[MAXF];   // cx, cy, 半宽, 半高\nuniform vec4 u_f1[MAXF];   // rgba\nuniform vec4 u_f2[MAXF];   // 圆角, 自适应模式\n\n// ---- 图标精灵 ----\nuniform int  u_nsp;\nuniform sampler2D u_sp0, u_sp1, u_sp2, u_sp3, u_sp4, u_sp5;\nuniform vec4 u_spR[MAXSP]; // x, y, w, h\nuniform vec4 u_spX[MAXSP]; // alpha, scale, pivotX, pivotY\n\nfloat luma(vec3 c){ return dot(c, vec3(0.2126, 0.7152, 0.0722)); }\n\nvec3 hsv2rgb(float h, float s, float v){\n  vec3 k = clamp(abs(mod(h * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0);\n  return v * mix(vec3(1.0), k, s);\n}\n\nvec3 rgb2oklab(vec3 c){\n  c = pow(max(c, 0.0), vec3(2.2));\n  float l = 0.4122214708 * c.r + 0.5363325363 * c.g + 0.0514459929 * c.b;\n  float m = 0.2119034982 * c.r + 0.6806995451 * c.g + 0.1073969566 * c.b;\n  float s = 0.0883024619 * c.r + 0.2817188376 * c.g + 0.6299787005 * c.b;\n  l = pow(l, 1.0 / 3.0); m = pow(m, 1.0 / 3.0); s = pow(s, 1.0 / 3.0);\n  return vec3(0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s,\n              1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s,\n              0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s);\n}\nvec3 oklab2rgb(vec3 L){\n  float l = L.x + 0.3963377774 * L.y + 0.2158037573 * L.z;\n  float m = L.x - 0.1055613458 * L.y - 0.0638541728 * L.z;\n  float s = L.x - 0.0894841775 * L.y - 1.2914855480 * L.z;\n  l = l * l * l; m = m * m * m; s = s * s * s;\n  vec3 c = vec3( 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,\n                -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,\n                -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s);\n  return pow(max(c, 0.0), vec3(1.0 / 2.2));\n}\n\n// ---------------- 背景采样：B 样条双三次 + 金字塔插值 ----------------\nvec3 bspline(sampler2D t, vec2 uv){\n  vec2 sz = vec2(textureSize(t, 0));\n  vec2 st = uv * sz - 0.5;\n  vec2 i = floor(st);\n  vec2 f = st - i;\n  vec2 f2 = f * f, f3 = f2 * f;\n  vec2 w0 = (1.0 - 3.0 * f + 3.0 * f2 - f3) / 6.0;\n  vec2 w1 = (4.0 - 6.0 * f2 + 3.0 * f3) / 6.0;\n  vec2 w2 = (1.0 + 3.0 * f + 3.0 * f2 - 3.0 * f3) / 6.0;\n  vec2 w3 = f3 / 6.0;\n  vec2 g0 = w0 + w1, g1 = w2 + w3;\n  vec2 h0 = (i - 0.5 + w1 / g0) / sz;\n  vec2 h1 = (i + 1.5 + w3 / g1) / sz;\n  vec3 a = textureLod(t, vec2(h0.x, h0.y), 0.0).rgb;\n  vec3 b = textureLod(t, vec2(h1.x, h0.y), 0.0).rgb;\n  vec3 c = textureLod(t, vec2(h0.x, h1.y), 0.0).rgb;\n  vec3 d = textureLod(t, vec2(h1.x, h1.y), 0.0).rgb;\n  return g0.y * (g0.x * a + g1.x * b) + g1.y * (g0.x * c + g1.x * d);\n}\nvec3 lvl(int k, vec2 uv){\n  if (k <= 0) return textureLod(u_bg0, uv, 0.0).rgb;\n  if (k == 1) return bspline(u_bg1, uv);\n  if (k == 2) return bspline(u_bg2, uv);\n  if (k == 3) return bspline(u_bg3, uv);\n  if (k == 4) return bspline(u_bg4, uv);\n  if (k == 5) return bspline(u_bg5, uv);\n  return bspline(u_bg6, uv);\n}\nvec3 sampleBg(vec2 uv, float blur){\n  if (blur < 0.6) return textureLod(u_bg0, uv, 0.0).rgb;\n  float lod = clamp(log2(blur) + u_lodBias, 0.0, 6.0);\n  int k = int(floor(lod));\n  float f = lod - float(k);\n  vec3 a = lvl(k, uv);\n  if (f < 0.02 || k >= 6) return a;\n  return mix(a, lvl(k + 1, uv), f);\n}\nvec3 bgAt(vec2 p, float blur){\n  return sampleBg(vec2(p.x, u_res.y - p.y) / u_res, blur);\n}\n\n// ---------------- SDF ----------------\nfloat smin(float a, float b, float k){\n  if (k <= 0.0) return min(a, b);\n  float h = max(k - abs(a - b), 0.0) / k;\n  return min(a, b) - h * h * k * 0.25;\n}\n// 超椭圆圆角矩形：n=2 为普通圆角，n≈3.25 + R=1.528r 逼近 iOS 连续曲率圆角\nfloat sdRR(vec2 q, vec2 h, float r, float n){\n  r = min(r, min(h.x, h.y));\n  vec2 d = abs(q) - h + r;\n  vec2 m = max(d, 0.0);\n  float c;\n  if (m.x > 0.0 && m.y > 0.0) {\n    if (n < 2.02) c = length(m);\n    else {\n      float mx = max(m.x, m.y);\n      vec2 mm = m / mx;\n      c = mx * pow(pow(mm.x, n) + pow(mm.y, n), 1.0 / n);\n    }\n  } else c = max(m.x, m.y);\n  return c + min(max(d.x, d.y), 0.0) - r;\n}\nfloat sdShape(vec2 p, int i){\n  vec4 g = u_g0[i]; vec4 g1 = u_g1[i];\n  vec2 q = p - g.xy;\n  float sc = 1.0;\n  if (g1.w > 0.0005) {                       // 果冻拉伸（近似保面积）\n    vec2 u = vec2(cos(g1.z), sin(g1.z));\n    vec2 v = vec2(-u.y, u.x);\n    float su = 1.0 + g1.w, sv = 1.0 / sqrt(su);\n    float a = dot(q, u) / su, b = dot(q, v) / sv;\n    q = a * u + b * v;\n    sc = min(su, sv);\n  }\n  return sdRR(q, g.zw, g1.x, g1.y) * sc;\n}\nfloat sdFast(vec2 p, int i){\n  vec4 g = u_g0[i];\n  vec2 b = abs(p - g.xy) - g.zw * (1.0 + u_g1[i].w);\n  float db = length(max(b, 0.0));\n  if (db > u_margin) return db;\n  return sdShape(p, i);\n}\nfloat mapAll(vec2 p){\n  float tot = 1e6, cur = 1e6, cg = -999.0;\n  for (int i = 0; i < MAXS; i++) {\n    if (i >= u_n) break;\n    vec4 g2 = u_g2[i];\n    if (g2.y < 0.002) continue;\n    float d = sdFast(p, i);\n    if (g2.x == cg) cur = smin(cur, d, u_mergeK);\n    else { tot = min(tot, cur); cur = d; cg = g2.x; }\n  }\n  return min(tot, cur);\n}\nvec2 grad(vec2 p){\n  float e = 0.75;\n  return vec2(mapAll(p + vec2(e, 0.0)) - mapAll(p - vec2(e, 0.0)),\n              mapAll(p + vec2(0.0, e)) - mapAll(p - vec2(0.0, e)));\n}\n\n// ---------------- 材质混合（融合区域内平滑插值）----------------\nstruct M {\n  vec4 tint; float frost, white, adapt, zoom, op, refr, veil, rim, bezel, thick, inr; vec2 c;\n};\nM evalM(vec2 p){\n  float ds[MAXS];\n  float best = 1e9, bgp = -1.0;\n  for (int i = 0; i < MAXS; i++) {\n    if (i >= u_n) break;\n    ds[i] = 1e9;\n    if (u_g2[i].y < 0.002) continue;\n    float d = sdFast(p, i);\n    ds[i] = d;\n    if (d < best) { best = d; bgp = u_g2[i].x; }\n  }\n  M m;\n  m.tint = vec4(0.0); m.frost = 0.0; m.white = 0.0; m.adapt = 0.0; m.zoom = 0.0; m.op = 0.0;\n  m.refr = 0.0; m.veil = 0.0; m.rim = 0.0; m.bezel = 0.0; m.thick = 0.0; m.inr = 0.0; m.c = vec2(0.0);\n  float kk = max(u_mergeK * 0.45, 1.5);\n  float ws = 0.0;\n  for (int i = 0; i < MAXS; i++) {\n    if (i >= u_n) break;\n    if (ds[i] > 1e8 || u_g2[i].x != bgp) continue;\n    float w = exp(-(ds[i] - best) / kk);\n    ws += w;\n    m.tint  += u_m0[i] * w;\n    m.frost += u_m1[i].x * w; m.white += u_m1[i].y * w; m.adapt += u_m1[i].z * w; m.zoom += u_m1[i].w * w;\n    m.op    += u_g2[i].y * w; m.refr += u_g2[i].w * w;\n    m.veil  += u_m2[i].x * w; m.rim += u_m2[i].y * w; m.bezel += u_m2[i].z * w; m.thick += u_m2[i].w * w;\n    m.inr   += min(u_g0[i].z, u_g0[i].w) * w;\n    m.c     += u_g0[i].xy * w;\n  }\n  float iw = 1.0 / max(ws, 1e-6);\n  m.tint *= iw; m.frost *= iw; m.white *= iw; m.adapt *= iw; m.zoom *= iw; m.op *= iw;\n  m.refr *= iw; m.veil *= iw; m.rim *= iw; m.bezel *= iw; m.thick *= iw; m.inr *= iw; m.c *= iw;\n  return m;\n}\n\n// ---------------- 阴影：柔和投影 + 贴边环境遮蔽 ----------------\nfloat shadowAt(vec2 p){\n  float acc = 1.0;\n  for (int i = 0; i < MAXS; i++) {\n    if (i >= u_n) break;\n    vec4 g2 = u_g2[i];\n    float sc = g2.y * g2.z;\n    if (sc < 0.002) continue;\n    float d1 = sdFast(p - u_shOff, i);\n    float s1 = 1.0 - smoothstep(-u_shR * 0.45, u_shR, d1);\n    float d0 = sdFast(p, i);\n    float s0 = 1.0 - smoothstep(0.0, max(u_shR * 0.2, 1.5), d0);\n    float s = (s1 * s1 * 0.8 + s0 * 0.35) * sc * u_shA;\n    acc *= 1.0 - clamp(s, 0.0, 1.0);\n  }\n  return 1.0 - acc;\n}\n\n// ---------------- 玻璃表面高度剖面 ----------------\nfloat prof(float x){\n  x = clamp(x, 0.0, 1.0);\n  float cv = pow(max(1.0 - pow(1.0 - x, 4.0), 0.0), 0.25);           // 凸面 squircle\n  if (u_profile == 1) return sqrt(max(1.0 - (1.0 - x) * (1.0 - x), 0.0)); // 凸面圆弧\n  if (u_profile == 2) {                                                // 唇边\n    float s = x * x * x * (x * (x * 6.0 - 15.0) + 10.0);\n    return cv * (1.0 - 0.32 * s);\n  }\n  return cv;\n}\n\n// ---------------- 玻璃着色 ----------------\nvec3 shade(vec2 p, float dU, M m){\n  float dIn = max(-dU, 0.0);\n  float w = m.bezel > 0.5 ? m.bezel : u_bezel;\n  w = clamp(w, 1.0, max(m.inr * 0.98, 1.0));\n  float T = u_thick * m.thick * (w / max(u_bezel, 1.0));\n  float x = dIn / w;\n\n  vec2 n2 = vec2(0.0);\n  if (dIn < max(w, u_glareR * 3.0) + 2.0) {\n    vec2 gr = grad(p);\n    float gl = length(gr);\n    if (gl > 1e-6) n2 = gr / gl;              // 指向外侧的 2D 法线\n  }\n  float hgt = 1.0, slope = 0.0;\n  if (x < 1.0) {\n    float xc = max(x, 0.002);\n    hgt = prof(xc);\n    float e = 0.002;\n    float xa = max(xc - e, 0.0), xb = min(xc + e, 1.0);\n    slope = (prof(xb) - prof(xa)) / (xb - xa) * T / w;   // dz / d(向内距离)\n  }\n  // 表面法线：沿外侧倾斜\n  vec3 N = normalize(vec3(n2 * slope, 1.0));\n  float depth = hgt * T + u_base;\n  float rs = u_refr * m.refr;\n  vec2 bp = m.c + (p - m.c) / max(m.zoom, 0.05);\n\n  // ---- 对照组：常见的「AI 毛玻璃」----\n  if (u_lazy == 1) {\n    vec3 c = bgAt(p, 18.0 * u_px);\n    c = mix(c, vec3(1.0), 0.2);\n    float border = 1.0 - smoothstep(0.0, 1.2 * u_px, dIn);\n    return mix(c, vec3(1.0), border * 0.6);\n  }\n\n  // ---- 斯涅尔折射 ----\n  vec3 I = vec3(0.0, 0.0, -1.0);\n  vec3 R0 = refract(I, N, 1.0 / u_ior);\n  vec2 d0 = R0.xy / max(-R0.z, 0.06) * depth * rs;\n  // 采样点不越过形状的中轴：保留边缘的拉伸/压缩，但不出现玻璃棒式的倒像\n  float dl = length(d0);\n  float lim = max(m.inr - dIn, 0.0) * 0.9 + 0.5;\n  float dk = dl > lim ? lim / dl : 1.0;\n  d0 *= dk;\n\n  if (u_debug == 2) return mix(vec3(0.5), vec3(n2 * 0.5 + 0.5, 1.0), clamp(slope * 0.6, 0.0, 1.0));\n  if (u_debug == 3) {\n    float mag = length(d0) / max(w * 0.5, 1.0);\n    return hsv2rgb(atan(d0.y, d0.x) / (2.0 * PI) + 0.5, 0.85, clamp(mag, 0.0, 1.0));\n  }\n  if (u_debug == 4) return vec3(hgt * 0.85 + 0.1);\n\n  float frost = m.frost;\n  vec3 c;\n  if (u_dispN <= 1 || length(d0) < 0.35) {\n    c = bgAt(bp + d0, frost);\n  } else {\n    // ---- 光谱色散：逐波长折射、逐波长采样、按光谱响应合成 ----\n    c = vec3(0.0);\n    for (int s = 0; s < 16; s++) {\n      if (s >= u_dispN) break;\n      vec4 dw = u_dw[s];\n      float ior = max(u_ior + u_disp * (dw.w - 0.5), 1.0);\n      vec3 R = refract(I, N, 1.0 / ior);\n      vec2 d = R.xy / max(-R.z, 0.06) * depth * rs * dk;\n      c += bgAt(bp + d, frost) * dw.rgb;\n    }\n  }\n\n  // ---- 接触阴影被折射进弧面：白底上形成一圈弯曲的灰色渐变（玻璃“厚度感”的关键线索）----\n  if (u_contact > 0.001) {\n    float dS = mapAll(bp + d0);\n    float band = max(u_shR * 0.5, 2.0 * u_px);\n    float cs = dS < 0.0 ? exp(dS / band) : 1.0 - smoothstep(0.0, u_shR, dS);\n    c *= 1.0 - clamp(cs * u_contact * 0.28, 0.0, 0.6);\n  }\n\n  // ---- 通透感：饱和度/亮度（Vibrancy）----\n  float l = luma(c);\n  c = mix(vec3(l), c, u_sat) * u_bright;\n\n  // ---- 着色 ----\n  c = mix(c, m.tint.rgb * (0.5 + 0.9 * l), clamp(m.tint.a, 0.0, 1.0));\n\n  // ---- 明暗自适应薄纱 ----\n  vec3 adaptCol = mix(vec3(0.0), vec3(1.0), m.adapt);\n  vec3 vc = mix(vec3(1.0), adaptCol, u_adaptI);\n  float va = u_veil * m.veil * mix(1.0, mix(1.3, 1.0, m.adapt), u_adaptI);\n  c = mix(c, vc, clamp(va, 0.0, 1.0));\n\n  // ---- Fresnel 反射（掠射角越大反射越强）----\n  float F0 = pow((u_ior - 1.0) / (u_ior + 1.0), 2.0);\n  float cosT = clamp(N.z, 0.0, 1.0);\n  float F = F0 + (1.0 - F0) * pow(1.0 - cosT, 3.0);\n  float fa = clamp(F * u_fresnel * m.rim, 0.0, 1.0);\n  if (fa > 0.002) {\n    // 边缘反射：把玻璃外侧的内容沿边界镜像、压缩进边缘（边缘会“沾上”外面的颜色）\n    vec2 rp = p + n2 * (dIn * 1.6 + w * 0.35);\n    vec3 env = bgAt(rp, max(frost * 0.6, 2.0 * u_px));\n    env = mix(env, vec3(1.0), 0.12) * 1.06;\n    c = mix(c, env, fa);\n  }\n\n  // ---- 镜面眩光：颜色取自下方内容（OKLab 提亮 + 提纯）----\n  float nl = dot(n2, u_L);\n  float ang = pow(max(nl, 0.0), u_glareConv) + u_glareFar * pow(max(-nl, 0.0), u_glareConv);\n  float geo = exp(-dIn / max(u_glareR, 0.5));\n  float gla = clamp(ang * geo * u_glareI * m.rim, 0.0, 1.0);\n  if (gla > 0.001) {\n    vec3 lab = rgb2oklab(c);\n    lab.x += (1.02 - lab.x) * 0.9 * gla;\n    lab.yz *= 1.0 + 1.4 * gla;\n    c = clamp(oklab2rgb(lab), 0.0, 1.0);\n    c = mix(c, vec3(1.0), gla * gla * 0.3);\n  }\n\n  // ---- 边缘高光细线（迎光侧强、背光侧弱）----\n  float rimM = 1.0 - smoothstep(u_rimW * 0.3, u_rimW, dIn);\n  float ra = abs(nl);\n  float rimA = mix(0.25, 1.0, pow(ra, 1.6)) * (nl >= 0.0 ? 1.0 : u_rimFar);\n  c = mix(c, vec3(1.0), clamp(rimM * rimA * u_rimI * m.rim, 0.0, 1.0));\n\n  // ---- 触摸发光：从内部被点亮，并扩散到附近的玻璃 ----\n  if (u_glow.w > 0.001) {\n    float dd = length(p - u_glow.xy) / max(u_glow.z, 1.0);\n    float gw = exp(-dd * dd) * u_glow.w;\n    c += vec3(0.28) * gw;\n    c = mix(c, vec3(1.0), clamp(rimM * gw * 0.8, 0.0, 1.0));\n  }\n\n  // ---- 实心旋钮（静止状态的滑块/开关）----\n  if (m.white > 0.001) c = mix(c, vec3(0.995), clamp(m.white, 0.0, 1.0));\n  return c;\n}\n\nvec4 spriteAt(int i, vec2 p){\n  vec4 r = u_spR[i]; vec4 x = u_spX[i];\n  vec2 lp = (p - x.zw) / max(x.y, 0.01) + x.zw;\n  vec2 uv = (lp - r.xy) / r.zw;\n  if (uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0) return vec4(0.0);\n  vec4 t;\n  if (i == 0) t = textureLod(u_sp0, uv, 0.0);\n  else if (i == 1) t = textureLod(u_sp1, uv, 0.0);\n  else if (i == 2) t = textureLod(u_sp2, uv, 0.0);\n  else if (i == 3) t = textureLod(u_sp3, uv, 0.0);\n  else if (i == 4) t = textureLod(u_sp4, uv, 0.0);\n  else t = textureLod(u_sp5, uv, 0.0);\n  t.a *= x.x;\n  return t;\n}\n\nvoid main(){\n  vec2 p = vec2(gl_FragCoord.x, u_res.y - gl_FragCoord.y);\n  vec2 uv0 = gl_FragCoord.xy / u_res;\n  vec3 col = textureLod(u_bg0, uv0, 0.0).rgb;\n  float dU = mapAll(p);\n\n  if (u_debug == 1) {                       // SDF 等值线视图\n    vec3 base = dU > 0.0 ? vec3(0.95, 0.62, 0.32) : vec3(0.45, 0.72, 1.0);\n    float k = abs(dU) / (8.0 * u_px);\n    base *= 0.72 + 0.28 * smoothstep(0.35, 0.5, abs(fract(k) - 0.5) * 2.0);\n    base *= 1.0 - exp(-abs(dU) / (40.0 * u_px)) * 0.5;\n    base = mix(base, vec3(1.0), 1.0 - smoothstep(0.5, 1.5, abs(dU)));\n    o = vec4(mix(col * 0.25, base, 0.92), 1.0);\n    return;\n  }\n\n  float adaptHere = 0.5;\n  if (u_shA > 0.0 && dU > -2.0) col *= 1.0 - shadowAt(p);\n\n  if (dU < 1.0) {\n    M m = evalM(p);\n    adaptHere = m.adapt;\n    vec3 g = shade(p, dU, m);\n    float cov = clamp(0.5 - dU, 0.0, 1.0) * clamp(m.op, 0.0, 1.0);\n    col = mix(col, g, cov);\n  }\n\n  if (u_pass == 0) {\n    float lightBg = adaptHere;\n    for (int f = 0; f < MAXF; f++) {\n      if (f >= u_nf) break;\n      vec4 g = u_f0[f];\n      vec2 q = abs(p - g.xy) - g.zw;\n      if (max(q.x, q.y) > 2.0) continue;\n      vec4 cl = u_f1[f]; vec4 e = u_f2[f];\n      float d = sdRR(p - g.xy, g.zw, e.x, 2.0);\n      float a = clamp(0.5 - d, 0.0, 1.0) * cl.a;\n      vec3 fc = cl.rgb;\n      if (e.y > 0.5) {                        // 自适应中性色：亮背景用黑、暗背景用白\n        fc = mix(vec3(1.0), vec3(0.0), lightBg);\n        a *= mix(1.5, 0.85, lightBg);\n      }\n      col = mix(col, fc, clamp(a, 0.0, 1.0));\n    }\n    for (int i = 0; i < MAXSP; i++) {\n      if (i >= u_nsp) break;\n      vec4 t = spriteAt(i, p);\n      if (t.a < 0.002) continue;\n      float mx = max(t.r, max(t.g, t.b));\n      float sat = mx - min(t.r, min(t.g, t.b));\n      vec3 gc = t.rgb;\n      float a = t.a;\n      if (sat < 0.08) {                       // 白色图形 → 自适应（亮背景深色、暗背景白色）\n        gc = mix(vec3(1.0), vec3(0.07, 0.07, 0.09), lightBg);\n        a *= mix(0.4, 1.0, mx);\n      }\n      col = mix(col, gc, clamp(a, 0.0, 1.0));\n    }\n  }\n  o = vec4(col, 1.0);\n}"};

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
    el.style.setProperty('--lg-pill', tone === 'light' ? 'rgba(0,0,0,.075)' : 'rgba(255,255,255,.16)');
  }

  /* ================================================================== *
   * Motion — the animation layer shared by both engines
   *   press: energize (springy scale) + glow at the touch point
   *   drag:  spring-follow, jelly stretch along the velocity, throw with
   *          inertia, rubber-band bounds, snap points, axis lock, snap-back
   * ================================================================== */
  const emit = (el, name, detail) => el.dispatchEvent(new CustomEvent(name, { detail, bubbles: true }));
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
  function retune(sp, response, damping) { sp.k = (2 * Math.PI / response) ** 2; sp.c = (4 * Math.PI * damping) / response; }
  function boundsRect(b, el, host) {
    if (b === false || b === null) return null;
    if (b === 'window') return { left: 0, top: 0, right: innerWidth, bottom: innerHeight };
    let e = null;
    if (b instanceof Element) e = b;
    else if (b === 'parent') e = el.parentElement;
    else if (typeof b === 'string' && b !== 'container') e = $(b);
    else e = host || el.offsetParent || el.parentElement;
    return e ? e.getBoundingClientRect() : null;
  }

  class Motion {
    constructor(el, o, host) {
      this.el = el; this.o = o; this.host = host;
      this.ox = new Spring(0, 0.2, 0.74); this.oy = new Spring(0, 0.2, 0.74);
      this.press = new Spring(0, 0.3, 0.55);
      this.jelly = new Jelly(o.jelly == null ? 1 : o.jelly);
      this.pressScale = o.pressScale == null ? (o.draggable ? 0.06 : 0.05) : o.pressScale;
      const d = o.draggable;
      this.drag = d ? Object.assign({ bounds: 'container', inertia: true, snapBack: false, axis: null, snap: null }, d === true ? {} : d) : null;
      this.saved = { translate: el.style.translate, scale: el.style.scale, touchAction: el.style.touchAction, cursor: el.style.cursor, userSelect: el.style.userSelect, webkitUserSelect: el.style.webkitUserSelect };
      if (this.drag) { el.style.touchAction = 'none'; el.style.cursor = 'grab'; el.style.userSelect = 'none'; el.style.webkitUserSelect = 'none'; }
      this.pid = null;
      this._down = (e) => this.down(e);
      this._move = (e) => this.move(e);
      this._up = (e) => this.up(e);
      el.addEventListener('pointerdown', this._down);
      el.addEventListener('pointermove', this._move);
      window.addEventListener('pointerup', this._up);
      window.addEventListener('pointercancel', this._up);
      this.last = '';
    }
    down(e) {
      if (e.button) return;
      this.pid = e.pointerId;
      this.press.t = 1;
      if (this.host.glow) this.host.glow(e, true);
      if (!this.drag) return;
      e.preventDefault();
      try { this.el.setPointerCapture(e.pointerId); } catch (err) { /* synthetic event */ }
      this.dragging = true;
      this.start = { x: e.clientX, y: e.clientY, ox: this.ox.t, oy: this.oy.t };
      this.samples = [{ x: e.clientX, y: e.clientY, t: performance.now() }];
      this.lim = this.limits();
      retune(this.ox, 0.18, 0.74); retune(this.oy, 0.18, 0.74);
      this.el.style.cursor = 'grabbing';
      emit(this.el, 'lg:dragstart', { x: this.ox.t, y: this.oy.t });
    }
    move(e) {
      if (e.pointerId !== this.pid) return;
      if (this.host.glow) this.host.glow(e);
      if (!this.dragging) return;
      const now = performance.now();
      this.samples.push({ x: e.clientX, y: e.clientY, t: now });
      while (this.samples.length > 2 && now - this.samples[0].t > 90) this.samples.shift();
      let tx = this.start.ox + (e.clientX - this.start.x), ty = this.start.oy + (e.clientY - this.start.y);
      if (this.drag.axis === 'x') ty = this.start.oy;
      if (this.drag.axis === 'y') tx = this.start.ox;
      if (this.lim) { tx = this.rubber(tx, this.lim.minX, this.lim.maxX); ty = this.rubber(ty, this.lim.minY, this.lim.maxY); }
      this.ox.t = tx; this.oy.t = ty;
      emit(this.el, 'lg:drag', { x: tx, y: ty });
    }
    up(e) {
      if (e.pointerId !== this.pid) return;
      this.pid = null;
      this.press.t = 0;
      if (this.host.glow) this.host.glow(e, false);
      if (!this.dragging) return;
      this.dragging = false;
      const s = this.samples, a = s[0], b = s[s.length - 1];
      const dts = Math.max(0.016, (b.t - a.t) / 1000);
      let vx = (b.x - a.x) / dts, vy = (b.y - a.y) / dts;
      if (performance.now() - b.t > 80) vx = vy = 0;
      if (this.drag.axis === 'x') vy = 0;
      if (this.drag.axis === 'y') vx = 0;
      let tx = this.ox.t, ty = this.oy.t;
      if (this.drag.snapBack) { tx = 0; ty = 0; }
      else {
        if (this.drag.inertia) { tx += vx * 0.16; ty += vy * 0.16; }
        if (this.lim) { tx = clamp(tx, this.lim.minX, this.lim.maxX); ty = clamp(ty, this.lim.minY, this.lim.maxY); }
        const sn = this.drag.snap;
        if (typeof sn === 'function') { const p = sn({ x: tx, y: ty, vx, vy }); if (p) { tx = p.x; ty = p.y; } }
        else if (Array.isArray(sn) && sn.length) {
          let best = sn[0], bd = Infinity;
          for (const p of sn) { const dd = Math.hypot(p.x - tx, p.y - ty); if (dd < bd) { bd = dd; best = p; } }
          tx = best.x; ty = best.y;
        }
      }
      retune(this.ox, 0.5, 0.68); retune(this.oy, 0.5, 0.68);
      this.ox.t = tx; this.oy.t = ty;
      this.el.style.cursor = 'grab';
      emit(this.el, 'lg:dragend', { x: tx, y: ty, vx, vy });
    }
    limits() {
      const br = boundsRect(this.drag.bounds, this.el, this.host.boundsEl);
      if (!br) return null;
      const r = this.el.getBoundingClientRect();
      const lx = r.left - this.ox.v, rx = r.right - this.ox.v, ty = r.top - this.oy.v, by = r.bottom - this.oy.v;
      return { minX: br.left - lx, maxX: Math.max(br.left - lx, br.right - rx), minY: br.top - ty, maxY: Math.max(br.top - ty, br.bottom - by) };
    }
    rubber(v, lo, hi) {
      const f = (o) => (1 - 1 / ((o * 0.5) / 300 + 1)) * 300;
      return v < lo ? lo - f(lo - v) : v > hi ? hi + f(v - hi) : v;
    }
    moveTo(x, y, animate = true) {
      this.ox.t = x; this.oy.t = y;
      if (!animate) { this.ox.v = x; this.oy.v = y; this.ox.vel = 0; this.oy.vel = 0; }
    }
    get busy() {
      return this.dragging || Math.abs(this.ox.vel) + Math.abs(this.oy.vel) > 0.5 ||
        Math.abs(this.ox.t - this.ox.v) + Math.abs(this.oy.t - this.oy.v) > 0.05 ||
        Math.abs(this.press.t - this.press.v) > 0.002 || Math.abs(this.press.vel) > 0.01 || Math.abs(this.jelly.amt.v) > 0.002;
    }
    /** advances springs and writes CSS; cssJelly approximates the jelly with an axis-aligned CSS scale (DOM engine). */
    step(dt, cssJelly) {
      this.ox.step(dt); this.oy.step(dt); this.press.step(dt);
      this.jelly.update(this.ox.vel, this.oy.vel, dt);
      const j = this.jelly.get();
      const p = 1 + this.pressScale * this.press.v;
      let sx = p, sy = p;
      if (cssJelly && j.s > 0.001) {
        const su = 1 + j.s, sv = 1 / Math.sqrt(su), c = Math.cos(j.sa) ** 2, s = 1 - c;
        sx *= su * c + sv * s; sy *= su * s + sv * c;
      }
      const key = this.ox.v.toFixed(2) + ',' + this.oy.v.toFixed(2) + ',' + sx.toFixed(4) + ',' + sy.toFixed(4);
      if (key !== this.last) {
        this.last = key;
        this.el.style.translate = Math.abs(this.ox.v) + Math.abs(this.oy.v) < 0.01 ? this.saved.translate : this.ox.v + 'px ' + this.oy.v + 'px';
        this.el.style.scale = Math.abs(sx - 1) + Math.abs(sy - 1) < 0.0005 ? this.saved.scale : sx + ' ' + sy;
      }
      return j;
    }
    destroy() {
      this.el.removeEventListener('pointerdown', this._down);
      this.el.removeEventListener('pointermove', this._move);
      window.removeEventListener('pointerup', this._up);
      window.removeEventListener('pointercancel', this._up);
      Object.assign(this.el.style, this.saved);
    }
  }

  /* Tab bar: a resting pill under the selected item; press & slide lifts it into a glass droplet. */
  class TabBar {
    constructor(bar, o, engine) {
      this.bar = bar; this.o = o || {}; this.engine = engine;
      const sel = this.o.items;
      this.items = sel ? (typeof sel === 'string' ? Array.from(bar.querySelectorAll(sel)) : Array.from(sel)) : Array.from(bar.children);
      this.sel = clamp(this.o.selected || 0, 0, Math.max(0, this.items.length - 1));
      this.x = new Spring(0, 0.3, 0.72);
      this.lift = new Spring(0, 0.32, 0.6);
      this.jelly = new Jelly(1.1);
      this.saved = { position: bar.style.position, isolation: bar.style.isolation, touchAction: bar.style.touchAction };
      if (getComputedStyle(bar).position === 'static') bar.style.position = 'relative';
      bar.style.isolation = 'isolate';
      bar.style.touchAction = 'none';
      const pill = (this.pill = document.createElement('div'));
      pill.className = 'lg-tab-pill';
      pill.setAttribute('aria-hidden', 'true');
      pill.style.cssText = 'position:absolute;left:0;top:0;z-index:-1;pointer-events:none;border-radius:999px;background:var(--lg-pill,rgba(127,127,127,.16));';
      bar.prepend(pill);
      this.items.forEach((it, i) => {
        it.classList.toggle('lg-selected', i === this.sel);
        it.style.transition = (it.style.transition ? it.style.transition + ',' : '') + 'scale .35s cubic-bezier(.34,1.56,.64,1)';
      });
      this.pid = null;
      this._down = (e) => this.down(e);
      this._move = (e) => this.move(e);
      this._up = (e) => this.up(e);
      bar.addEventListener('pointerdown', this._down);
      bar.addEventListener('pointermove', this._move);
      window.addEventListener('pointerup', this._up);
      window.addEventListener('pointercancel', this._up);
      this.inited = false;
    }
    geo() {
      const br = this.bar.getBoundingClientRect();
      const cs = this.items.map((it) => { const r = it.getBoundingClientRect(); return { cx: r.left - br.left + r.width / 2, w: r.width }; });
      return { br, cs };
    }
    nearest(x) {
      const { cs } = this.geo();
      let bi = 0, bd = Infinity;
      cs.forEach((c, i) => { const d = Math.abs(c.cx - x); if (d < bd) { bd = d; bi = i; } });
      return bi;
    }
    down(e) {
      if (e.button) return;
      this.pid = e.pointerId;
      try { this.bar.setPointerCapture(e.pointerId); } catch (err) { /* synthetic */ }
      const br = this.bar.getBoundingClientRect();
      this.lift.t = 1;
      this.x.t = this.clampX(e.clientX - br.left);
      if (this.engine.glow) this.engine.glow(e, true, 1);
    }
    move(e) {
      if (e.pointerId !== this.pid) return;
      const br = this.bar.getBoundingClientRect();
      this.x.t = this.clampX(e.clientX - br.left);
      if (this.engine.glow) this.engine.glow(e, undefined, 1);
    }
    up(e) {
      if (e.pointerId !== this.pid) return;
      this.pid = null;
      this.select(this.nearest(this.x.t));
      this.lift.t = 0;
      if (this.engine.glow) this.engine.glow(e, false, 1);
    }
    clampX(x) {
      const { cs, br } = this.geo();
      if (!cs.length) return x;
      return clamp(x, cs[0].cx - 8, Math.min(br.width, cs[cs.length - 1].cx + 8));
    }
    select(i, animate = true) {
      i = clamp(i, 0, this.items.length - 1);
      const { cs } = this.geo();
      if (cs[i]) this.x.t = cs[i].cx;
      if (!animate) { this.x.v = this.x.t; this.x.vel = 0; }
      if (i !== this.sel) {
        this.sel = i;
        this.items.forEach((it, k) => it.classList.toggle('lg-selected', k === i));
        if (this.o.onChange) this.o.onChange(i);
        emit(this.bar, 'lg:change', { index: i });
      }
    }
    /** advances springs, positions the resting pill; returns droplet geometry relative to the bar (CSS px) */
    step(dt) {
      if (!this.inited) { this.inited = true; this.select(this.sel, false); }
      if (this.pid === null && this.lift.t === 0) { const g = this.geo(); if (g.cs[this.sel]) this.x.t = g.cs[this.sel].cx; }
      this.x.step(dt); this.lift.step(dt);
      this.jelly.update(this.x.vel, 0, dt);
      const { br, cs } = this.geo();
      const iw = cs.length ? cs[Math.min(this.sel, cs.length - 1)].w : 60;
      const lift = clamp(this.lift.v, 0, 1.25);
      const ph = br.height - 8, pw = Math.max(iw, ph);
      const w = lerp(pw, pw + 18, lift), h = lerp(ph, br.height + 16, lift);
      const pa = 1 - sstep(0, 0.35, lift);
      this.pill.style.width = pw + 'px';
      this.pill.style.height = ph + 'px';
      this.pill.style.translate = (this.x.v - pw / 2) + 'px ' + (br.height - ph) / 2 + 'px';
      this.pill.style.opacity = pa.toFixed(3);
      const under = this.nearest(this.x.v);
      this.items.forEach((it, k) => { const s = lift > 0.3 && k === under ? '1.12' : ''; if (it.style.scale !== s) it.style.scale = s; });
      return { br, x: this.x.v, y: br.height / 2, w, h, lift, jelly: this.jelly.get() };
    }
    get busy() { return this.pid !== null || Math.abs(this.x.vel) > 0.5 || Math.abs(this.x.t - this.x.v) > 0.05 || Math.abs(this.lift.v) > 0.002 || Math.abs(this.lift.vel) > 0.01 || !this.inited; }
    destroy() {
      this.bar.removeEventListener('pointerdown', this._down);
      this.bar.removeEventListener('pointermove', this._move);
      window.removeEventListener('pointerup', this._up);
      window.removeEventListener('pointercancel', this._up);
      this.pill.remove();
      this.items.forEach((it) => { it.classList.remove('lg-selected'); it.style.scale = ''; });
      Object.assign(this.bar.style, this.saved);
    }
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
      this.glow0 = { x: 0, y: 0, a: new Spring(0, 0.22, 1) };
      this.glow1 = { x: 0, y: 0, a: new Spring(0, 0.22, 1) };
      this.tabbars = [];

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
      free(this.sceneT); free(this.A); this.lv.forEach(free);
      this.sceneT = this._target(cw, ch);
      this.A = this._target(cw, ch);
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
        if ((this.P.interactive && it.o.interactive !== false) || it.o.draggable) {
          it.motion = new Motion(el, it.o, { glow: (e, on) => this.glow(e, on, 0), boundsEl: this.container });
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
        if (it.motion) it.motion.destroy();
        return false;
      });
    }
    glow(e, on, layer) {
      const g = layer ? this.glow1 : this.glow0;
      const r = this.canvas.getBoundingClientRect();
      g.x = e.clientX - r.left; g.y = e.clientY - r.top;
      if (on === true) g.a.t = 1;
      else if (on === false) g.a.t = 0;
    }
    tabbar(target, o) {
      const bar = $(target);
      if (!bar) return null;
      if (!this.items.some((i) => i.el === bar)) this.add(bar, Object.assign({ role: 'tabbar', interactive: false }, (o && o.glass) || {}));
      const it = this.items.find((i) => i.el === bar);
      if (it && it.motion) { it.motion.destroy(); it.motion = null; }
      const tb = new TabBar(bar, o, this);
      tb.item = it;
      this.tabbars.push(tb);
      return tb;
    }
    item(el) { const e = $(el); return this.items.find((i) => i.el === e); }
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
      this.glow0.a.step(dt); this.glow1.a.step(dt);
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
        it.adapt.step(dt);
        const jl = it.motion ? it.motion.step(dt, false) : null;
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
        const sc = 1;
        const rad = o.radius != null ? o.radius : parseRadius(it.el, w, h);
        const frost = o.frost != null ? o.frost : per.frost != null ? per.frost : P.frost;
        const bez = o.bezel != null ? o.bezel : per.bezel != null ? per.bezel : 0;
        const thick = o.thickness != null ? o.thickness / P.thickness : per.thickness != null ? per.thickness / P.thickness : 1;
        shapes.push({
          x, y, w: w * sc, h: h * sc, r: rad * sc, g: it.group, sa: jl ? jl.sa : 0, s: jl ? jl.s : 0,
          tint: o.tint ? [...hexRGB(o.tint), o.tintA == null ? 0.25 : o.tintA] : P.tintA > 0 ? [...hexRGB(P.tint), P.tintA] : [1, 1, 1, 0],
          frost, adapt: it.adapt.v, zoom: o.zoom || per.zoom || P.zoom,
          veil: (o.veil != null ? o.veil : per.veil != null ? per.veil : P.veil) / Math.max(P.veil, 1e-3),
          rim: o.rim != null ? o.rim : per.rimI != null ? per.rimI / Math.max(P.rimI, 1e-3) : 1,
          bezel: bez, thick, refr: o.refr != null ? o.refr : per.refr != null ? per.refr : 1,
          sh: o.shadow != null ? o.shadow : per.shadowA != null ? per.shadowA / Math.max(P.shadowA, 1e-3) : 1,
        });
      }

      // ---- top layer: tab bar droplets (refract the base glass) ----
      const top = [];
      this.tabbars.forEach((tb, i) => {
        const g = tb.step(dt);
        if (g.lift < 0.004) return;
        const bx = g.br.left - cr.left, by = g.br.top - cr.top;
        const adapt = tb.item ? tb.item.adapt.v : 0.5;
        top.push({ x: bx + g.x, y: by + g.y, w: g.w, h: g.h, r: g.h / 2, g: 900 + i, sa: g.jelly.sa, s: g.jelly.s, op: sstep(0, 0.3, g.lift),
          tint: [1, 1, 1, 0], frost: 0, adapt, zoom: 1 + 0.12 * clamp(g.lift, 0, 1.2), veil: 0.3, rim: 1, bezel: 0, thick: 1, refr: 1, sh: 0.6 });
      });

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
      gl.uniform4f(u.u_glow, this.glow0.x * k, this.glow0.y * k, 70 * k, clamp(this.glow0.a.v, 0, 1.2) * 0.8);
      gl.uniform1i(u.u_debug, 0); gl.uniform1i(u.u_lazy, 0);
      gl.uniform1i(u.u_nf, 0); gl.uniform1i(u.u_nsp, 0);
      this._uploadShapes(u, shapes);
      if (top.length) gl.bindFramebuffer(gl.FRAMEBUFFER, this.A.fbo);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      if (top.length) {
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.A.tex);
        gl.uniform1f(u.u_shR, P.shadowR * 0.45 * k); gl.uniform2f(u.u_shOff, 0, P.shadowY * 0.4 * k);
        gl.uniform4f(u.u_glow, this.glow1.x * k, this.glow1.y * k, 60 * k, clamp(this.glow1.a.v, 0, 1.2) * 0.35);
        this._uploadShapes(u, top);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
      }
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
        U.g1.set([R, cn, s.sa || 0, s.s || 0], i * 4);
        U.g2.set([s.g, s.op == null ? 1 : s.op, s.sh, s.refr], i * 4);
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
      this.tabbars.forEach((t) => t.destroy());
      this.tabbars = [];
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
      this.tabbars = [];
      this._last = performance.now();
      this._tick = (now) => {
        this._raf = requestAnimationFrame(this._tick);
        const dt = Math.min(0.05, Math.max(0.001, (now - this._last) / 1000));
        this._last = now;
        for (const it of this.items) if (it.motion && it.motion.busy) it.motion.step(dt, true);
        for (const tb of this.tabbars) if (tb.busy) this._stepTab(tb, dt);
      };
      this._raf = requestAnimationFrame(this._tick);
    }
    _schedule(it) { clearTimeout(it.timer); it.timer = setTimeout(() => this._apply(it), 40); }
    add(target, o) {
      const out = [];
      for (const el of $$(target)) {
        const it = { el, o: Object.assign({}, o || {}), id: 'lg-f' + ++filterSeq, saved: { backdropFilter: el.style.backdropFilter, webkitBackdropFilter: el.style.webkitBackdropFilter, background: el.style.background, boxShadow: el.style.boxShadow, transition: el.style.transition, transform: el.style.transform } };
        el.classList.add('lg-glass');
        if ((this.P.interactive && it.o.interactive !== false) || it.o.draggable) {
          it.motion = new Motion(el, it.o, { boundsEl: el.offsetParent || el.parentElement });
        }
        this.items.push(it);
        this._ro.observe(el);
        this._apply(it);
        out.push(it);
      }
      return out;
    }
    _params(it) {
      const br = it.el.getBoundingClientRect();
      // layout size (unaffected by the press / jelly transforms, so maps are not re-baked while animating)
      const r = { width: it.el.offsetWidth || br.width, height: it.el.offsetHeight || br.height };
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
    item(el) { const e = $(el); return this.items.find((i) => i.el === e); }
    tabbar(target, o) {
      const bar = $(target);
      if (!bar) return null;
      if (!this.items.some((i) => i.el === bar)) this.add(bar, Object.assign({ role: 'tabbar', interactive: false }, (o && o.glass) || {}));
      const it = this.items.find((i) => i.el === bar);
      if (it && it.motion) { it.motion.destroy(); it.motion = null; }
      const tb = new TabBar(bar, o, this);
      // the droplet: a glass element above the items, so it magnifies the icons beneath it
      const drop = (tb.drop = document.createElement('div'));
      drop.className = 'lg-tab-drop';
      drop.setAttribute('aria-hidden', 'true');
      drop.style.cssText = 'position:absolute;left:0;top:0;z-index:2;pointer-events:none;border-radius:999px;opacity:0;';
      bar.appendChild(drop);
      tb.dropSize = null;
      this.tabbars.push(tb);
      return tb;
    }
    _stepTab(tb, dt) {
      const g = tb.step(dt);
      const pw = g.w - 18 * clamp(tb.lift.v, 0, 1.25), ph = g.br.height - 8;
      const W = Math.round(Math.max(pw, ph) + 18), H = Math.round(g.br.height + 16);
      if (!tb.dropSize || tb.dropSize[0] !== W || tb.dropSize[1] !== H) {
        tb.dropSize = [W, H];
        tb.drop.style.width = W + 'px';
        tb.drop.style.height = H + 'px';
        const ex = this.items.find((i) => i.el === tb.drop);
        if (ex) this._apply(ex);
        else this.add(tb.drop, { interactive: false, frost: 0, veil: 0.01, shadowA: 0.12, shadowR: 14, shadowY: 4, radius: H / 2, tone: tb.bar.dataset.lgTone || pageTone(tb.bar) });
      }
      const su = g.w / W, sv = g.h / H;
      const j = g.jelly;
      const st = 1 + j.s, sq = 1 / Math.sqrt(st);
      tb.drop.style.translate = (g.x - W / 2) + 'px ' + (g.y - H / 2) + 'px';
      tb.drop.style.scale = (su * st) + ' ' + (sv * sq);
      tb.drop.style.opacity = sstep(0, 0.3, g.lift).toFixed(3);
    }
    remove(target) {
      const els = $$(target);
      this.items = this.items.filter((it) => {
        if (!els.includes(it.el)) return true;
        this._ro.unobserve(it.el);
        if (it.filter) it.filter.remove();
        Object.assign(it.el.style, it.saved);
        it.el.classList.remove('lg-glass');
        if (it.motion) it.motion.destroy();
        return false;
      });
    }
    destroy() {
      cancelAnimationFrame(this._raf);
      this.tabbars.forEach((t) => { t.destroy(); t.drop.remove(); });
      this.tabbars = [];
      this.remove(this.items.map((i) => i.el));
      this._ro.disconnect();
    }
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
      /** Animated tab bar: resting pill + liquid droplet on press & slide. Returns a controller with select(i). */
      tabbar(t, o) { return engine.tabbar(t, o); },
      /** Programmatically move a draggable element (offset from its layout position, CSS px). */
      moveTo(t, x, y, animate = true) { const it = engine.item(t); if (it && it.motion) it.motion.moveTo(x, y, animate); return api; },
      get params() { return engine.P; },
      destroy() { engine.destroy(); },
      _engine: engine,
    };
    return api;
  }

  return {
    version: '1.1.0',
    create,
    recommend,
    presets: PRESETS,
    defaults: DEFAULTS,
    bakeMaps,
    Spring,
    supports: { webgl2: typeof document !== 'undefined' && !!document.createElement('canvas').getContext('webgl2'), svgBackdrop: isChromium },
  };
});
