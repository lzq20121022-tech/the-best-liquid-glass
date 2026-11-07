# Scene → parameter recipes

Start from the closest recipe, then adjust with the modifiers at the bottom.
`LiquidGlass.recommend()` implements the same logic; use it when you can measure brightness/busyness.

## Recipes

| Scene | Engine | Params | Why |
|---|---|---|---|
| **Tab bar / navbar over a photo or video** | webgl (dom if over page) | `frost 1–3, veil 0.05, disp 0.08–0.1, bezel 28, thickness 44, sat 1.2` | Clear-ish so the image shows through, just enough frost for labels. |
| **Navbar over an article (text)** | dom | `frost 1.5–3, veil 0.08, disp 0.05, dispN 5, bezel 26, thickness 40` | Text behind is high-frequency: blur it slightly so labels win, keep fringes calm. |
| **Floating circular button (44–64 px)** | either | `bezel = h/2, thickness ≈ 0.7·h, frost 1, rimI 0.85, shadowR 16, shadowY 5` | Small → whole button is a dome lens, crisp rim, tight shadow. |
| **Toggle / slider knob while dragging** | webgl | `frost 0, zoom 1.15–1.25, veil 0, refr 1` | A clear lens that magnifies the track — the iOS 26 knob. |
| **Card on a gradient / mesh background** | webgl | `frost 3–6, veil 0.08, bezel 32, thickness 46, disp 0.1` | Gradients are smooth, refraction reads as gentle color shifts; frost adds body. |
| **Large panel / sheet / sidebar** | either | `frost 6–12, veil 0.12, sat 1.45, bezel 30–34, thickness 46–54, shadowA 0.28, shadowR 36` | Big surfaces are "thicker" glass: more frost and shadow, still a lensing rim. |
| **Menu that morphs out of a button** | webgl | panel recipe + `mergeK 30–50`, same `group` as the button | Liquid merge during the morph. |
| **Magnifier / loupe / hero showpiece** | webgl | `frost 0, refr 1.3–1.6, disp 0.12–0.3, dispN 9–12, zoom 1.1–1.3, bezel 34–40, thickness 52–56` | Maximum optics, nothing hidden by blur. |
| **Glass on a flat solid color** | either | `rimI 0.95, glareI 0.95, fresnel 0.6, contact 1.6, shadowA 0.28–0.32, disp 0.02, frost ≤ 4` | Nothing to refract: definition comes from light and shadow. |
| **Dark UI (black / deep navy)** | either | `+rimI 0.1, +glareI 0.1, veil 0.12 (dark), shadowA +0.05` | Edges must catch light to be seen. |
| **Bright UI (white page)** | either | `shadowA 0.25–0.3, ambient edge (default), veil 0.08 (light)` | Shadow and the refracted surroundings carry the shape. |
| **Video background** | webgl | `frost ≤ 4, dispN ≤ 7, maxDpr 1.5` | Moving content already reads as glass; keep it cheap. |
| **Map / 3D canvas** | webgl (`background: canvas`) | Clear recipe, `liveBackground: true` | Re-sampled every frame. |

## Modifiers

- **Busyness** (0–1): `frost += busyness × 3` for glass that carries text; `disp −= busyness × 0.03`. Never so much that the rim refraction disappears.
- **Brightness** > 0.58 → light tone (dark glyphs, white veil); < 0.42 → dark tone (white glyphs, black veil).
- **Emphasis** `subtle`: `refr ≤ 0.8, disp ≤ 0.04, rimI ≤ 0.45`. `showcase`: `refr ≥ 1.3, disp ≥ 0.18, frost ≤ 2`.
- **Mobile**: `maxDpr 1.5`, `dispN ≤ 7`, avoid more than ~6 glass elements in one WebGL container.
- **Accessibility**: if text contrast on glass is below 4.5:1 at the worst spot, raise `veil` first, then `frost`.

## Reading a screenshot

- Average the luminance of the area under the element → `brightness`.
- Count edges / small text in that area → `busyness` (empty sky 0.1, photo of foliage 0.7, paragraph text 0.8).
- Note the element role and size from the DOM.
- Then call `recommend()` and apply its `params` and `tone`.
