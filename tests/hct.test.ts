import Color from "colorjs.io";
import { expect, test } from "vite-plus/test";
import { hctAt, hctHue } from "../src/calc.hct.ts";
import { hctToLinear } from "../src/hct.ts";
import * as standalone from "../src/index-hct.ts";
import { twlch, twlchAnchors, twlchHue } from "../src/index.ts";

test("hctToLinear agrees with colorjs.io's HCT space", () => {
  for (let i = 0; i < 200; i++) {
    const [h, c, t] = [(i * 137.5) % 360, (i * 7) % 40, 3 + ((i * 13) % 94)];
    const want = new Color("hct", [h, c, t]).to("srgb-linear").coords;
    hctToLinear(h, c, t).forEach((v, k) => expect(v).toBeCloseTo(want[k] ?? 0, 6));
  }
});

test("hct scales are inside Display P3, light to dark, in 11 shades", () => {
  for (const hue of [0, 25, 90, 150, 200, 260, 300, 340]) {
    const r = twlchHue(hue, { hct: true });
    expect(r.swatches).toHaveLength(11);
    for (const s of r.swatches)
      expect(new Color("oklch", [s.l, s.c, s.h]).inGamut("p3")).toBe(true);
    r.swatches.forEach((s, i) => i && expect(s.l).toBeLessThan(r.swatches[i - 1].l));
  }
});

test("hct is periodic in hue and its hue map is a small offset", () => {
  expect(hctAt(500, 10).l).toBeCloseTo(hctAt(500, 370).l, 9);
  for (let h = 0; h < 360; h += 15) {
    const d = ((hctHue(h) - h + 540) % 360) - 180;
    expect(Math.abs(d)).toBeLessThan(15);
  }
});

test("hct: options and standalone entry", () => {
  const r = twlch("#3b82f6", { hct: true });
  expect(r.swatches[5].hex).toBe(r.shade(500).hex);
  expect(r.shade(425).l).toBeLessThan(r.shade(400).l);
  expect(r.shade(425).l).toBeGreaterThan(r.shade(500).l);
  expect(standalone.twlch("#3b82f6").swatches.map((s) => s.hex)).toEqual(
    r.swatches.map((s) => s.hex),
  );
  expect(twlchAnchors("chromatic", "smooth", "hct")).toHaveLength(17);
  expect(() => twlch("#3b82f6", { hct: true, fourier: true })).toThrow();
});
