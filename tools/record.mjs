// Records the demo video deterministically: the page runs in ?record mode, every frame is
// stepped with a fixed dt, real mouse events drive the interactions, frames are encoded by ffmpeg.
//
//   python -m http.server 5178        (in the repo root)
//   node tools/record.mjs             → docs/media/demo.mp4 + GIF clips
//   node tools/record.mjs --probe     → renderer + ms/frame
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BASE = process.env.BASE || 'http://127.0.0.1:5178';
const FPS = 30;
const VW = 1280, VH = 720, DPR = +(process.env.DPR || 1.5);
const CHROME = process.env.CHROME || [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
].find((p) => fs.existsSync(p));
const FRAMES = path.join(root, '.frames');
const MEDIA = path.join(root, 'docs/media');

const browser = await puppeteer.launch({
  executablePath: CHROME, headless: 'new',
  args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader', '--hide-scrollbars'],
});
const page = await browser.newPage();
await page.setViewport({ width: VW, height: VH, deviceScaleFactor: DPR });
page.on('pageerror', (e) => console.error('PAGE ERROR', e));
await page.goto(BASE + '/index.html?record&lang=en', { waitUntil: 'load' });
await page.waitForFunction(() => window.__lg && window.__lg.ready());

const lg = (fn, ...a) => page.evaluate((fn, a) => window.__lg[fn](...a), fn, a);

if (process.argv.includes('--probe')) {
  const r = await page.evaluate(() => { const g = document.createElement('canvas').getContext('webgl2'); const e = g.getExtension('WEBGL_debug_renderer_info'); return e ? g.getParameter(e.UNMASKED_RENDERER_WEBGL) : 'n/a'; });
  const t = Date.now();
  for (let i = 0; i < 10; i++) { await lg('step', 1, 1 / FPS); await page.screenshot({ type: 'jpeg', quality: 92 }); }
  console.log('renderer:', r, '| ms/frame:', (Date.now() - t) / 10);
  await browser.close();
  process.exit(0);
}

fs.rmSync(FRAMES, { recursive: true, force: true });
fs.mkdirSync(FRAMES, { recursive: true });
fs.mkdirSync(MEDIA, { recursive: true });

let frame = 0;
const marks = [];
async function snap() {
  await lg('step', 1, 1 / FPS);
  await page.screenshot({ path: path.join(FRAMES, `f${String(frame).padStart(5, '0')}.jpg`), type: 'jpeg', quality: 93 });
  frame++;
  if (frame % 60 === 0) console.log('frame', frame, (frame / FPS).toFixed(1) + 's');
}
const hold = async (sec) => { for (let i = 0, n = Math.round(sec * FPS); i < n; i++) await snap(); };
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
async function path2(points, sec, { press = true } = {}) {
  // points: [[x,y], ...] — moves along a polyline with ease-in-out
  const n = Math.round(sec * FPS);
  const segs = [];
  let total = 0;
  for (let i = 1; i < points.length; i++) { const l = Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]); segs.push(l); total += l; }
  const at = (u) => {
    let d = u * total;
    for (let i = 0; i < segs.length; i++) {
      if (d <= segs[i] || i === segs.length - 1) { const t = segs[i] ? d / segs[i] : 0; return [points[i][0] + (points[i + 1][0] - points[i][0]) * t, points[i][1] + (points[i + 1][1] - points[i][1]) * t]; }
      d -= segs[i];
    }
    return points[points.length - 1];
  };
  await page.mouse.move(points[0][0], points[0][1]);
  if (press) await page.mouse.down();
  for (let i = 1; i <= n; i++) {
    const [x, y] = at(ease(i / n));
    await page.mouse.move(x, y);
    await snap();
  }
  if (press) await page.mouse.up();
}
async function tap(x, y, after = 0.6) {
  await page.mouse.move(x, y);
  await page.mouse.down();
  await hold(0.18);
  await page.mouse.up();
  await hold(after);
}
const caption = (a, b) => lg('caption', a, b);
const mark = (name) => marks.push({ name, t: frame / FPS });
const markEnd = (name) => { const m = marks.find((x) => x.name === name && x.end == null); if (m) m.end = frame / FPS; };

// ---------------------------------------------------------------- timeline
// Every segment starts from a clean layout (reset) and shows only the glass it is about (focus).
const segment = async (name, { scene, preset = 'default', focus = null, scroll = null, caption: cap }) => {
  if (scene) { await lg('scene', scene); await new Promise((r) => setTimeout(r, 450)); }
  await lg('preset', preset);
  await lg('reset');
  await lg('focus', focus);
  if (scroll != null) await lg('scrollTo', scroll);
  await lg('step', 2, 1 / FPS);
  if (cap) await caption(cap[0], cap[1]);
  mark(name);
};
let g = await lg('geo');

// 1. intro — everything, wallpaper, rotating light
await segment('intro', { scene: 'wallpaper', caption: ['The Best Liquid Glass', 'Physically based · real-time · in your browser'] });
await lg('set', 'lightMode', 'spin');
await hold(2.8);
await lg('set', 'lightMode', 'fixed');
markEnd('intro');

// 2. scrolling content under the bars only
await segment('scroll', { scene: 'article', focus: ['bar', 'nav'], scroll: 0, caption: ['Real refraction, not blur', 'Content bends around the rim as it scrolls under the glass'] });
for (let i = 0, n = Math.round(4 * FPS); i < n; i++) { await lg('scrollTo', ease(i / n) * 900); await snap(); }
markEnd('scroll');

// 3. the lens over text
await segment('lens', { scene: 'article', focus: ['lens'], scroll: 760, caption: ['Snell’s law on a squircle bevel', 'Clear center · magnifying, bending rim'] });
g = await lg('geo');
await path2([[g.lens.x, g.lens.y], [g.lens.x + 60, g.lens.y + 130], [g.lens.x + 330, g.lens.y + 150], [g.lens.x + 190, g.lens.y + 60]], 4.5);
await hold(0.6);
markEnd('lens');

// 4. dispersion on the test grid
await segment('dispersion', { scene: 'grid', focus: ['lens', 'blobs'], scroll: 60, caption: ['Spectral dispersion', 'Ten wavelengths, each refracted with its own index'] });
g = await lg('geo');
await path2([[g.lens.x, g.lens.y], [g.lens.x + 80, g.lens.y - 120], [g.lens.x + 260, g.lens.y + 40]], 2.6);
await lg('preset', 'prism');
await caption('Spectral dispersion', 'Prism preset · dispersion 0.36 · 16 spectral taps');
g = await lg('geo');
await path2([[g.lens.x, g.lens.y], [g.lens.x - 160, g.lens.y + 90], [g.lens.x - 40, g.lens.y - 70]], 2.6);
await hold(0.4);
markEnd('dispersion');

// 5. liquid merging — just the two droplets
await segment('merge', { scene: 'wallpaper', focus: ['blobs'], caption: ['Liquid merging', 'Signed distance fields blend with a smooth minimum'] });
await lg('set', 'mergeK', 60);
g = await lg('geo');
{
  const a = g.blobs[0], b = g.blobs[1];
  await path2([[b.x, b.y], [a.x + 70, a.y + 30], [a.x + 40, a.y + 10], [b.x, b.y]], 4.4);
}
await hold(0.6);
markEnd('merge');
await lg('set', 'mergeK', 40);

// 6. tab bar droplet
await segment('tabbar', { scene: 'article', focus: ['bar'], scroll: 380, caption: ['Tab bar droplet', 'Press and slide: the selection lifts into a magnifying lens'] });
g = await lg('geo');
{
  const c = g.bar.centers, y = g.bar.y + g.bar.h / 2;
  await page.mouse.move(c[0], y);
  await page.mouse.down();
  await hold(0.4);
  await path2([[c[0], y], [c[3], y], [c[1] + 20, y], [c[2], y]], 3.0, { press: false });
  await hold(0.2);
  await page.mouse.up();
  await hold(0.8);
}
markEnd('tabbar');

// 7. morph
await segment('morph', { scene: 'article', focus: ['nav'], scroll: 0, caption: ['Shape morphing', 'A button flows into a menu — one continuous surface'] });
g = await lg('geo');
await hold(0.3);
await tap(g.cap.x, g.cap.y, 1.4);
await tap(g.W * 0.35, g.H * 0.55, 1.0);
markEnd('morph');

// 8. controls
await segment('controls', { scene: 'wallpaper', focus: ['panel'], caption: ['Glass controls', 'Knobs turn into clear lenses while you drag them'] });
g = await lg('geo');
{
  const t = g.track, y = t.y;
  await path2([[t.x + t.w * 0.62, y], [t.x + t.w * 0.1, y], [t.x + t.w * 0.92, y], [t.x + t.w * 0.5, y]], 3.2);
  await hold(0.3);
  await tap(g.tog.x + g.tog.w / 2, g.tog.y, 0.7);
  await tap(g.tog.x + g.tog.w / 2, g.tog.y, 0.7);
}
markEnd('controls');

// 9. light
await segment('light', { scene: 'wallpaper', focus: ['lens', 'blobs'], caption: ['Content-tinted specular', 'A crisp rim follows the light; glare takes the color beneath'] });
await lg('set', 'lightMode', 'spin');
await hold(3);
await lg('set', 'lightMode', 'fixed');
markEnd('light');

// 10. adaptivity
await segment('adapt', { scene: 'article', focus: ['bar', 'nav', 'lens'], scroll: 300, caption: ['Light / dark adaptivity', 'Glass and symbols flip to stay legible'] });
await hold(1.2);
await lg('set', 'dark', true);
await new Promise((r) => setTimeout(r, 600));
await hold(1.8);
await lg('set', 'dark', false);
await new Promise((r) => setTimeout(r, 600));
markEnd('adapt');

// 11. Apple's three looks on the same scene
await segment('looks', { scene: 'wallpaper', focus: ['lens', 'blobs', 'panel'], caption: ['Apple Regular', 'Blur + luminosity — most system components'] , preset: 'regular' });
await hold(1.5);
await lg('preset', 'clear');
await caption('Apple Clear', 'Translucent, moderate blur — over photos and video');
await hold(1.5);
await lg('preset', 'crystal');
await caption('Crystal', 'The iOS 27 Siri orb — full dome, prism, inversion');
await hold(1.8);
markEnd('looks');

// 12. under the hood
await segment('debug', { scene: 'grid', focus: ['lens', 'blobs'], caption: ['Under the hood', 'Displacement field from Snell refraction'] });
await lg('set', 'debug', 3);
await hold(1.6);
await caption('Under the hood', 'Signed distance field');
await lg('set', 'debug', 1);
await hold(1.6);
await lg('set', 'debug', 0);
markEnd('debug');

// 13. comparison
await segment('compare', { scene: 'article', focus: ['lens', 'bar', 'nav'], scroll: 760, caption: ['Typical “AI liquid glass”', 'Blur + white border'] });
await lg('set', 'lazy', true);
await hold(1.8);
await caption('The Best Liquid Glass', 'Refraction · dispersion · Fresnel · specular');
await lg('set', 'lazy', false);
await hold(2.2);
markEnd('compare');

// 14. outro
await segment('outro', { scene: 'wallpaper', caption: ['The Best Liquid Glass', 'WebGL2 · MIT · drop-in library & AI skill included'] });
await hold(2.4);
await caption('');
await hold(0.4);
markEnd('outro');

await browser.close();
fs.writeFileSync(path.join(MEDIA, 'timeline.json'), JSON.stringify(marks, null, 2));
console.log('frames:', frame, '→ encoding');

// ---------------------------------------------------------------- encode
const ff = (args) => execFileSync('ffmpeg', ['-y', '-loglevel', 'error', ...args], { stdio: 'inherit' });
ff(['-framerate', String(FPS), '-i', path.join(FRAMES, 'f%05d.jpg'), '-c:v', 'libx264', '-preset', 'slow', '-crf', '18', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', path.join(MEDIA, 'demo.mp4')]);
ff(['-i', path.join(MEDIA, 'demo.mp4'), '-vf', 'scale=1280:-2', '-c:v', 'libx264', '-crf', '26', '-preset', 'slow', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', path.join(MEDIA, 'demo-720p.mp4')]);
const clip = (name, w = 640, fps = 30) => {
  const m = marks.find((x) => x.name === name);
  if (!m) return;
  // animated WebP: 30 fps, full color, no dithering — smoother and usually smaller than GIF
  ff(['-ss', String(m.t), '-t', String(m.end - m.t), '-i', path.join(MEDIA, 'demo.mp4'),
    '-vf', `fps=${fps},scale=${w}:-1:flags=lanczos`, '-c:v', 'libwebp_anim', '-lossless', '0', '-q:v', '72', '-compression_level', '6', '-loop', '0', '-an',
    path.join(MEDIA, `${name}.webp`)]);
  console.log('webp', name);
};
for (const n of ['scroll', 'lens', 'dispersion', 'merge', 'tabbar', 'morph', 'controls', 'adapt', 'looks', 'compare']) clip(n);
// poster frame
const lensMark = marks.find((x) => x.name === 'lens');
ff(['-ss', String(lensMark.t + 3.2), '-i', path.join(MEDIA, 'demo.mp4'), '-frames:v', '1', path.join(MEDIA, 'poster.jpg')]);
fs.rmSync(FRAMES, { recursive: true, force: true });
console.log('done');
