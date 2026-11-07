---
name: liquid-glass
description: Add a physically based, Apple-style Liquid Glass effect (real Snell refraction on a curved bevel, spectral dispersion, Fresnel reflection, content-tinted specular rim, liquid merging, light/dark adaptivity) to any website or web app, and pick refraction index, thickness, bezel, frost, dispersion and tint from what is behind the glass. Use when the user asks for liquid glass, iOS 26 / visionOS glass, glassmorphism, frosted glass, a glass navbar / tab bar / button / card / sheet / magnifier, or says an existing glass effect looks fake.
---

# Liquid Glass

A drop-in library (`assets/liquid-glass.js`, no dependencies, ~65 KB) plus the rules for tuning it to a scene.
It is the same renderer as the demo at the repository root, packaged for real sites.

## How it works (so you can reason about parameters)

- The glass shape is a signed distance field built from the element's box and `border-radius`
  (superellipse corners ≈ iOS continuous corners).
- The surface height rises along a **convex squircle** across the rim (`bezel` px wide, `thickness` px high).
  The center is flat, so it stays clear; the rim is steep, so it bends light hard.
- Each pixel refracts a view ray with **Snell's law** (`ior`) and samples what is behind at the landing point.
  With `disp > 0` it does this per wavelength (`dispN` taps) and recombines with a spectral response →
  continuous rainbow fringes, not an RGB offset.
- **Frost** is a real blur (Gaussian pyramid), **Fresnel** mirrors outside content into the rim,
  **glare** brightens the content color (OKLab) instead of painting white, a **rim line** is brightest
  facing the light and fainter on the far side, a soft **shadow** grounds the element.
- **Adaptivity**: luminance behind each element is measured; the glass gets a light or dark veil and the element
  receives `data-lg-tone="light|dark"` and CSS variables `--lg-fg` / `--lg-fg-2` for its text and icons.

## Workflow

### 1. Look at the scene first

Before writing code, determine for every glass element (read the code; take a screenshot if you can):

| Question | Values |
|---|---|
| What is directly behind it? | `photo`, `video`, `gradient`, `map`, `3d`, `text`, `ui`, `list`, `solid` |
| How bright is that area? | `brightness` 0 (black) … 1 (white) |
| How busy is it (edges, small text, contrast)? | `busyness` 0 (flat) … 1 (dense text / detailed photo) |
| What is the element? | `button`, `toggle`, `badge`, `navbar`, `tabbar`, `toolbar`, `card`, `panel`, `sheet`, `menu`, `lens` |
| Size in CSS px | `{ w, h }` |
| Does it carry text that must stay readable? | `hasText` |
| How loud should it be? | `subtle`, `normal`, `showcase` |

### 2. Pick the engine

- **WebGL engine** – the glass sits on an `<img>`, `<video>`, `<canvas>`, a gradient, or a URL.
  Full fidelity in every browser with WebGL2. `LiquidGlass.create({ background, container })`.
- **DOM engine** – the glass floats over live page content (sticky navbar over an article, floating buttons).
  Real refraction via SVG `backdrop-filter` in Chromium (Chrome, Edge, Opera, Arc, Brave);
  Safari and Firefox get a tuned frosted fallback automatically. `LiquidGlass.create({ engine: 'dom' })`.

### 3. Choose parameters

Call `LiquidGlass.recommend(scene)` with the answers from step 1 and use its `params` — or read
[references/recipes.md](references/recipes.md) and decide by hand. State your reasoning in one or two
sentences to the user (e.g. "busy photo behind a navbar with text → Regular material, frost 6, dispersion 0.1").

```js
const { params, tone, material } = LiquidGlass.recommend({
  surface: 'photo', brightness: 0.32, busyness: 0.7, role: 'navbar', size: { w: 390, h: 62 },
});
```

Or let the library measure the background itself (WebGL engine only): `preset: 'auto'`.
Full parameter meanings and ranges: [references/parameters.md](references/parameters.md).

Core rules of thumb:

1. **Never let frost hide the lensing.** The refraction at the rim is what makes it Liquid Glass; heavy blur turns it back into ordinary glassmorphism.
2. **Behind = media → Clear material** (`frost` 0–1.5, low `veil`). Add frost only if the glass carries text over a busy image.
3. **Behind = text/UI → Regular material** (`frost` 1.5–4), keep `disp` ≤ 0.06 so fringes don't fizz on glyphs.
4. **Behind = flat color → nothing to refract.** Definition must come from `rimI` 0.9+, `contact` 1.4+, `shadowA` 0.28+, `fresnel` 0.6.
5. **Small controls** (≤ 64 px): `bezel = min(h/2, 22)`, `thickness ≈ 1.4 × bezel`. Whole surface becomes a dome.
6. **Bars**: `bezel` 26–30, `thickness` 40–46. **Panels/sheets**: `bezel` 30–34, `thickness` 46–54, `frost` 6–12.
7. **Magnifier / hero showcase**: `frost` 0, `refr` 1.3–1.6, `disp` 0.12–0.3, `zoom` 1.1–1.3.
8. `ior` stays 1.45–1.6 for glass; raise `refr` instead of `ior` if you want more bend.
9. Dark backgrounds need stronger `rimI`/`glareI`; light ones need stronger `shadowA`.
10. Never stack many large WebGL glass layers on mobile — `maxDpr: 1.5`, `dispN` ≤ 7.

### 4. Integrate

Copy `assets/liquid-glass.js` into the project's static folder (e.g. `public/vendor/liquid-glass.js`).

**WebGL engine (glass on a hero image):**

```html
<section class="hero">
  <img id="hero-bg" src="/hero.jpg" crossorigin="anonymous" alt="">
  <nav class="glass-nav">…</nav>
  <button class="glass-btn">Get started</button>
</section>
<script src="/vendor/liquid-glass.js"></script>
<script>
  const lg = LiquidGlass.create({ background: '#hero-bg', preset: 'auto' });
  lg.add('.glass-nav', { role: 'navbar' });
  lg.add('.glass-btn', { role: 'button' });
</script>
```

The image is hidden and redrawn by a canvas placed at `z-index:-1` inside the (isolated) container, so all other
content in the container stays on top. Cross-origin images need `crossorigin="anonymous"` and CORS headers.

**DOM engine (glass over a scrolling page):**

```js
const lg = LiquidGlass.create({ engine: 'dom', params: { frost: 4, disp: 0.06 } });
lg.add('header.sticky', { role: 'navbar', surface: 'text' });
lg.add('.fab', { role: 'button' });
```

**Text color:** style glass content with `color: var(--lg-fg)` (and `var(--lg-fg-2)` for secondary) so it flips
automatically with the background.

**Frameworks:** create in `useEffect` / `onMounted`, call `lg.destroy()` on unmount. Next.js / Nuxt: client only
(`dynamic(() => …, { ssr: false })` or `if (typeof window !== 'undefined')`).

API: `create(opts) → { add(target, opts), remove(target), set(params), destroy(), engine, params }`.
Per-element options: `role, surface, radius, frost, tint, tintA, zoom, bezel, thickness, refr, veil, rim,
shadow, group, interactive, tone`. Elements with the same `group` merge like liquid when `mergeK > 0` (WebGL engine).

### 5. Verify

- Open the page and check the console for `[liquid-glass]` warnings (CORS, WebGL2).
- Check the rim: lines/text behind the edge must bend smoothly; the center must stay sharp.
- Check legibility of glass text on the lightest and darkest part of the background.
- Respect accessibility: the library already switches to a heavy frost when the user prefers reduced transparency.
- Check frame rate on a mid-range phone; lower `maxDpr`, `dispN`, or `frost` if needed.

## Files

- `assets/liquid-glass.js` – the library (UMD; `window.LiquidGlass` or `require`).
- `references/parameters.md` – every parameter: physical meaning, range, visual effect.
- `references/recipes.md` – scene → parameter recipes with reasoning.
- `examples/hero-webgl.html`, `examples/navbar-dom.html`, `examples/auto-tune.html` – runnable examples.
