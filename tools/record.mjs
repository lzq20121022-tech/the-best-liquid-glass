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
let g = await lg('geo');

// 1. intro
await lg('scene', 'wallpaper');
await lg('set', 'lightMode', 'spin');
await hold(0.2);
mark('intro');
await caption('The Best Liquid Glass', 'Physically based · real-time · in your browser');
await hold(2.6);
await lg('set', 'lightMode', 'fixed');
markEnd('intro');

// 2. scrolling content under the bars
await lg('scene', 'article');
await new Promise((r) => setTimeout(r, 500));
await lg('scrollTo', 0);
mark('scroll');
await caption('Real refraction, not blur', 'Content bends around the rim as it scrolls under the glass');
for (let i = 0, n = Math.round(4 * FPS); i < n; i++) { await lg('scrollTo', ease(i / n) * 900); await snap(); }
markEnd('scroll');

// 3. lens over text
await lg('preset', 'clear');
await lg('scrollTo', 760);
g = await lg('geo');
mark('lens');
await caption('Snell’s law on a squircle bevel', 'Flat clear center · magnifying, bending rim');
await path2([[g.lens.x, g.lens.y], [g.lens.x + 60, g.lens.y + 120], [g.lens.x + 330, g.lens.y + 150], [g.lens.x + 180, g.lens.y + 60]], 4.5);
await hold(0.6);
markEnd('lens');

// 4. dispersion on the test grid
await lg('scene', 'grid');
await new Promise((r) => setTimeout(r, 500));
await lg('scrollTo', 60);
g = await lg('geo');
mark('dispersion');
await caption('Spectral dispersion', 'Seven wavelengths, each refracted with its own index');
await path2([[g.lens.x, g.lens.y], [g.lens.x + 80, g.lens.y - 120], [g.lens.x + 260, g.lens.y + 40]], 2.6);
await lg('preset', 'prism');
await caption('Spectral dispersion', 'Prism preset · dispersion 0.30 · 12 spectral taps');
g = await lg('geo');
await path2([[g.lens.x, g.lens.y], [g.lens.x - 160, g.lens.y + 90], [g.lens.x - 40, g.lens.y - 70]], 2.6);
await hold(0.4);
markEnd('dispersion');

// 5. liquid merging
await lg('preset', 'regular');
await lg('set', 'mergeK', 60);
await lg('scene', 'wallpaper');
g = await lg('geo');
mark('merge');
await caption('Liquid merging', 'Signed distance fields blend with a smooth minimum');
{
  const a = g.blobs[0], b = g.blobs[1];
  await path2([[b.x, b.y], [a.x + 70, a.y + 30], [a.x + 40, a.y + 10], [b.x + 60, b.y + 40]], 4.2);
}
await hold(0.5);
markEnd('merge');
await lg('set', 'mergeK', 40);

// 6. tab bar droplet
await lg('scene', 'article');
await new Promise((r) => setTimeout(r, 500));
await lg('scrollTo', 400);
g = await lg('geo');
mark('tabbar');
await caption('Tab bar droplet', 'Press and slide: the selection lifts into a magnifying lens');
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
mark('morph');
await caption('Shape morphing', 'A button flows into a menu — one continuous surface');
await tap(g.cap.x, g.cap.y, 1.4);
await tap(g.W * 0.35, g.H * 0.45, 1.0);
markEnd('morph');

// 8. controls
await lg('scene', 'wallpaper');
g = await lg('geo');
mark('controls');
await caption('Glass controls', 'Knobs turn into clear lenses while you drag them');
{
  const t = g.track, y = t.y;
  await path2([[t.x + t.w * 0.62, y], [t.x + t.w * 0.1, y], [t.x + t.w * 0.92, y], [t.x + t.w * 0.5, y]], 3.2);
  await hold(0.3);
  await tap(g.tog.x + g.tog.w / 2, g.tog.y, 0.7);
  await tap(g.tog.x + g.tog.w / 2, g.tog.y, 0.7);
}
markEnd('controls');

// 9. light
mark('light');
await caption('Content-tinted specular', 'Rim light follows the light source; glare takes the color beneath');
await lg('set', 'lightMode', 'spin');
await hold(3);
await lg('set', 'lightMode', 'fixed');
markEnd('light');

// 10. adaptivity
await lg('scene', 'article');
await new Promise((r) => setTimeout(r, 500));
await lg('scrollTo', 300);
mark('adapt');
await caption('Light / dark adaptivity', 'Glass and symbols flip to stay legible');
await hold(1.2);
await lg('set', 'dark', true);
await new Promise((r) => setTimeout(r, 600));
await hold(1.8);
await lg('set', 'dark', false);
await new Promise((r) => setTimeout(r, 600));
markEnd('adapt');

// 11. under the hood
await lg('scene', 'grid');
await new Promise((r) => setTimeout(r, 500));
mark('debug');
await caption('Under the hood', 'Displacement field from Snell refraction');
await lg('set', 'debug', 3);
await hold(1.6);
await caption('Under the hood', 'Signed distance field');
await lg('set', 'debug', 1);
await hold(1.6);
await lg('set', 'debug', 0);
markEnd('debug');

// 12. comparison
await lg('scene', 'article');
await new Promise((r) => setTimeout(r, 500));
await lg('preset', 'clear');
await lg('scrollTo', 760);
mark('compare');
await caption('Typical “AI liquid glass”', 'Blur + white border');
await lg('set', 'lazy', true);
await hold(1.8);
await caption('The Best Liquid Glass', 'Refraction · dispersion · Fresnel · specular');
await lg('set', 'lazy', false);
await hold(2.2);
markEnd('compare');

// 13. outro
await lg('preset', 'regular');
await lg('scene', 'wallpaper');
mark('outro');
await caption('The Best Liquid Glass', 'WebGL2 · MIT · drop-in library & AI skill included');
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
const gif = (name, w = 640, fps = 15) => {
  const m = marks.find((x) => x.name === name);
  if (!m) return;
  ff(['-ss', String(m.t), '-t', String(m.end - m.t), '-i', path.join(MEDIA, 'demo.mp4'),
    '-vf', `fps=${fps},scale=${w}:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=160:stats_mode=diff[p];[b][p]paletteuse=dither=sierra2_4a:diff_mode=rectangle`,
    path.join(MEDIA, `${name}.gif`)]);
  console.log('gif', name);
};
for (const n of ['scroll', 'lens', 'dispersion', 'merge', 'tabbar', 'morph', 'controls', 'adapt', 'compare']) gif(n);
// poster frame
const lensMark = marks.find((x) => x.name === 'lens');
ff(['-ss', String(lensMark.t + 3.2), '-i', path.join(MEDIA, 'demo.mp4'), '-frames:v', '1', path.join(MEDIA, 'poster.jpg')]);
fs.rmSync(FRAMES, { recursive: true, force: true });
console.log('done');
