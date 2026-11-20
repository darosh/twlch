import { tailwind } from "../src/data.ts";
import { expect, test } from "vite-plus/test";
import * as standalone from "../src/fourier.ts";
import { twlch, twlchAnchors, twlchHue } from "../src/index.ts";

const de = (p: [number, number, number], q: [number, number, number]) => {
  const r = Math.PI / 180;
  const ab = ([, c, h]: [number, number, number]) => [c * Math.cos(h * r), c * Math.sin(h * r)];
  const [a1, b1] = ab(p);
  const [a2, b2] = ab(q);
  return 100 * Math.hypot(p[0] - q[0], a1 - a2, b1 - b2);
};

test("fourier reproduces the Tailwind chromatic families from their hue alone", () => {
  let sum = 0;
  let count = 0;
  for (const f of tailwind.chromatic) {
    const r = twlchHue(f.h[5], { fourier: true });
    r.swatches.forEach((s, i) => {
      const e = de([s.l, s.c, s.h], [f.l[i], f.c[i], f.h[i]]);
      expect(e).toBeLessThan(0.1);
      sum += e;
      count++;
    });
  }
  expect(sum / count).toBeLessThan(0.05);
});

test("fourier is periodic in hue and has the dataset's anchors", () => {
  const a = twlchHue(10, { fourier: true });
  const b = twlchHue(370, { fourier: true });
  expect(a.swatches.map((s) => s.hex)).toEqual(b.swatches.map((s) => s.hex));
  const model = twlchAnchors("chromatic", "smooth", "fourier");
  const real = twlchAnchors("chromatic");
  expect(model).toHaveLength(real.length);
  model.forEach((h, i) => expect(Math.abs(h - real[i])).toBeLessThan(0.01));
});

test("fourier works from a colour and in match mode", () => {
  const r = twlch("oklch(0.62 0.17 200)", { fourier: true, mode: "match" });
  const s = r.swatches.find((x) => x.shade === r.anchorShade)!;
  expect(Math.abs(s.l - 0.62)).toBeLessThan(0.01);
});

test("the standalone entry gives the same scales", () => {
  for (const color of ["#3b82f6", "#ef4444", "oklch(0.7 0.15 130)"]) {
    expect(standalone.twlch(color).swatches).toEqual(twlch(color, { fourier: true }).swatches);
  }
  expect(standalone.twlchAnchors()).toHaveLength(tailwind.chromatic.length);
});
