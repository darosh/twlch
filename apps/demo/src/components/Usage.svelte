<script lang="ts">
  import { twlch, twlchAnchors, twlchHue } from "@darosh/twlch";
  import type { TwlchResult } from "@darosh/twlch";
  import Code from "./Code.svelte";
  import Output from "./Output.svelte";

  // Real output, so the docs can't drift from the library.
  const sample = twlch("#3b82f6");
  const hexes = sample.swatches.map((s) => `"${s.hex}"`).join(", ");
  const shade550 = sample.shade(550);

  // Everything below is computed by the library, mirroring the code samples.
  const all = (r: TwlchResult) => r.swatches.map((s) => ({ hex: s.hex, title: `${s.shade} ${s.hex}` }));
  const one = (s: { shade: number; hex: string }) => [{ hex: s.hex, title: `${s.shade} ${s.hex}` }];
  const blue = "#3b82f6";
  const anchors = twlchAnchors();
  const out = {
    generate: [{ label: `twlch("${blue}")`, colors: all(sample) }],
    custom: [
      { label: "scale.shade(550)", colors: one(sample.shade(550)) },
      { label: "scale.shade(425)", colors: one(sample.shade(425)) },
      {
        label: "every 50, 50 → 950",
        colors: Array.from({ length: 19 }, (_, i) => sample.shade(50 + i * 50)).map((s) => ({ hex: s.hex, title: `${s.shade} ${s.hex}` })),
      },
    ],
    modes: [
      { label: 'mode: "snap"', colors: all(twlch(blue, { mode: "snap" })) },
      { label: 'mode: "match"', colors: all(twlch(blue, { mode: "match" })) },
      { label: "shade: 600", colors: all(twlch(blue, { shade: 600 })) },
    ],
    delta: [
      { label: "delta: 0.2", colors: all(twlch(blue, { mode: "snap", delta: 0.2 })) },
      { label: "delta: -0.4", colors: all(twlch(blue, { mode: "snap", delta: -0.4 })) },
      { label: 'twlch("#ff8400")', colors: all(twlch("#ff8400")) },
      { label: 'twlch("#ff8400", delta -0.4)', colors: all(twlch("#ff8400", { delta: -0.4 })) },
    ],
    datasets: [
      { label: 'dataset: "neutral"', colors: all(twlch("#64748b", { dataset: "neutral" })) },
      { label: 'interpolation: "smooth"', colors: all(twlch(blue, { interpolation: "smooth" })) },
      { label: 'interpolation: "linear"', colors: all(twlch(blue, { interpolation: "linear" })) },
    ],
    hue: [
      { label: "twlchHue(250)", colors: all(twlchHue(250)) },
      { label: "twlchHue(250, delta -0.2)", colors: all(twlchHue(250, { delta: -0.2 })) },
      { label: "twlchHue(between)", colors: all(twlchHue((anchors[3] + anchors[4]) / 2)) },
    ],
  };
</script>

<section id="usage" class="flex flex-col gap-6 scroll-mt-4">
  <div class="mb-2">
    <h2 class="display text-2xl mb-4">Usage</h2>
    <p class="text-sm text-muted-foreground">
      <code>twlch()</code> builds a 50–950 scale by interpolating Tailwind's hand-tuned OKLCH scales across the hue wheel. Lightness, chroma and hue drift all come from the neighbouring Tailwind families, so a new scale gets the same shape as a real one.
    </p>
  </div>

  <div class="flex flex-col gap-2">
    <h3 class="font-semibold">Generate a scale</h3>
    <Code
      code={`import { twlch } from "@darosh/twlch";

const { swatches } = twlch("#3b82f6");
swatches.map((s) => s.hex);
// [${hexes}]

// each swatch: { shade, l, c, h, hex }
// l, c, h: OKLCH, not gamut-mapped (may lie outside sRGB, like Tailwind's own values)
// hex: the same color gamut-mapped to sRGB`}
    />
    <Output rows={out.generate} />
    <p class="text-sm text-muted-foreground">Any color <a class="underline" href="https://colorjs.io">colorjs.io</a> can parse works as input. Feed it Tailwind's exact oklch value (e.g. <code>oklch(76.8% 0.233 130.85)</code>) and use the oklch values to keep vivid colors that sRGB would clip; <code>hex</code> is always safe for sRGB. The result also reports the hue it landed on, the shade it anchored to (<code>anchorShade</code>) and the fit error.</p>
  </div>

  <div class="flex flex-col gap-2">
    <h3 class="font-semibold">Custom shades</h3>
    <Code
      code={`const scale = twlch("#3b82f6");

// Any shade between 50 and 950, not only the eleven Tailwind has:
scale.shade(550).hex;   // ${shade550.hex}
scale.shade(425);       // { shade: 425, l, c, h, hex }

// Read a whole custom ramp, e.g. every 50 from 50 to 950:
Array.from({ length: 19 }, (_, i) => scale.shade(50 + i * 50).hex);`}
    />
    <Output rows={out.custom} />
    <p class="text-sm text-muted-foreground">In-between shades follow the same smooth curves as the scale, in OKLCH. <code>l c h</code> are unclipped and <code>hex</code> is mapped to sRGB, so it lands between its neighbours (550 sits between 500 and 600).</p>
  </div>

  <div class="flex flex-col gap-2">
    <h3 class="font-semibold">Two modes</h3>
    <Code
      code={`// "snap" (default): use the nearest Tailwind-like scale untouched.
twlch("#3b82f6", { mode: "snap" });

// "match": bend the nearest scale so it passes exactly through your color.
twlch("#3b82f6", { mode: "match" });

// Say which shade your color is, instead of letting twlch find the closest one.
twlch("#3b82f6", { shade: 600 });`}
    />
    <Output rows={out.modes} />
  </div>

  <div class="flex flex-col gap-2">
    <h3 class="font-semibold">Chroma as a delta</h3>
    <Code
      code={`// C = curve(hue, shade) * (1 + delta); 0 is an exact match. Only \`hex\` is clamped to sRGB.
twlch("#3b82f6", { mode: "snap", delta: 0.2 });   // 20% more chroma than the curve
twlch("#3b82f6", { mode: "snap", delta: -0.4 });  // quieter

// Desaturate a generated orange scale by 40%:
twlch("#ff8400");                                 // as generated
twlch("#ff8400", { delta: -0.4 });                // 40% less chroma at every shade`}
    />
    <Output rows={out.delta} />
  </div>

  <div class="flex flex-col gap-2">
    <h3 class="font-semibold">Datasets and interpolation</h3>
    <Code
      code={`// Low-chroma Tailwind families (slate, gray, zinc, …) are a separate dataset.
twlch("#64748b", { dataset: "neutral" });

// How neighbouring families are blended around the wheel.
twlch("#3b82f6", { interpolation: "smooth" }); // monotone cubic, default
twlch("#3b82f6", { interpolation: "linear" });

// Bring your own families: { name, l[11], c[11], h[11] }
twlch("#3b82f6", { dataset: myFamilies });`}
    />
    <Output rows={out.datasets} />
  </div>

  <div class="flex flex-col gap-2">
    <h3 class="font-semibold">Scales without a color</h3>
    <Code
      code={`import { twlchHue, twlchAnchors } from "@darosh/twlch";

twlchHue(250);                      // the scale at hue 250° (the shade-500 hue)
twlchHue(250, { delta: -0.2 });

// Tailwind's own shade-500 hues, sorted. Interpolate between neighbours for more scales:
const a = twlchAnchors();
const between = (a[3] + a[4]) / 2;
twlchHue(between);`}
    />
    <Output rows={out.hue} />
  </div>

  <div class="flex flex-col gap-2">
    <h3 class="font-semibold">How it works</h3>
    <ul class="list-disc pl-5 text-sm text-muted-foreground">
      <li>Each family is placed on the wheel by its shade-500 hue. For every shade, lightness, chroma and hue drift are interpolated around the wheel with a periodic curve, so the result never overshoots the data.</li>
      <li>Hue drift is stored per shade, so the curve follows Tailwind's hue stretch, such as the widening green–yellow gap in the darkest shades.</li>
      <li>"match" shifts lightness, hue and chroma toward your color with a smooth falloff, and leaves 50 and 950 on the dataset.</li>
    </ul>

    <h4 class="mt-2 font-semibold">Acknowledgements</h4>
    <ul class="list-disc pl-5 text-sm text-muted-foreground">
      <li>Colors from <a class="underline" href="https://tailwindcss.com">Tailwind CSS</a>.</li>
      <li>Names from <a class="underline" href="https://github.com/meodai/colornames-oklab">colornames-oklab</a>.</li>
      <li>Type is <a class="underline" href="https://allo.joshpuckett.me">Allo</a>.</li>
    </ul>
  </div>
</section>
