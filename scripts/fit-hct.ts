// Fits the HCT model (CAM16 hue + chroma, CIE L* tone; as in Material Color Utilities) to the Tailwind
// chromatic families: a tone and a chroma per shade, the same for every family, and a hue per family.
// Run: node scripts/fit-hct.ts [--rounds 8] [--K 2] [--digits 4] [--write]
//   --K       harmonics of the OKLCH-hue → HCT-hue map (default 2)
//   --digits  significant digits of the written constants (default 4)
//   --write   emit src/calc.hct.generated.ts from the last variant
//
// Every colour is HCT(H, C, T) → linear sRGB with the chroma limited to the Display P3 gamut at that hue and tone. Error
// is OKLab distance ×100 to Tailwind's OKLCH value (which may lie outside even P3). Variants:
//   1  one chroma ceiling for all shades, hard clip to the gamut
//   2  a ceiling per shade, hard clip
//   3  a ceiling per shade, soft clip (no corner where the ceiling meets the gamut)
//   4  as 3, with the hue not fitted per family but taken from a smooth map of the OKLCH hue (what the
//      library uses)
// A single ceiling lets chroma ride the gamut, whose cusp sits at light tones for greens, so greens peak
// around 300 instead of 400-500 like Tailwind's; a ceiling per shade fixes that.
import { writeFileSync } from "node:fs";
import Color from "colorjs.io";
import { tailwind } from "../src/data.ts";
import { hctToGamut, hctToSoftGamut, linearToOklch } from "../src/hct.ts";
import { solve } from "./lib.ts";

const arg = (name: string, d: number) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? Number(process.argv[i + 1]) : d;
};
const ROUNDS = arg("rounds", 8);
const K = arg("K", 2);
const DIGITS = arg("digits", 4);
const R = Math.PI / 180;
const fams = tailwind.chromatic;
const n = tailwind.shades.length;
const MID = Math.floor(n / 2);
const shades = [...Array(n).keys()];
const wrap = (h: number) => ((h % 360) + 360) % 360;

type V3 = number[];
const lab = (l: number, c: number, h: number): V3 => [l, c * Math.cos(h * R), c * Math.sin(h * R)];
const tgt = fams.map((f) => shades.map((i) => lab(f.l[i], f.c[i], f.h[i])));
const dist = (p: V3, q: V3) => 100 * Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
const sig = (x: number) => Number(x.toPrecision(DIGITS));

/** 1-D minimiser: coarse grid, then golden section around the best cell. */
function minimize(fn: (x: number) => number, lo: number, hi: number, grid = 12, iters = 22) {
  let bx = lo;
  let bf = Infinity;
  const step = (hi - lo) / grid;
  for (let k = 0; k <= grid; k++) {
    const x = lo + k * step;
    const v = fn(x);
    if (v < bf) [bx, bf] = [x, v];
  }
  let a = Math.max(lo, bx - step);
  let b = Math.min(hi, bx + step);
  const g = (Math.sqrt(5) - 1) / 2;
  let x1 = b - g * (b - a);
  let x2 = a + g * (b - a);
  let f1 = fn(x1);
  let f2 = fn(x2);
  for (let k = 0; k < iters; k++) {
    if (f1 < f2) {
      b = x2;
      [x2, f2] = [x1, f1];
      x1 = b - g * (b - a);
      f1 = fn(x1);
    } else {
      a = x1;
      [x1, f1] = [x2, f2];
      x2 = a + g * (b - a);
      f2 = fn(x2);
    }
  }
  const x = (a + b) / 2;
  return fn(x) < bf ? x : bx;
}

type Opts = { oneC: boolean; soft: boolean; hue: "fit" | "map" };
type Fit = { H: number[]; C: number[]; T: number[] }; // H per family; C and T per shade

let hueMap: (h: number) => number = (h) => h;
const hct500 = fams.map((f) => new Color("oklch", [f.l[MID], f.c[MID], f.h[MID]]).to("hct").coords);

function fitModel(o: Opts): Fit {
  const clip = o.soft ? hctToSoftGamut : hctToGamut;
  const render = (h: number, c: number, t: number): V3 => {
    const p = linearToOklch(clip(h, c, t));
    return lab(p.l, p.c, p.h);
  };
  const cost = (fi: number, i: number, h: number, c: number, t: number) =>
    dist(render(h, c, t), tgt[fi][i]) ** 2;

  const H = fams.map((f, fi) => (o.hue === "map" ? hueMap(f.h[MID]) : wrap(hct500[fi][0] ?? 0)));
  const T = shades.map((i) => fams.reduce((s, f) => s + 116 * f.l[i] - 16, 0) / fams.length);
  const C = shades.map(() => 75);
  for (let round = 0; round < ROUNDS; round++) {
    if (o.hue === "fit")
      for (let fi = 0; fi < fams.length; fi++) {
        const h0 = H[fi];
        H[fi] = wrap(
          h0 +
            minimize(
              (dh) => shades.reduce((s, i) => s + cost(fi, i, wrap(h0 + dh), C[i], T[i]), 0),
              -25,
              25,
            ),
        );
      }
    if (o.oneC) {
      const c = minimize(
        (c) =>
          shades.reduce(
            (s, i) => s + fams.reduce((u, _, fi) => u + cost(fi, i, H[fi], c, T[i]), 0),
            0,
          ),
        2,
        140,
        20,
      );
      C.fill(c);
    } else
      for (const i of shades)
        C[i] = minimize(
          (c) => fams.reduce((s, _, fi) => s + cost(fi, i, H[fi], c, T[i]), 0),
          2,
          140,
          20,
        );
    for (const i of shades)
      T[i] = minimize(
        (t) => fams.reduce((s, _, fi) => s + cost(fi, i, H[fi], C[i], t), 0),
        Math.max(0, T[i] - 14),
        Math.min(100, T[i] + 14),
      );
  }
  const errs = fams.flatMap((_, fi) =>
    shades.map((i) => dist(render(H[fi], C[i], T[i]), tgt[fi][i])),
  );
  const mean = errs.reduce((s, v) => s + v, 0) / errs.length;
  const rms = Math.sqrt(errs.reduce((s, v) => s + v * v, 0) / errs.length);
  const label = `${o.oneC ? "one C" : "C per shade"}, ${o.soft ? "soft" : "hard"} clip, ${o.hue === "fit" ? "fitted" : "mapped"} hue`;
  console.log(
    `${label.padEnd(44)} mean ${mean.toFixed(2)}  rms ${rms.toFixed(2)}  max ${Math.max(...errs).toFixed(2)}`,
  );
  return { H, C, T };
}

fitModel({ oneC: true, soft: false, hue: "fit" });
fitModel({ oneC: false, soft: false, hue: "fit" });
const S = fitModel({ oneC: false, soft: true, hue: "fit" });

// ---- hue map: HCT hue = OKLCH hue + a periodic offset (Fourier series fitted to the per-family hues) --------
const basis = (h: number) => {
  const v = [1];
  for (let k = 1; k <= K; k++) v.push(Math.cos(k * h * R), Math.sin(k * h * R));
  return v;
};
const off = fams.map((f, fi) => ((S.H[fi] - f.h[MID] + 540) % 360) - 180);
const X = fams.map((f) => basis(f.h[MID]));
const m = 2 * K + 1;
const coef = solve(
  Array.from({ length: m }, (_, a) =>
    Array.from(
      { length: m },
      (_, b) => X.reduce((t, x) => t + x[a] * x[b], 0) + (a === b ? 1e-6 : 0),
    ),
  ),
  Array.from({ length: m }, (_, a) => X.reduce((t, x, i) => t + x[a] * off[i], 0)),
);
const q = coef.map(sig);
hueMap = (h) => wrap(h + basis(h).reduce((t, b, i) => t + b * q[i], 0));
const D = fitModel({ oneC: false, soft: true, hue: "map" });

const fmt = (v: number[]) =>
  shades.map((i) => `${tailwind.shades[i]}:${v[i].toFixed(1)}`).join("  ");
console.log(`\nTone per shade:   ${fmt(D.T)}\nChroma per shade: ${fmt(D.C)}`);
console.log(`Hue map offsets:  ${q.join(", ")}`);

if (process.argv.includes("--write")) {
  const out = `// Generated by scripts/fit-hct.ts against Tailwind ${tailwind.tailwind}. Do not edit.
// The HCT model: a tone and a chroma ceiling per shade, and the HCT hue as a smooth offset of the OKLCH hue.
// Colours are HCT → linear sRGB with the chroma softly limited to the Display P3 gamut at the hue and tone.
import { chromaticHues } from "./data.generated.ts";

/** Shade-500 hues of the Tailwind families the model was compared to, sorted. */
export const hctHues: number[] = chromaticHues;

/** The tone (CIE L*) of each Tailwind shade, 50 … 950. */
export const hctTones: number[] = ${JSON.stringify(D.T.map(sig))};

/** The chroma ceiling (HCT chroma) of each shade: the actual chroma is what Display P3 allows at the hue and tone, up to this. */
export const hctChromas: number[] = ${JSON.stringify(D.C.map(sig))};

/** HCT hue minus OKLCH hue, degrees: [a0, a1, b1, a2, b2, …] of a Fourier series in the OKLCH hue. */
export const hctHueOffset: number[] = ${JSON.stringify(q)};
`;
  writeFileSync(new URL("../src/calc.hct.generated.ts", import.meta.url), out);
  console.log("wrote src/calc.hct.generated.ts");
}
