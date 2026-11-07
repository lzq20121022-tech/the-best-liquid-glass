/* =====================================================================
 *  液态玻璃 · GLSL 着色器
 *  所有坐标在着色器内统一为「画布像素、左上角为原点、y 向下」。
 * ===================================================================== */
window.LG = window.LG || {};
LG.SH = {};

/* 全屏三角形，无顶点属性 */
LG.SH.vert = `#version 300 es
void main(){
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

/* ---------------------------------------------------------------------
 * 1) 场景：图文/网格内容纹理（可滚动）、程序化动态壁纸、照片/视频
 * ------------------------------------------------------------------- */
LG.SH.scene = `#version 300 es
precision highp float;
uniform vec2  u_res;
uniform int   u_mode;      // 0 内容纹理 1 壁纸 2 图片/视频
uniform sampler2D u_tex;
uniform vec2  u_texSize;
uniform float u_scroll;    // 画布像素
uniform float u_cscale;    // 内容纹理像素 / 画布像素
uniform vec3  u_page;
uniform vec2  u_edge;      // 顶部/底部渐隐高度
uniform float u_edgeAmt;
uniform float u_time;
uniform vec4  u_img;       // 图片在画布上的 offset.xy, size.xy
out vec4 o;

vec3 hsv(float h, float s, float v){
  vec3 k = clamp(abs(mod(h * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0);
  return v * mix(vec3(1.0), k, s);
}

vec3 wallpaper(vec2 p){
  float t = u_time * 0.08;
  vec2 uv = p / u_res.y;
  float asp = u_res.x / u_res.y;
  vec3 cols[5];
  cols[0] = vec3(1.00, 0.33, 0.45);
  cols[1] = vec3(0.30, 0.40, 1.00);
  cols[2] = vec3(0.10, 0.86, 0.78);
  cols[3] = vec3(1.00, 0.72, 0.20);
  cols[4] = vec3(0.62, 0.26, 0.98);
  vec3 acc = vec3(0.0); float ws = 0.0;
  for (int i = 0; i < 5; i++) {
    float fi = float(i);
    vec2 c = vec2(asp * (0.5 + 0.38 * sin(t * (0.7 + 0.13 * fi) + fi * 1.9)),
                  0.5 + 0.36 * cos(t * (0.9 + 0.11 * fi) + fi * 2.7));
    float d = length(uv - c);
    float w = exp(-d * d * 5.0) + 0.002;
    acc += cols[i] * w; ws += w;
  }
  vec3 col = acc / ws;
  col = mix(col, col * col * 1.4, 0.25);
  // 细白色正弦线：用来观察折射
  for (int k = 0; k < 9; k++) {
    float fk = float(k);
    float yk = (fk + 0.5) / 9.0 + 0.03 * sin(uv.x * 3.5 + t * 3.0 + fk * 1.7);
    float dpx = abs(uv.y - yk) * u_res.y;
    col = mix(col, vec3(1.0), (1.0 - smoothstep(0.6, 2.0, dpx)) * 0.6);
  }
  // 同心圆环
  vec2 rc = vec2(asp * (0.5 + 0.18 * sin(t * 0.8)), 0.5 + 0.12 * cos(t * 0.6));
  float rr = length(uv - rc) * 7.0 - t * 0.6;
  float ring = abs(fract(rr) - 0.5) / 7.0 * u_res.y;
  col = mix(col, col * 0.55, (1.0 - smoothstep(0.8, 2.6, ring)) * 0.45);
  // 斜向窄条纹
  float st = abs(fract((p.x + p.y) / (u_res.y * 0.045)) - 0.5);
  col = mix(col, col * 1.12 + 0.03, step(0.42, st) * 0.35);
  return clamp(col, 0.0, 1.0);
}

void main(){
  vec2 p = vec2(gl_FragCoord.x, u_res.y - gl_FragCoord.y);
  vec3 c;
  if (u_mode == 0) {
    vec2 cp = vec2(p.x, p.y + u_scroll) * u_cscale;
    vec2 uv = cp / u_texSize;
    c = (uv.y < 0.0 || uv.y > 1.0) ? u_page : textureLod(u_tex, uv, 0.0).rgb;
    if (u_edgeAmt > 0.0) {
      float ft = 1.0 - smoothstep(0.0, u_edge.x, p.y);
      float fb = 1.0 - smoothstep(0.0, u_edge.y, u_res.y - p.y);
      float f = max(ft * ft, fb * fb) * u_edgeAmt;
      c = mix(c, u_page, f);
    }
  } else if (u_mode == 1) {
    c = wallpaper(p);
  } else {
    vec2 uv = (p - u_img.xy) / u_img.zw;
    c = textureLod(u_tex, clamp(uv, 0.0, 1.0), 0.0).rgb;
  }
  o = vec4(c, 1.0);
}`;

/* ---------------------------------------------------------------------
 * 2) 13-tap 降采样（Jimenez / CoD 方案），构建模糊金字塔
 * ------------------------------------------------------------------- */
LG.SH.down = `#version 300 es
precision highp float;
uniform sampler2D u_src;
uniform vec2 u_texel;   // 1/源尺寸
uniform vec2 u_dst;     // 目标尺寸
out vec4 o;
vec3 T(vec2 uv){ return textureLod(u_src, uv, 0.0).rgb; }
void main(){
  vec2 uv = gl_FragCoord.xy / u_dst;
  vec2 t = u_texel;
  vec3 a = T(uv + t * vec2(-2.0,  2.0)), b = T(uv + t * vec2(0.0,  2.0)), c = T(uv + t * vec2(2.0,  2.0));
  vec3 d = T(uv + t * vec2(-2.0,  0.0)), e = T(uv),                       f = T(uv + t * vec2(2.0,  0.0));
  vec3 g = T(uv + t * vec2(-2.0, -2.0)), h = T(uv + t * vec2(0.0, -2.0)), i = T(uv + t * vec2(2.0, -2.0));
  vec3 j = T(uv + t * vec2(-1.0,  1.0)), k = T(uv + t * vec2(1.0,  1.0));
  vec3 l = T(uv + t * vec2(-1.0, -1.0)), m = T(uv + t * vec2(1.0, -1.0));
  vec3 r = e * 0.125 + (a + c + g + i) * 0.03125 + (b + d + f + h) * 0.0625 + (j + k + l + m) * 0.125;
  o = vec4(r, 1.0);
}`;

/* ---------------------------------------------------------------------
 * 3) 液态玻璃合成
 *    pass 0：底层玻璃 + 平面元素 + 图标精灵
 *    pass 1：顶层玻璃（采样 pass 0 的结果 → 可以折射下层玻璃和图标）
 * ------------------------------------------------------------------- */
LG.SH.glass = `#version 300 es
precision highp float;
precision highp int;
out vec4 o;

#define MAXS 10
#define MAXF 8
#define MAXSP 6
#define PI 3.14159265359

uniform vec2  u_res;
uniform int   u_pass;
uniform float u_px;
uniform sampler2D u_bg0, u_bg1, u_bg2, u_bg3, u_bg4, u_bg5, u_bg6;
uniform float u_lodBias;

// ---- 形状（每个 6 个 vec4）----
uniform int  u_n;
uniform vec4 u_g0[MAXS];   // cx, cy, 半宽, 半高
uniform vec4 u_g1[MAXS];   // 圆角R, 超椭圆指数n, 拉伸角, 拉伸量
uniform vec4 u_g2[MAXS];   // 融合组, 不透明度, 阴影系数, 折射系数
uniform vec4 u_m0[MAXS];   // 着色 rgb, 着色量
uniform vec4 u_m1[MAXS];   // 磨砂px, 实心白, 明暗(1=亮背景), 中心放大
uniform vec4 u_m2[MAXS];   // 薄纱系数, 高光系数, 边缘宽度覆盖px(0=全局), 厚度系数

// ---- 光学 ----
uniform float u_ior, u_disp;
uniform int   u_dispN;
uniform vec4  u_dw[16];    // rgb 光谱权重, w = 波长位置 t（0 红 → 1 紫）
uniform float u_thick, u_bezel, u_base, u_refr;
uniform int   u_profile;
uniform float u_mergeK, u_margin;
uniform vec2  u_L;
uniform float u_rimI, u_rimW, u_rimFar;
uniform float u_glareI, u_glareR, u_glareConv, u_glareFar;
uniform float u_fresnel;
uniform float u_contact;
uniform float u_shA, u_shR;
uniform vec2  u_shOff;
uniform float u_sat, u_bright, u_veil, u_adaptI;
uniform vec4  u_glow;      // x, y, 半径, 强度
uniform int   u_debug, u_lazy;

// ---- 平面元素（滑轨等）----
uniform int  u_nf;
uniform vec4 u_f0[MAXF];   // cx, cy, 半宽, 半高
uniform vec4 u_f1[MAXF];   // rgba
uniform vec4 u_f2[MAXF];   // 圆角, 自适应模式

// ---- 图标精灵 ----
uniform int  u_nsp;
uniform sampler2D u_sp0, u_sp1, u_sp2, u_sp3, u_sp4, u_sp5;
uniform vec4 u_spR[MAXSP]; // x, y, w, h
uniform vec4 u_spX[MAXSP]; // alpha, scale, pivotX, pivotY

float luma(vec3 c){ return dot(c, vec3(0.2126, 0.7152, 0.0722)); }

vec3 hsv2rgb(float h, float s, float v){
  vec3 k = clamp(abs(mod(h * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0);
  return v * mix(vec3(1.0), k, s);
}

vec3 rgb2oklab(vec3 c){
  c = pow(max(c, 0.0), vec3(2.2));
  float l = 0.4122214708 * c.r + 0.5363325363 * c.g + 0.0514459929 * c.b;
  float m = 0.2119034982 * c.r + 0.6806995451 * c.g + 0.1073969566 * c.b;
  float s = 0.0883024619 * c.r + 0.2817188376 * c.g + 0.6299787005 * c.b;
  l = pow(l, 1.0 / 3.0); m = pow(m, 1.0 / 3.0); s = pow(s, 1.0 / 3.0);
  return vec3(0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s,
              1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s,
              0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s);
}
vec3 oklab2rgb(vec3 L){
  float l = L.x + 0.3963377774 * L.y + 0.2158037573 * L.z;
  float m = L.x - 0.1055613458 * L.y - 0.0638541728 * L.z;
  float s = L.x - 0.0894841775 * L.y - 1.2914855480 * L.z;
  l = l * l * l; m = m * m * m; s = s * s * s;
  vec3 c = vec3( 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
                -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
                -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s);
  return pow(max(c, 0.0), vec3(1.0 / 2.2));
}

// ---------------- 背景采样：B 样条双三次 + 金字塔插值 ----------------
vec3 bspline(sampler2D t, vec2 uv){
  vec2 sz = vec2(textureSize(t, 0));
  vec2 st = uv * sz - 0.5;
  vec2 i = floor(st);
  vec2 f = st - i;
  vec2 f2 = f * f, f3 = f2 * f;
  vec2 w0 = (1.0 - 3.0 * f + 3.0 * f2 - f3) / 6.0;
  vec2 w1 = (4.0 - 6.0 * f2 + 3.0 * f3) / 6.0;
  vec2 w2 = (1.0 + 3.0 * f + 3.0 * f2 - 3.0 * f3) / 6.0;
  vec2 w3 = f3 / 6.0;
  vec2 g0 = w0 + w1, g1 = w2 + w3;
  vec2 h0 = (i - 0.5 + w1 / g0) / sz;
  vec2 h1 = (i + 1.5 + w3 / g1) / sz;
  vec3 a = textureLod(t, vec2(h0.x, h0.y), 0.0).rgb;
  vec3 b = textureLod(t, vec2(h1.x, h0.y), 0.0).rgb;
  vec3 c = textureLod(t, vec2(h0.x, h1.y), 0.0).rgb;
  vec3 d = textureLod(t, vec2(h1.x, h1.y), 0.0).rgb;
  return g0.y * (g0.x * a + g1.x * b) + g1.y * (g0.x * c + g1.x * d);
}
vec3 lvl(int k, vec2 uv){
  if (k <= 0) return textureLod(u_bg0, uv, 0.0).rgb;
  if (k == 1) return bspline(u_bg1, uv);
  if (k == 2) return bspline(u_bg2, uv);
  if (k == 3) return bspline(u_bg3, uv);
  if (k == 4) return bspline(u_bg4, uv);
  if (k == 5) return bspline(u_bg5, uv);
  return bspline(u_bg6, uv);
}
vec3 sampleBg(vec2 uv, float blur){
  if (blur < 0.6) return textureLod(u_bg0, uv, 0.0).rgb;
  float lod = clamp(log2(blur) + u_lodBias, 0.0, 6.0);
  int k = int(floor(lod));
  float f = lod - float(k);
  vec3 a = lvl(k, uv);
  if (f < 0.02 || k >= 6) return a;
  return mix(a, lvl(k + 1, uv), f);
}
vec3 bgAt(vec2 p, float blur){
  return sampleBg(vec2(p.x, u_res.y - p.y) / u_res, blur);
}

// ---------------- SDF ----------------
float smin(float a, float b, float k){
  if (k <= 0.0) return min(a, b);
  float h = max(k - abs(a - b), 0.0) / k;
  return min(a, b) - h * h * k * 0.25;
}
// 超椭圆圆角矩形：n=2 为普通圆角，n≈3.25 + R=1.528r 逼近 iOS 连续曲率圆角
float sdRR(vec2 q, vec2 h, float r, float n){
  r = min(r, min(h.x, h.y));
  vec2 d = abs(q) - h + r;
  vec2 m = max(d, 0.0);
  float c;
  if (m.x > 0.0 && m.y > 0.0) {
    if (n < 2.02) c = length(m);
    else {
      float mx = max(m.x, m.y);
      vec2 mm = m / mx;
      c = mx * pow(pow(mm.x, n) + pow(mm.y, n), 1.0 / n);
    }
  } else c = max(m.x, m.y);
  return c + min(max(d.x, d.y), 0.0) - r;
}
float sdShape(vec2 p, int i){
  vec4 g = u_g0[i]; vec4 g1 = u_g1[i];
  vec2 q = p - g.xy;
  float sc = 1.0;
  if (g1.w > 0.0005) {                       // 果冻拉伸（近似保面积）
    vec2 u = vec2(cos(g1.z), sin(g1.z));
    vec2 v = vec2(-u.y, u.x);
    float su = 1.0 + g1.w, sv = 1.0 / sqrt(su);
    float a = dot(q, u) / su, b = dot(q, v) / sv;
    q = a * u + b * v;
    sc = min(su, sv);
  }
  return sdRR(q, g.zw, g1.x, g1.y) * sc;
}
float sdFast(vec2 p, int i){
  vec4 g = u_g0[i];
  vec2 b = abs(p - g.xy) - g.zw * (1.0 + u_g1[i].w);
  float db = length(max(b, 0.0));
  if (db > u_margin) return db;
  return sdShape(p, i);
}
float mapAll(vec2 p){
  float tot = 1e6, cur = 1e6, cg = -999.0;
  for (int i = 0; i < MAXS; i++) {
    if (i >= u_n) break;
    vec4 g2 = u_g2[i];
    if (g2.y < 0.002) continue;
    float d = sdFast(p, i);
    if (g2.x == cg) cur = smin(cur, d, u_mergeK);
    else { tot = min(tot, cur); cur = d; cg = g2.x; }
  }
  return min(tot, cur);
}
vec2 grad(vec2 p){
  float e = 0.75;
  return vec2(mapAll(p + vec2(e, 0.0)) - mapAll(p - vec2(e, 0.0)),
              mapAll(p + vec2(0.0, e)) - mapAll(p - vec2(0.0, e)));
}

// ---------------- 材质混合（融合区域内平滑插值）----------------
struct M {
  vec4 tint; float frost, white, adapt, zoom, op, refr, veil, rim, bezel, thick, inr; vec2 c;
};
M evalM(vec2 p){
  float ds[MAXS];
  float best = 1e9, bgp = -1.0;
  for (int i = 0; i < MAXS; i++) {
    if (i >= u_n) break;
    ds[i] = 1e9;
    if (u_g2[i].y < 0.002) continue;
    float d = sdFast(p, i);
    ds[i] = d;
    if (d < best) { best = d; bgp = u_g2[i].x; }
  }
  M m;
  m.tint = vec4(0.0); m.frost = 0.0; m.white = 0.0; m.adapt = 0.0; m.zoom = 0.0; m.op = 0.0;
  m.refr = 0.0; m.veil = 0.0; m.rim = 0.0; m.bezel = 0.0; m.thick = 0.0; m.inr = 0.0; m.c = vec2(0.0);
  float kk = max(u_mergeK * 0.45, 1.5);
  float ws = 0.0;
  for (int i = 0; i < MAXS; i++) {
    if (i >= u_n) break;
    if (ds[i] > 1e8 || u_g2[i].x != bgp) continue;
    float w = exp(-(ds[i] - best) / kk);
    ws += w;
    m.tint  += u_m0[i] * w;
    m.frost += u_m1[i].x * w; m.white += u_m1[i].y * w; m.adapt += u_m1[i].z * w; m.zoom += u_m1[i].w * w;
    m.op    += u_g2[i].y * w; m.refr += u_g2[i].w * w;
    m.veil  += u_m2[i].x * w; m.rim += u_m2[i].y * w; m.bezel += u_m2[i].z * w; m.thick += u_m2[i].w * w;
    m.inr   += min(u_g0[i].z, u_g0[i].w) * w;
    m.c     += u_g0[i].xy * w;
  }
  float iw = 1.0 / max(ws, 1e-6);
  m.tint *= iw; m.frost *= iw; m.white *= iw; m.adapt *= iw; m.zoom *= iw; m.op *= iw;
  m.refr *= iw; m.veil *= iw; m.rim *= iw; m.bezel *= iw; m.thick *= iw; m.inr *= iw; m.c *= iw;
  return m;
}

// ---------------- 阴影：柔和投影 + 贴边环境遮蔽 ----------------
float shadowAt(vec2 p){
  float acc = 1.0;
  for (int i = 0; i < MAXS; i++) {
    if (i >= u_n) break;
    vec4 g2 = u_g2[i];
    float sc = g2.y * g2.z;
    if (sc < 0.002) continue;
    float d1 = sdFast(p - u_shOff, i);
    float s1 = 1.0 - smoothstep(-u_shR * 0.45, u_shR, d1);
    float d0 = sdFast(p, i);
    float s0 = 1.0 - smoothstep(0.0, max(u_shR * 0.2, 1.5), d0);
    float s = (s1 * s1 * 0.8 + s0 * 0.35) * sc * u_shA;
    acc *= 1.0 - clamp(s, 0.0, 1.0);
  }
  return 1.0 - acc;
}

// ---------------- 玻璃表面高度剖面 ----------------
float prof(float x){
  x = clamp(x, 0.0, 1.0);
  float cv = pow(max(1.0 - pow(1.0 - x, 4.0), 0.0), 0.25);           // 凸面 squircle
  if (u_profile == 1) return sqrt(max(1.0 - (1.0 - x) * (1.0 - x), 0.0)); // 凸面圆弧
  if (u_profile == 2) {                                                // 唇边
    float s = x * x * x * (x * (x * 6.0 - 15.0) + 10.0);
    return cv * (1.0 - 0.32 * s);
  }
  return cv;
}

// ---------------- 玻璃着色 ----------------
vec3 shade(vec2 p, float dU, M m){
  float dIn = max(-dU, 0.0);
  float w = m.bezel > 0.5 ? m.bezel : u_bezel;
  w = clamp(w, 1.0, max(m.inr * 0.98, 1.0));
  float T = u_thick * m.thick * (w / max(u_bezel, 1.0));
  float x = dIn / w;

  vec2 n2 = vec2(0.0);
  if (dIn < max(w, u_glareR * 3.0) + 2.0) {
    vec2 gr = grad(p);
    float gl = length(gr);
    if (gl > 1e-6) n2 = gr / gl;              // 指向外侧的 2D 法线
  }
  float hgt = 1.0, slope = 0.0;
  if (x < 1.0) {
    float xc = max(x, 0.002);
    hgt = prof(xc);
    float e = 0.002;
    float xa = max(xc - e, 0.0), xb = min(xc + e, 1.0);
    slope = (prof(xb) - prof(xa)) / (xb - xa) * T / w;   // dz / d(向内距离)
  }
  // 表面法线：沿外侧倾斜
  vec3 N = normalize(vec3(n2 * slope, 1.0));
  float depth = hgt * T + u_base;
  float rs = u_refr * m.refr;
  vec2 bp = m.c + (p - m.c) / max(m.zoom, 0.05);

  // ---- 对照组：常见的「AI 毛玻璃」----
  if (u_lazy == 1) {
    vec3 c = bgAt(p, 18.0 * u_px);
    c = mix(c, vec3(1.0), 0.2);
    float border = 1.0 - smoothstep(0.0, 1.2 * u_px, dIn);
    return mix(c, vec3(1.0), border * 0.6);
  }

  // ---- 斯涅尔折射 ----
  vec3 I = vec3(0.0, 0.0, -1.0);
  vec3 R0 = refract(I, N, 1.0 / u_ior);
  vec2 d0 = R0.xy / max(-R0.z, 0.06) * depth * rs;
  // 采样点不越过形状的中轴：保留边缘的拉伸/压缩，但不出现玻璃棒式的倒像
  float dl = length(d0);
  float lim = max(m.inr - dIn, 0.0) * 0.9 + 0.5;
  float dk = dl > lim ? lim / dl : 1.0;
  d0 *= dk;

  if (u_debug == 2) return mix(vec3(0.5), vec3(n2 * 0.5 + 0.5, 1.0), clamp(slope * 0.6, 0.0, 1.0));
  if (u_debug == 3) {
    float mag = length(d0) / max(w * 0.5, 1.0);
    return hsv2rgb(atan(d0.y, d0.x) / (2.0 * PI) + 0.5, 0.85, clamp(mag, 0.0, 1.0));
  }
  if (u_debug == 4) return vec3(hgt * 0.85 + 0.1);

  float frost = m.frost;
  vec3 c;
  if (u_dispN <= 1 || length(d0) < 0.35) {
    c = bgAt(bp + d0, frost);
  } else {
    // ---- 光谱色散：逐波长折射、逐波长采样、按光谱响应合成 ----
    c = vec3(0.0);
    for (int s = 0; s < 16; s++) {
      if (s >= u_dispN) break;
      vec4 dw = u_dw[s];
      float ior = max(u_ior + u_disp * (dw.w - 0.5), 1.0);
      vec3 R = refract(I, N, 1.0 / ior);
      vec2 d = R.xy / max(-R.z, 0.06) * depth * rs * dk;
      c += bgAt(bp + d, frost) * dw.rgb;
    }
  }

  // ---- 接触阴影被折射进弧面：白底上形成一圈弯曲的灰色渐变（玻璃“厚度感”的关键线索）----
  if (u_contact > 0.001) {
    float dS = mapAll(bp + d0);
    float band = max(u_shR * 0.5, 2.0 * u_px);
    float cs = dS < 0.0 ? exp(dS / band) : 1.0 - smoothstep(0.0, u_shR, dS);
    c *= 1.0 - clamp(cs * u_contact * 0.28, 0.0, 0.6);
  }

  // ---- 通透感：饱和度/亮度（Vibrancy）----
  float l = luma(c);
  c = mix(vec3(l), c, u_sat) * u_bright;

  // ---- 着色 ----
  c = mix(c, m.tint.rgb * (0.5 + 0.9 * l), clamp(m.tint.a, 0.0, 1.0));

  // ---- 明暗自适应薄纱 ----
  vec3 adaptCol = mix(vec3(0.0), vec3(1.0), m.adapt);
  vec3 vc = mix(vec3(1.0), adaptCol, u_adaptI);
  float va = u_veil * m.veil * mix(1.0, mix(1.3, 1.0, m.adapt), u_adaptI);
  c = mix(c, vc, clamp(va, 0.0, 1.0));

  // ---- Fresnel 反射（掠射角越大反射越强）----
  float F0 = pow((u_ior - 1.0) / (u_ior + 1.0), 2.0);
  float cosT = clamp(N.z, 0.0, 1.0);
  float F = F0 + (1.0 - F0) * pow(1.0 - cosT, 3.0);
  float fa = clamp(F * u_fresnel * m.rim, 0.0, 1.0);
  if (fa > 0.002) {
    // 边缘反射：把玻璃外侧的内容沿边界镜像、压缩进边缘（边缘会“沾上”外面的颜色）
    vec2 rp = p + n2 * (dIn * 1.6 + w * 0.35);
    vec3 env = bgAt(rp, max(frost * 0.6, 2.0 * u_px));
    env = mix(env, vec3(1.0), 0.12) * 1.06;
    c = mix(c, env, fa);
  }

  // ---- 镜面眩光：颜色取自下方内容（OKLab 提亮 + 提纯）----
  float nl = dot(n2, u_L);
  float ang = pow(max(nl, 0.0), u_glareConv) + u_glareFar * pow(max(-nl, 0.0), u_glareConv);
  float geo = exp(-dIn / max(u_glareR, 0.5));
  float gla = clamp(ang * geo * u_glareI * m.rim, 0.0, 1.0);
  if (gla > 0.001) {
    vec3 lab = rgb2oklab(c);
    lab.x += (1.02 - lab.x) * 0.9 * gla;
    lab.yz *= 1.0 + 1.4 * gla;
    c = clamp(oklab2rgb(lab), 0.0, 1.0);
    c = mix(c, vec3(1.0), gla * gla * 0.3);
  }

  // ---- 边缘高光细线（迎光侧强、背光侧弱）----
  float rimM = 1.0 - smoothstep(u_rimW * 0.3, u_rimW, dIn);
  float ra = abs(nl);
  float rimA = mix(0.25, 1.0, pow(ra, 1.6)) * (nl >= 0.0 ? 1.0 : u_rimFar);
  c = mix(c, vec3(1.0), clamp(rimM * rimA * u_rimI * m.rim, 0.0, 1.0));

  // ---- 触摸发光：从内部被点亮，并扩散到附近的玻璃 ----
  if (u_glow.w > 0.001) {
    float dd = length(p - u_glow.xy) / max(u_glow.z, 1.0);
    float gw = exp(-dd * dd) * u_glow.w;
    c += vec3(0.28) * gw;
    c = mix(c, vec3(1.0), clamp(rimM * gw * 0.8, 0.0, 1.0));
  }

  // ---- 实心旋钮（静止状态的滑块/开关）----
  if (m.white > 0.001) c = mix(c, vec3(0.995), clamp(m.white, 0.0, 1.0));
  return c;
}

vec4 spriteAt(int i, vec2 p){
  vec4 r = u_spR[i]; vec4 x = u_spX[i];
  vec2 lp = (p - x.zw) / max(x.y, 0.01) + x.zw;
  vec2 uv = (lp - r.xy) / r.zw;
  if (uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0) return vec4(0.0);
  vec4 t;
  if (i == 0) t = textureLod(u_sp0, uv, 0.0);
  else if (i == 1) t = textureLod(u_sp1, uv, 0.0);
  else if (i == 2) t = textureLod(u_sp2, uv, 0.0);
  else if (i == 3) t = textureLod(u_sp3, uv, 0.0);
  else if (i == 4) t = textureLod(u_sp4, uv, 0.0);
  else t = textureLod(u_sp5, uv, 0.0);
  t.a *= x.x;
  return t;
}

void main(){
  vec2 p = vec2(gl_FragCoord.x, u_res.y - gl_FragCoord.y);
  vec2 uv0 = gl_FragCoord.xy / u_res;
  vec3 col = textureLod(u_bg0, uv0, 0.0).rgb;
  float dU = mapAll(p);

  if (u_debug == 1) {                       // SDF 等值线视图
    vec3 base = dU > 0.0 ? vec3(0.95, 0.62, 0.32) : vec3(0.45, 0.72, 1.0);
    float k = abs(dU) / (8.0 * u_px);
    base *= 0.72 + 0.28 * smoothstep(0.35, 0.5, abs(fract(k) - 0.5) * 2.0);
    base *= 1.0 - exp(-abs(dU) / (40.0 * u_px)) * 0.5;
    base = mix(base, vec3(1.0), 1.0 - smoothstep(0.5, 1.5, abs(dU)));
    o = vec4(mix(col * 0.25, base, 0.92), 1.0);
    return;
  }

  float adaptHere = 0.5;
  if (u_shA > 0.0 && dU > -2.0) col *= 1.0 - shadowAt(p);

  if (dU < 1.0) {
    M m = evalM(p);
    adaptHere = m.adapt;
    vec3 g = shade(p, dU, m);
    float cov = clamp(0.5 - dU, 0.0, 1.0) * clamp(m.op, 0.0, 1.0);
    col = mix(col, g, cov);
  }

  if (u_pass == 0) {
    float lightBg = adaptHere;
    for (int f = 0; f < MAXF; f++) {
      if (f >= u_nf) break;
      vec4 g = u_f0[f];
      vec2 q = abs(p - g.xy) - g.zw;
      if (max(q.x, q.y) > 2.0) continue;
      vec4 cl = u_f1[f]; vec4 e = u_f2[f];
      float d = sdRR(p - g.xy, g.zw, e.x, 2.0);
      float a = clamp(0.5 - d, 0.0, 1.0) * cl.a;
      vec3 fc = cl.rgb;
      if (e.y > 0.5) {                        // 自适应中性色：亮背景用黑、暗背景用白
        fc = mix(vec3(1.0), vec3(0.0), lightBg);
        a *= mix(1.5, 0.85, lightBg);
      }
      col = mix(col, fc, clamp(a, 0.0, 1.0));
    }
    for (int i = 0; i < MAXSP; i++) {
      if (i >= u_nsp) break;
      vec4 t = spriteAt(i, p);
      if (t.a < 0.002) continue;
      float mx = max(t.r, max(t.g, t.b));
      float sat = mx - min(t.r, min(t.g, t.b));
      vec3 gc = t.rgb;
      float a = t.a;
      if (sat < 0.08) {                       // 白色图形 → 自适应（亮背景深色、暗背景白色）
        gc = mix(vec3(1.0), vec3(0.07, 0.07, 0.09), lightBg);
        a *= mix(0.4, 1.0, mx);
      }
      col = mix(col, gc, clamp(a, 0.0, 1.0));
    }
  }
  o = vec4(col, 1.0);
}`;
