// Records the library's animation layer (skills/liquid-glass/examples/drag.html) in real time:
// real mouse input, spring physics running at display rate, frames captured continuously.
//   node tools/record-lib.mjs            → docs/media/library-drag.mp4 + .gif
//   node tools/record-lib.mjs --check    → a few still frames in .frames-lib/ for inspection
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BASE = process.env.BASE || 'http://127.0.0.1:5178';
const CHROME = process.env.CHROME || ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/google-chrome'].find((p) => fs.existsSync(p));
const CHECK = process.argv.includes('--check');
const DIR = path.join(root, '.frames-lib');
fs.rmSync(DIR, { recursive: true, force: true });
fs.mkdirSync(DIR, { recursive: true });

const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--hide-scrollbars'] });
const page = await browser.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
await page.setViewport({ width: 1100, height: 680, deviceScaleFactor: 1.5 });
await page.goto(BASE + '/skills/liquid-glass/examples/drag.html', { waitUntil: 'networkidle0' });
await new Promise((r) => setTimeout(r, 800));

let n = 0;
const t0 = Date.now();
const times = [];
const shot = async (name) => {
  const f = path.join(DIR, name || `f${String(n).padStart(5, '0')}.jpg`);
  await page.screenshot({ path: f, type: 'jpeg', quality: 90 });
  if (!name) { n++; times.push(Date.now() - t0); }
};
const center = (sel) => page.$eval(sel, (e) => { const r = e.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; });
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
async function drag(from, pts, steps, { release = true, hold = 0 } = {}) {
  await page.mouse.move(from[0], from[1]);
  await page.mouse.down();
  const all = [from, ...pts];
  for (let i = 1; i <= steps; i++) {
    const u = ease(i / steps) * (all.length - 1);
    const k = Math.min(all.length - 2, Math.floor(u)), f = u - k;
    await page.mouse.move(all[k][0] + (all[k + 1][0] - all[k][0]) * f, all[k][1] + (all[k + 1][1] - all[k][1]) * f);
    await shot();
  }
  for (let i = 0; i < hold; i++) await shot();
  if (release) await page.mouse.up();
}
const idle = async (frames) => { for (let i = 0; i < frames; i++) await shot(); };

await idle(8);
// 1. merge: drag droplet 2 into droplet 1, wiggle, pull apart
let b1 = await center('.b1'), b2 = await center('.b2');
await drag(b2, [[b1[0] + 70, b1[1] + 30], [b1[0] + 40, b1[1] + 50], [b2[0] + 140, b2[1] - 20]], 34);
if (CHECK) await shot('check-merge-end.jpg');
await idle(14);
// 2. throw the card (fast flick) — inertia + bounds + jelly
const card = await center('.card');
await page.mouse.move(card[0], card[1]);
await page.mouse.down();
for (let i = 1; i <= 6; i++) { await page.mouse.move(card[0] - i * 34, card[1] + i * 22); await shot(); if (CHECK && i === 5) await shot('check-jelly.jpg'); }
await page.mouse.up();
await idle(26);
// 3. snap-back pill
const pill = await center('.pill');
await drag(pill, [[pill[0] - 260, pill[1] + 90]], 14, { release: true });
await idle(18);
// 4. tab bar droplet
const tabs = await page.$$eval('.tabs button', (bs) => bs.map((b) => { const r = b.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; }));
await page.mouse.move(tabs[0][0], tabs[0][1]);
await page.mouse.down();
await idle(6);
if (CHECK) await shot('check-tab-lift.jpg');
for (let i = 1; i <= 26; i++) { const t = ease(i / 26); await page.mouse.move(tabs[0][0] + (tabs[3][0] - tabs[0][0]) * t, tabs[0][1]); await shot(); }
for (let i = 1; i <= 12; i++) { const t = ease(i / 12); await page.mouse.move(tabs[3][0] + (tabs[1][0] - tabs[3][0]) * t, tabs[0][1]); await shot(); }
await page.mouse.up();
await idle(20);
await browser.close();

console.log('frames', n, 'avg ms/frame', (times[times.length - 1] / n).toFixed(1), errs.length ? 'ERRORS: ' + errs.join(' | ') : 'no page errors');
if (!CHECK) {
  const fps = Math.round(1000 / (times[times.length - 1] / n));
  const media = path.join(root, 'docs/media');
  const ff = (a) => execFileSync('ffmpeg', ['-y', '-loglevel', 'error', ...a], { stdio: 'inherit' });
  ff(['-framerate', String(fps), '-i', path.join(DIR, 'f%05d.jpg'), '-c:v', 'libx264', '-crf', '20', '-preset', 'slow', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-vf', 'scale=1650:-2', path.join(media, 'library-drag.mp4')]);
  ff(['-i', path.join(media, 'library-drag.mp4'), '-vf', `fps=${Math.min(fps, 18)},scale=640:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=160:stats_mode=diff[p];[b][p]paletteuse=dither=sierra2_4a:diff_mode=rectangle`, path.join(media, 'library-drag.gif')]);
  fs.rmSync(DIR, { recursive: true, force: true });
  console.log('wrote docs/media/library-drag.mp4 + .gif at', fps, 'fps');
}
