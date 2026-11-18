import Color from "colorjs.io";
import { tailwind } from "../src/data.ts";
import { expect, test } from "vite-plus/test";
import { twlch, twlchAnchors, twlchHue } from "../src/index.ts";

const fam = (n: string) => tailwind.chromatic.find((f) => f.name === n)!;
const css = (f: { l: number[]; c: number[]; h: number[] }, i: number) =>
  `oklch(${f.l[i]} ${f.c[i]} ${f.h[i]})`;

test("snap on a Tailwind colour reproduces that family", () => {
  for (const name of ["red", "teal", "violet", "lime"]) {
    const f = fam(name);
    const r = twlch(css(f, 5), { mode: "snap" });
    expect(r.anchorShade).toBe(500);
    expect(r.error).toBeLessThan(0.5);
    for (const s of r.swatches) {
      const i = tailwind.shades.indexOf(s.shade);
      const truth = new Color("oklch", [f.l[i], f.c[i], f.h[i]])
        .toGamut({ space: "srgb" })
        .to("oklch");
      expect(Math.abs(s.l - truth.coords[0]!)).toBeLessThan(0.01);
    }
  }
});

test("match passes exactly through the input colour", () => {
  const input = "oklch(0.62 0.17 200)";
  const r = twlch(input, { mode: "match" });
  const s = r.swatches.find((x) => x.shade === r.anchorShade)!;
  expect(Math.abs(s.l - 0.62)).toBeLessThan(0.01);
  expect(Math.abs(s.h - 200)).toBeLessThan(1.5);
});

test("scales are ordered light to dark and inside sRGB", () => {
  for (const hue of [0, 40, 95, 150, 200, 260, 310, 359]) {
    const r = twlch(`oklch(0.65 0.15 ${hue})`);
    for (let i = 1; i < r.swatches.length; i++) {
      expect(r.swatches[i].l).toBeLessThan(r.swatches[i - 1].l);
    }
    for (const s of r.swatches) expect(new Color(s.hex).inGamut("srgb")).toBe(true);
  }
});

test("hue wraps around 0/360", () => {
  const a = twlch("oklch(0.6 0.2 359)", { mode: "snap" });
  const b = twlch("oklch(0.6 0.2 1)", { mode: "snap" });
  expect(Math.abs(a.swatches[5].l - b.swatches[5].l)).toBeLessThan(0.02);
});

test("delta scales chroma relative to the curve", () => {
  const base = twlch("oklch(0.62 0.2 25)", { mode: "snap" });
  const more = twlch("oklch(0.62 0.2 25)", { mode: "snap", delta: 0.2 });
  expect(more.swatches[5].c).toBeGreaterThanOrEqual(base.swatches[5].c);
});

test("twlchHue reproduces a family at its own hue, linear and smooth", () => {
  const f = fam("teal");
  for (const interpolation of ["smooth", "linear"] as const) {
    const r = twlchHue(f.h[5], { interpolation });
    expect(Math.abs(r.swatches[3].l - f.l[3])).toBeLessThan(0.01);
  }
});

test("twlchAnchors is sorted and wraps the wheel", () => {
  const a = twlchAnchors("chromatic");
  expect(a.length).toBe(tailwind.chromatic.length);
  expect([...a].sort((x, y) => x - y)).toEqual(a);
});

test("shade(n) reads in-between shades off the scale", () => {
  const r = twlch("oklch(0.62 0.19 260)");
  expect(r.shade(500).hex).toBe(r.swatches[5].hex); // known shades are returned as they are
  const mid = r.shade(550);
  expect(mid.shade).toBe(550);
  expect(mid.l).toBeLessThan(r.shade(500).l);
  expect(mid.l).toBeGreaterThan(r.shade(600).l);
  expect(new Color(mid.hex).inGamut("srgb")).toBe(true);
  expect(() => r.shade(1000)).toThrow(RangeError);
});

const TOL = 1e-6; // search noise, far below the 3 decimals anyone would copy
const same = (a: { l: number; c: number; h: number }, b: { l: number; c: number; h: number }) => {
  expect(Math.abs(a.l - b.l)).toBeLessThan(TOL);
  expect(Math.abs(a.c - b.c)).toBeLessThan(TOL);
  expect(Math.abs(a.h - b.h)).toBeLessThan(TOL);
};

test("snap on the exact Tailwind value reproduces every shade, unclipped", () => {
  for (const f of tailwind.chromatic) {
    const r = twlch(css(f, 5), { mode: "snap" });
    for (const s of r.swatches) {
      const i = tailwind.shades.indexOf(s.shade);
      same(s, { l: f.l[i], c: f.c[i], h: f.h[i] });
    }
  }
});

test("snap keeps out-of-sRGB chroma while hex stays inside sRGB", () => {
  const lime = fam("lime");
  const r = twlch("oklch(76.8% 0.233 130.85)", { mode: "snap" });
  const s = r.swatches.find((x) => x.shade === 500)!;
  same(s, { l: 0.768, c: 0.233, h: 130.85 });
  const gamut = new Color("oklch", [s.l, s.c, s.h]);
  expect(gamut.inGamut("srgb")).toBe(false);
  expect(new Color(s.hex).inGamut("srgb")).toBe(true);
  expect(lime.c[5]).toBeCloseTo(s.c, 9);
});

test("match hits the input exactly at the anchor shade, unclipped", () => {
  for (const input of [
    "oklch(76.8% 0.233 130.85)", // outside sRGB
    "oklch(0.62 0.17 200)",
    "oklch(0.55 0.2 300)",
  ]) {
    const c = new Color(input).to("oklch").coords as [number, number, number];
    const r = twlch(input, { mode: "match" });
    const s = r.swatches.find((x) => x.shade === r.anchorShade)!;
    same(s, { l: c[0], c: c[1], h: c[2] });
    expect(r.shade(r.anchorShade).c).toBeCloseTo(c[1], 9);
  }
});

test("match keeps 50 and 950 on the dataset", () => {
  const snap = twlch("oklch(0.62 0.17 200)", { mode: "snap" });
  const match = twlch("oklch(0.62 0.17 200)", { mode: "match" });
  for (const k of [0, 10]) {
    expect(match.swatches[k].l).toBeCloseTo(snap.swatches[k].l, 6);
  }
});
