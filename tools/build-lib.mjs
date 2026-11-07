// Builds dist/liquid-glass.js (and the skill's copy) from src/liquid-glass.src.js,
// injecting the exact GLSL used by the demo page (js/shaders.js) — one source of truth.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ctx = {};
ctx.window = ctx;
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(root, 'js/shaders.js'), 'utf8'), ctx);
const SH = ctx.LG.SH;
for (const k of ['vert', 'scene', 'down', 'glass']) if (typeof SH[k] !== 'string') throw new Error('missing shader ' + k);

const src = fs.readFileSync(path.join(root, 'src/liquid-glass.src.js'), 'utf8');
if (!src.includes('/*__SHADERS__*/ null')) throw new Error('placeholder not found');
const out = src.replace('/*__SHADERS__*/ null', JSON.stringify({ vert: SH.vert, scene: SH.scene, down: SH.down, glass: SH.glass }));

for (const dest of ['dist/liquid-glass.js', 'skills/liquid-glass/assets/liquid-glass.js']) {
  const p = path.join(root, dest);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, out);
  console.log('wrote', dest, (out.length / 1024).toFixed(1) + ' KB');
}
