import { expect, test } from "vite-plus/test";
import { epicyclesAt, fourierAt, twlch, twlchHue } from "../src/index.ts";

for (const [name, at] of [
  ["fourier", fourierAt],
  ["epicycles", epicyclesAt],
] as const) {
  const opts = { [name]: true } as { fourier?: boolean; epicycles?: boolean };

  test(`${name}: shade(n) reads the function between the Tailwind shades`, () => {
    const r = twlchHue(200, opts);
    const f = at(150, 200);
    const s = r.shade(150);
    expect(s.l).toBeCloseTo(f.l, 9);
    expect(s.c).toBeCloseTo(f.c, 9);
    expect(r.shade(100)).toEqual(r.swatches[1]);
    expect(() => r.shade(40)).toThrow(RangeError);
  });

  test(`${name}: match bends in-between shades continuously through the anchor`, () => {
    const r = twlch("oklch(0.62 0.17 200)", { ...opts, mode: "match" });
    const anchor = r.swatches.find((s) => s.shade === r.anchorShade)!;
    for (const d of [-1, 1]) {
      const s = r.shade(r.anchorShade + d);
      expect(Math.abs(s.l - anchor.l)).toBeLessThan(0.005);
      expect(Math.abs(s.c - anchor.c)).toBeLessThan(0.005);
    }
  });

  test(`${name}: with a delta, in-between shades fall back to PCHIP through the swatches`, () => {
    const r = twlchHue(200, { ...opts, delta: 0.2 });
    const [a, b] = [r.swatches[1].c, r.swatches[2].c].sort((x, y) => x - y);
    const c = r.shade(150).c;
    expect(c).toBeGreaterThanOrEqual(a - 1e-9);
    expect(c).toBeLessThanOrEqual(b + 1e-9);
  });
}

test("interpolated sets still run PCHIP between the shades", () => {
  const r = twlchHue(200);
  const [a, b] = [r.swatches[1].l, r.swatches[2].l].sort((x, y) => x - y);
  expect(r.shade(150).l).toBeGreaterThan(a);
  expect(r.shade(150).l).toBeLessThan(b);
});
