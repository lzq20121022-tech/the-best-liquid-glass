# Parameters

All lengths are CSS pixels. Global parameters go in `create({ params })` or `lg.set()`;
the ones marked **per-element** can also be passed to `lg.add(el, { … })`.

## Lensing

| Param | Default | Range | Meaning / visual effect |
|---|---|---|---|
| `ior` | 1.5 | 1.0–2.4 | Index of refraction. 1.0 = no bend, 1.33 water, 1.5 glass, 2.4 diamond. Changes the *strength* of rim bending non-linearly; prefer `refr` for art direction. |
| `thickness` **per-element** | 44 | 0–90 | Height of the dome. More height = rays travel further = larger displacement at the rim. Scaled down automatically for small elements. |
| `bezel` **per-element** | 30 | 4–70 | Width of the curved rim, measured inward from the edge. Lensing only happens inside it; the rest is flat and clear. Clamped to half the element's short side. |
| `base` | 0 | 0–30 | Extra flat slab under the dome. Adds a sharp, strong band right at the edge (thick-crystal look). |
| `refr` **per-element** | 1.2 | −2–3 | Multiplier on displacement. Negative values sample outward (concave look: the rim shows what is outside). |
| `profile` | 0 | 0, 1, 2 | Surface curve: 0 convex squircle (soft flat→rim transition, Apple-like), 1 convex circle (harsher), 2 lip (raised rim, shallow center dip). |
| `zoom` **per-element** | 1 | 0.6–2 | Magnifies the flat center (magnifier / loupe). |
| `noInvert` | `true` | bool | Keep refracted samples on their side of the shape's medial axis (no rod-like upside-down image in bars). Set `false` for Siri-style droplets. |
| `cornerN` | 3.25 | 2–6 | Superellipse exponent of the corners. 2 = circular `border-radius`; ~3.25 ≈ iOS continuous corners. |

## Dispersion

| Param | Default | Range | Meaning |
|---|---|---|---|
| `disp` | 0.08 | 0–0.5 | IOR spread across the visible spectrum (red → violet). 0.03 subtle, 0.08 natural, 0.2+ prism. |
| `dispN` | 7 | 1–16 | Spectral samples. 3 = RGB split; 6–9 = smooth rainbow; more costs GPU. DOM engine always uses 3 channels. |

## Material

| Param | Default | Range | Meaning |
|---|---|---|---|
| `frost` **per-element** | 1.5 | 0–40 | Backdrop blur (σ). 0 = Clear material; 1.5–4 = Regular; 6–14 = thick panels/sheets. Too much frost hides the lensing. |
| `sat` | 1.35 | 0–2.5 | Vibrancy — saturation of what is seen through the glass. |
| `bright` | 1.04 | 0.6–1.4 | Brightness multiplier of the backdrop. |
| `tint`, `tintA` **per-element** | `#fff`, 0 | color, 0–1 | Colored glass. Keep `tintA` ≤ 0.35 so the content still shows. |
| `veil` **per-element** | 0.06 | 0–0.5 | Adaptive veil: white over light content, black over dark content. Raises legibility of glass text. |
| `adapt` | 1 | 0–1 | How much the veil/tone follows the background (0 = always light). |

## Light

| Param | Default | Range | Meaning |
|---|---|---|---|
| `lightAngle` | −135 | −180–180 | Direction the light comes from, in screen space (−135 = top-left, −90 = top). |
| `rimI` / `rimW` / `rimFar` | 0.85 / 2.2 / 0.6 | | Thin rim line: intensity, width, strength on the side facing away from the light. |
| `glareI` / `glareR` / `glareConv` / `glareFar` | 0.9 / 14 / 2.2 / 0.55 | | Broad specular inside the rim: intensity, reach inward, angular focus, far-side strength. Colored by the content. |
| `fresnel` | 0.5 | 0–1 | Reflection at grazing angles: outside content mirrored into the very edge. |
| `contact` | 1.2 | 0–3 | The shadow under the glass, refracted into the rim: a curved grey inner ring that makes the glass read as thick on light backgrounds. |

## Shadow & merging

| Param | Default | Range | Meaning |
|---|---|---|---|
| `shadowA` / `shadowR` / `shadowY` | 0.22 / 24 / 8 | | Drop shadow opacity, softness, offset. Per-element `shadow` multiplies opacity. |
| `mergeK` | 0 | 0–140 | Liquid merge distance (smooth-min of SDFs) for elements sharing the same `group`. |

## Motion (per element, both engines)

| Option | Default | Meaning |
|---|---|---|
| `draggable` | `false` | `true` or `{ bounds, inertia, snapBack, axis, snap }`. Spring-follow while dragging (slight lag + overshoot), jelly stretch along the velocity, throw on release. |
| `draggable.bounds` | `'container'` | `'container'` (engine container / offset parent), `'parent'`, `'window'`, a selector or element, or `null` for none. Beyond the bounds the drag rubber-bands; the throw is clamped. |
| `draggable.inertia` | `true` | Project the release velocity (~0.16 s) and glide there with a spring. |
| `draggable.snapBack` | `false` | Spring back to the layout position on release. |
| `draggable.axis` | `null` | `'x'` or `'y'` to lock movement. |
| `draggable.snap` | `null` | Array of `{x, y}` offsets (nearest wins) or `fn({x, y, vx, vy}) → {x, y}`. |
| `pressScale` | 0.05 (0.06 draggable) | Springy energize scale while pressed. 0 disables. |
| `jelly` | 1 | Stretch amount multiplier (0 rigid, 1.5 very wobbly). |
| `interactive` | `true` | Set `false` to disable press animation and glow. |

`lg.tabbar(el, { items, selected, onChange, glass })` — items default to the bar's children; the selected item gets
the class `lg-selected`; the bar emits `lg:change`. `lg.moveTo(el, x, y, animate = true)` moves a draggable element.
Events (bubble): `lg:dragstart`, `lg:drag`, `lg:dragend` (`detail: { x, y, vx, vy }`), `lg:change` (`detail: { index }`).

## Presets

| Preset | Look |
|---|---|
| `default` | Almost clear, prism fringes (frost 0.5, dispersion 0.16) |
| `regular` | Apple Regular: frost 9, veil 0.32, crisp grey ring, little dispersion |
| `clear` | Apple Clear: frost 3, no veil, slight lift, dispersion 0.1 |
| `crystal` | Siri orb: no frost, dispersion 0.14 × 16 taps, convex-circle dome, zoom 1.25, inversion allowed |
| `prism` | Exaggerated dispersion for show |
| `thick` | Heavy frosted slab |
| `subtle` | Low-key glass for dense UIs |
| `tinted` | Colored glass |
| `auto` | Measure the background and choose per element (WebGL engine) |

## Engine options (`create`)

| Option | Meaning |
|---|---|
| `background` | `<img>`, `<video>`, `<canvas>`, selector, URL, `{ colors: [...], angle }` or a CSS color → WebGL engine. |
| `container` | Element the canvas is placed in (default: the background's parent). |
| `engine` | `'webgl'` or `'dom'` to force an engine. |
| `preset` | `'regular'`, `'clear'`, `'thick'`, `'prism'`, `'subtle'`, `'tinted'`, or `'auto'` (measure background & choose per element). |
| `params` | Parameter overrides. |
| `liveBackground` | For `<canvas>` backgrounds: re-upload every frame (default true). |
| `respectReducedTransparency` | Default true: heavy frost when the OS asks for reduced transparency. |
