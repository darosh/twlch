# twlch

Tailwind scales interpolation. `twlch()` builds a 50–950 color scale from any color by interpolating Tailwind's hand-tuned OKLCH scales across the hue wheel, so a new scale has the same shape as a real Tailwind one. The scales can also be computed from fitted functions of shade and hue (`fourier`, `epicycles`).

**Demo:** https://darosh.github.io/twlch/

## Install

```bash
npm install @darosh/twlch
```

## Usage

```ts
import { twlch } from "@darosh/twlch";

const { swatches } = twlch("#3b82f6");
swatches.map((s) => s.hex);

// each swatch: { shade, l, c, h, hex }
// l, c, h: OKLCH, not gamut-mapped (may lie outside sRGB, like Tailwind's own values)
// hex: the same color gamut-mapped to sRGB

// Copy Tailwind's exact value, e.g. twlch("oklch(76.8% 0.233 130.85)"), to get its scale back unrounded.
```

Any color [colorjs.io](https://colorjs.io) can parse works as input. The result also reports the hue it landed on, the shade it anchored to (`anchorShade`) and the fit error.

### In the browser, without a bundler

The `<script>` build (`dist/browser/twlch.global.min.js`, about 10 kB gzipped) expects colorjs.io's own global build, which provides `Color`. The ES module build (`dist/browser/twlch.bundle.module.min.js`) bundles colorjs.io (about 38 kB gzipped).

```html
<script src="https://colorjs.io/dist/color.global.js"></script>
<script src="https://cdn.jsdelivr.net/npm/@darosh/twlch"></script>
<script>
  twlch.twlch("#3b82f6").swatches.map((s) => s.hex);
</script>

<script type="module">
  import { twlch } from "https://cdn.jsdelivr.net/npm/@darosh/twlch/dist/browser/twlch.bundle.module.min.js";
</script>
```

| file (in `dist/browser/`)              | colorjs.io bundled | size     | gzip     |
| -------------------------------------- | ------------------ | -------- | -------- |
| `twlch.global.min.js`                  | no                 | 11.68 kB | 5.38 kB  |
| `twlch.bundle.module.min.js`           | yes                | 93.36 kB | 37.70 kB |
| `twlch-fourier.global.min.js`          | no                 | 14.72 kB | 7.22 kB  |
| `twlch-fourier.bundle.module.min.js`   | yes                | 96.42 kB | 39.51 kB |
| `twlch-epicycles.global.min.js`        | no                 | 7.48 kB  | 3.77 kB  |
| `twlch-epicycles.bundle.module.min.js` | yes                | 89.17 kB | 36.07 kB |

With a bundler, keep using `import { twlch } from "@darosh/twlch"`; colorjs.io is then shared with your app.

### Computed scales (`fourier`, `epicycles`)

Instead of blending the 17 Tailwind families, the scale can be computed from a fitted model of the whole palette, a plain function of shade and hue. Pass `fourier: true` or `epicycles: true`:

```ts
import { twlch, twlchHue, epicyclesAt, fourierAt } from "@darosh/twlch";

twlch("#3b82f6", { fourier: true });
twlchHue(280, { epicycles: true });

epicyclesAt(425, 280); // { l, c, h } in OKLCH: any shade 50–950, any hue
fourierAt(425, 280);
```

|                   | numbers | mean ΔE | max ΔE | what it is                                                                                                                             |
| ----------------- | ------- | ------- | ------ | -------------------------------------------------------------------------------------------------------------------------------------- |
| `fourier: true`   | ~890    | 0.02    | 0.06   | Fourier series in hue (sums of cos/sin) whose coefficients are smooth functions of shade, plus a chroma bump and residuals             |
| `epicycles: true` | ~210    | 0.9     | 2.6    | a few shade patterns, each carried around the hue wheel by a handful of rotating circles (epicycles); each pattern a function of shade |

ΔE is the OKLab distance ×100 at the 17 Tailwind hues and the 11 shades. The Tailwind lightness is hand-tuned and too jagged for a short formula, so a smaller model costs visible error.

Both are generated as plain code with shade as a real parameter: `fourierAt(shade, hue)` and `epicyclesAt(shade, hue)` take any shade from 50 to 950 and return `{ l, c, h }` (OKLCH). `fourierCurve(hue)` and `epicyclesCurve(hue)` return the 11 Tailwind shades. In a computed set, `result.shade(n)` for an in-between shade such as 550 reads the function directly (also after `mode: "match"`); with a non-zero `delta`, or in the interpolated sets, it runs PCHIP through the swatches.

Refit with `pnpm fit:fourier` (`--digits` sets the written precision, default 4; `--shadeDeg` and `--shadeRidge` trade exactness at the 11 shades against smoothness between them) or `pnpm fit:epicycles` (a greedy search then a genetic algorithm choose the circles).

`@darosh/twlch/fourier` and `@darosh/twlch/epicycles` are single-model entries with no Tailwind data tables; `dist/browser/twlch-fourier.global.min.js` (global `twlchFourier`) and `dist/browser/twlch-epicycles.global.min.js` (global `twlchEpicycles`) are their `<script>` builds. The `dist/browser/*` builds contain neither model.

### Custom shades

```ts
const scale = twlch("#3b82f6");

// Any shade between 50 and 950, not only the eleven Tailwind has:
// (a monotone cubic through the swatches; in `fourier` / `epicycles` sets, the fitted function itself)
scale.shade(550).hex;
scale.shade(425); // { shade: 425, l, c, h, hex }

// A whole custom ramp, e.g. every 50 from 50 to 950:
Array.from({ length: 19 }, (_, i) => scale.shade(50 + i * 50).hex);
```

### Two modes

```ts
// "snap" (default): use the nearest Tailwind-like scale untouched.
twlch("#3b82f6", { mode: "snap" });

// "match": bend the nearest scale so it passes exactly through your color.
twlch("#3b82f6", { mode: "match" });

// Say which shade your color is, instead of letting twlch find the closest one.
twlch("#3b82f6", { shade: 600 });
```

### Chroma as a delta

```ts
// C = curve(hue, shade) * (1 + delta); 0 is an exact match. Only `hex` is clamped to sRGB.
twlch("#3b82f6", { mode: "snap", delta: 0.2 }); // 20% more chroma than the curve
twlch("#3b82f6", { mode: "snap", delta: -0.4 }); // quieter

// Desaturate a generated orange scale by 40%:
twlch("#ff8400"); // as generated
twlch("#ff8400", { delta: -0.4 }); // 40% less chroma at every shade
```

### Datasets and interpolation

```ts
// Low-chroma Tailwind families (slate, gray, zinc, …) are a separate dataset.
twlch("#64748b", { dataset: "neutral" });

// How neighbouring families are blended around the wheel.
twlch("#3b82f6", { interpolation: "smooth" }); // monotone cubic, default
twlch("#3b82f6", { interpolation: "linear" });

// Bring your own families: { name, l[11], c[11], h[11] }
twlch("#3b82f6", { dataset: myFamilies });
```

### Scales without a color

```ts
import { twlchHue, twlchAnchors } from "@darosh/twlch";

twlchHue(250); // the scale at hue 250° (the shade-500 hue)
twlchHue(250, { delta: -0.2 });

// Tailwind's own shade-500 hues, sorted. Interpolate between neighbours for more scales:
const a = twlchAnchors();
twlchHue((a[3] + a[4]) / 2);
```

### Tailwind data

The dataset the scales are built from is exported too:

```ts
import { tailwind } from "@darosh/twlch";
import type { Family } from "@darosh/twlch";

tailwind.chromatic; // Family[] — { name, l[11], c[11], h[11] }
tailwind.neutral;
```

### How it works

- Each family is placed on the wheel by its shade-500 hue. For every shade, lightness, chroma and hue drift are interpolated around the wheel with a periodic curve, so the result never overshoots the data.
- Hue drift is stored per shade, so the curve follows Tailwind's hue stretch, such as the widening green–yellow gap in the darkest shades.
- `"match"` shifts lightness, hue and chroma toward your color with a smooth falloff, and leaves 50 and 950 on the dataset.

## Development

This is a [Vite+](https://viteplus.dev) project: the library lives in `src/`, the demo site in `apps/demo`.

```bash
vp install          # install dependencies
vp run demo         # run the demo dev server
vp test             # run the tests
vp pack             # build the library into dist/
vp run ready        # check + test + build library and demo
vp run extract      # regenerate src/data.generated.ts from the installed tailwindcss
vp run loo          # leave-one-out validation of the interpolation
vp run deploy       # build the demo and publish it to the gh-pages branch
```

`deploy` builds with base path `/twlch/` (override with `TWLCH_BASE`) and force-pushes the result to the `gh-pages` branch of `origin`. Set GitHub Pages to serve from that branch.

Only `dist/`, `README.md`, `LICENSE` and `package.json` are published (`pnpm pack --dry-run` to check).

## Acknowledgements

- Colors from [Tailwind CSS](https://tailwindcss.com).
- Names from [colornames-oklab](https://github.com/meodai/colornames-oklab).
- Type is [Allo](https://allo.joshpuckett.me).
