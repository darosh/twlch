import { expect, test } from "vite-plus/test";
import { twlch, twlchHue } from "../src/index.ts";
import type { TwlchOptions } from "../src/index.ts";

const models: [string, TwlchOptions][] = [
  ["interpolated families", {}],
  ["fourier", { fourier: true }],
  ["epicycles", { epicycles: true }],
];

// Between pink (shade-500 hue 354.3°) and rose (16.4°), where shades 500 and 600 pull the hue apart.
const hues = [358, 2, 6, 9, 12];

for (const [name, opts] of models) {
  test(`${name}: a colour at shade 450 between pink and rose is found again on the curve`, () => {
    for (const hue of hues) {
      const s = twlchHue(hue, opts).shade(450);
      const input = `oklch(${s.l} ${s.c} ${s.h})`; // unclipped, so no gamut rounding
      const r = twlch(input, opts);
      const where = `${name} hue ${hue}`;
      // lies on the curve (straight lines between labels vs. the model's own function: tiny gap)
      expect(r.curveError, where).toBeLessThan(0.5);
      // found at the right shade, not a label away
      expect(Math.abs(r.curveShade - 450), where).toBeLessThan(15);
      // and on the right scale: the hue of its shade-500 stays where it was made
      expect(Math.abs(r.hue - twlchHue(hue, opts).swatches[5].h), where).toBeLessThan(2);
      // continuous distance never exceeds the distance to the anchor label
      expect(r.curveError, where).toBeLessThanOrEqual(r.error + 1e-9);
    }
  });
}
