// Generates the example background photo and README screenshots with headless Chrome.
//   node tools/make-assets.mjs            (expects the site served at http://127.0.0.1:5178)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BASE = process.env.BASE || 'http://127.0.0.1:5178';
const CHROME = process.env.CHROME || [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
].find((p) => fs.existsSync(p));
const only = process.argv.slice(2);
const want = (k) => !only.length || only.includes(k);

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'new',
  args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader', '--hide-scrollbars'],
});
const out = (p) => { const f = path.join(root, p); fs.mkdirSync(path.dirname(f), { recursive: true }); return f; };

try {
  if (want('photo')) {
    const page = await browser.newPage();
    await page.goto(BASE + '/index.html?record&lang=en', { waitUntil: 'load' });
    const data = await page.evaluate(() => {
      const c = document.createElement('canvas');
      c.width = 1920; c.height = 1200;
      const x = c.getContext('2d');
      LG.Content.photo(x, 0, 0, 1920, 1200, 'sunset', 0);
      // a bright horizon band of thin lines helps to read the refraction
      x.globalAlpha = 0.35; x.fillStyle = '#fff';
      for (let i = 0; i < 1920; i += 14) x.fillRect(i, 1060, 3, 140);
      x.globalAlpha = 1;
      return c.toDataURL('image/jpeg', 0.9);
    });
    fs.writeFileSync(out('skills/liquid-glass/examples/assets/photo.jpg'), Buffer.from(data.split(',')[1], 'base64'));
    console.log('photo.jpg written');
    await page.close();
  }

  const shot = async (url, file, vp, prep) => {
    const page = await browser.newPage();
    const errs = [];
    page.on('console', (m) => { if (m.type() === 'error' || /liquid-glass/.test(m.text())) errs.push(m.text()); });
    page.on('pageerror', (e) => errs.push(String(e)));
    await page.setViewport(vp);
    await page.goto(BASE + url, { waitUntil: 'networkidle0' });
    if (prep) await prep(page);
    await new Promise((r) => setTimeout(r, 1200));
    await page.screenshot({ path: out(file) });
    console.log('shot', file, errs.length ? 'ERRORS: ' + errs.join(' | ') : 'ok');
    await page.close();
  };

  if (want('examples')) {
    await shot('/skills/liquid-glass/examples/hero-webgl.html', 'docs/media/example-hero.png', { width: 1280, height: 760, deviceScaleFactor: 1 });
    await shot('/skills/liquid-glass/examples/navbar-dom.html', 'docs/media/example-navbar.png', { width: 1100, height: 720, deviceScaleFactor: 1 }, async (p) => {
      await p.evaluate(() => window.scrollTo(0, 180));
    });
    await shot('/skills/liquid-glass/examples/auto-tune.html', 'docs/media/example-auto.png', { width: 1100, height: 720, deviceScaleFactor: 1 });
  }

  if (want('demo')) {
    const step = async (p, n) => p.evaluate((n) => window.__lg.step(n), n);
    for (const [scene, file, prep] of [
      ['article', 'docs/media/shot-article.png', null],
      ['grid', 'docs/media/shot-grid.png', null],
      ['wallpaper', 'docs/media/shot-wallpaper.png', null],
    ]) {
      await shot('/index.html?record&lang=en', file, { width: 1280, height: 800, deviceScaleFactor: 1.5 }, async (p) => {
        await p.evaluate((s) => window.__lg.scene(s), scene);
        await new Promise((r) => setTimeout(r, 400));
        if (scene === 'grid') await p.evaluate(() => window.__lg.preset('clear'));
        await step(p, 40);
        if (prep) await prep(p);
      });
    }
  }
} finally {
  await browser.close();
}
