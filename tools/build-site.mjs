// Collects the files the live demo needs into .site/ (for Cloudflare Pages or any static host).
//   node tools/build-site.mjs && npx wrangler pages deploy .site --project-name the-best-liquid-glass
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, '.site');
fs.rmSync(out, { recursive: true, force: true });
const copy = (rel) => {
  const src = path.join(root, rel), dst = path.join(out, rel);
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  fs.cpSync(src, dst, { recursive: true });
};
['index.html', 'style.css', 'js', 'dist', 'skills/liquid-glass', 'LICENSE', 'docs/media/poster.jpg'].forEach(copy);
fs.writeFileSync(path.join(out, '_headers'), [
  '/*',
  '  X-Content-Type-Options: nosniff',
  '  Referrer-Policy: strict-origin-when-cross-origin',
  '/dist/*',
  '  Access-Control-Allow-Origin: *',
  '  Cache-Control: public, max-age=3600',
  '/skills/liquid-glass/assets/*',
  '  Access-Control-Allow-Origin: *',
  '',
].join('\n'));
let n = 0, bytes = 0;
const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).forEach((e) => { const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else { n++; bytes += fs.statSync(p).size; } });
walk(out);
console.log(`.site ready: ${n} files, ${(bytes / 1048576).toFixed(1)} MB`);
