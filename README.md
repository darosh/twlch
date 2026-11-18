# twlch

Tailwind scales interpolation. `twlch()` builds a 50–950 color scale from any color by interpolating Tailwind's hand-tuned OKLCH scales across the hue wheel, so a new scale has the same shape as a real Tailwind one.

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

`dist/twlch.browser.*` bundles colorjs.io (about 38 kB gzipped) for CDNs and plain pages.

```html
<script src="https://cdn.jsdelivr.net/npm/@darosh/twlch"></script>
<script>
  twlch.twlch("#3b82f6").swatches.map((s) => s.hex);
</script>

<script type="module">
  import { twlch } from "https://cdn.jsdelivr.net/npm/@darosh/twlch/dist/twlch.browser.js";
</script>
```

With a bundler, keep using `import { twlch } from "@darosh/twlch"`; colorjs.io is then shared with your app.

### Custom shades

```ts
const scale = twlch("#3b82f6");

// Any shade between 50 and 950, not only the eleven Tailwind has:
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
vp run extract      # regenerate src/tailwind.generated.ts from the installed tailwindcss
vp run loo          # leave-one-out validation of the interpolation
vp run deploy       # build the demo and publish it to the gh-pages branch
```

`deploy` builds with base path `/twlch/` (override with `TWLCH_BASE`) and force-pushes the result to the `gh-pages` branch of `origin`. Set GitHub Pages to serve from that branch.

Only `dist/`, `README.md`, `LICENSE` and `package.json` are published (`pnpm pack --dry-run` to check).

## Acknowledgements

- Colors from [Tailwind CSS](https://tailwindcss.com).
- Names from [colornames-oklab](https://github.com/meodai/colornames-oklab).
- Type is [Allo](https://allo.joshpuckett.me).
