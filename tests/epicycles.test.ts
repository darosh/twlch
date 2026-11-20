import { tailwind } from "../src/data.ts";
import { expect, test } from "vite-plus/test";
import * as standalone from "../src/index-epicycles.ts";
import { epicyclesAt, epicyclesCurve, twlch, twlchAnchors, twlchHue } from "../src/index.ts";

const de = (p: [number, number, number], q: [number, number, number]) => {
  const r = Math.PI / 180;
  const ab = ([, c, h]: [number, number, number]) => [c * Math.cos(h * r), c * Math.sin(h * r)];
  const [a1, b1] = ab(p);
  const [a2, b2] = ab(q);
  return 100 * Math.hypot(p[0] - q[0], a1 - a2, b1 - b2);
};

test("epicycles reproduces the Tailwind chromatic families from their hue alone", () => {
  let sum = 0;
  let count = 0;
  for (const f of tailwind.chromatic) {
    const r = twlchHue(f.h[5], { epicycles: true });
    r.swatches.forEach((s, i) => {
      const e = de([s.l, s.c, s.h], [f.l[i], f.c[i], f.h[i]]);
      expect(e).toBeLessThan(3);
      sum += e;
      count++;
    });
  }
  expect(sum / count).toBeLessThan(1);
});

test("epicycles is periodic in hue and has the dataset's anchors", () => {
  const a = twlchHue(10, { epicycles: true });
  const b = twlchHue(370, { epicycles: true });
  expect(a.swatches.map((s) => s.hex)).toEqual(b.swatches.map((s) => s.hex));
  const model = twlchAnchors("chromatic", "smooth", "epicycles");
  const real = twlchAnchors("chromatic");
  expect(model).toHaveLength(real.length);
  model.forEach((h, i) => expect(Math.abs(h - real[i])).toBeLessThan(0.01));
});

test("epicycles works from a colour and in match mode", () => {
  const r = twlch("oklch(0.62 0.17 200)", { epicycles: true, mode: "match" });
  const s = r.swatches.find((x) => x.shade === r.anchorShade)!;
  expect(Math.abs(s.l - 0.62)).toBeLessThan(0.01);
});

test("the standalone entry gives the same scales", () => {
  for (const color of ["#3b82f6", "#ef4444", "oklch(0.7 0.15 130)"]) {
    expect(standalone.twlch(color).swatches).toEqual(twlch(color, { epicycles: true }).swatches);
  }
  expect(standalone.twlchAnchors()).toHaveLength(tailwind.chromatic.length);
});

test("epicyclesAt takes shade as a parameter, continuous between the Tailwind shades", () => {
  for (const hue of [20, 130, 260, 340]) {
    const curve = epicyclesCurve(hue);
    tailwind.shades.forEach((shade, i) => {
      expect(epicyclesAt(shade, hue)).toEqual(curve[i]);
    });
    // lightness falls with shade, so an in-between shade lies between its neighbours
    for (const [lo, mid, hi] of [
      [100, 150, 200],
      [300, 350, 400],
      [800, 850, 900],
    ]) {
      const [a, m, b] = [lo, mid, hi].map((s) => epicyclesAt(s, hue).l);
      expect(m).toBeLessThan(a);
      expect(m).toBeGreaterThan(b);
    }
  }
});
