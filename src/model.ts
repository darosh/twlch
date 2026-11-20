import Color from "colorjs.io";
import type { Family } from "./data.ts";
import { linearXY, pchipXY } from "./pchip.ts";

export type DatasetName = "chromatic" | "neutral";
/** How families are blended across the hue wheel. */
export type Interpolation = "smooth" | "linear";

export interface TwlchOptions {
  /** Which Tailwind family set to interpolate, or your own families. Default "chromatic". */
  dataset?: DatasetName | Family[];
  /**
   * "snap": the scale of the closest point on the hue wheel, unchanged (default).
   * "match": the same scale bent so that it passes exactly through the input colour.
   */
  mode?: "snap" | "match";
  /** Chroma relative to the matched curve: C = curve * (1 + delta). 0 = exact match. Default 0. */
  delta?: number;
  /** Force the input to sit at this shade (50 … 950) instead of the closest one. */
  shade?: number;
  /** "smooth" blends neighbouring families with monotone cubics (default); "linear" uses straight lines. */
  interpolation?: Interpolation;
}

/** A closed-form scale generator that stands in for the interpolated families (see formula.ts). */
export interface CurveSource {
  /** Shade-500 hues the generator was fitted to, sorted. */
  hues: readonly number[];
  /** The scale at hue `a`, one entry per shade. */
  curve(a: number): Lch[];
  /** The colour at any shade from 50 to 950 and hue `a`: when given, `shade(n)` reads from it, not PCHIP. */
  at?(shade: number, a: number): Lch;
}

export interface Swatch {
  shade: number;
  /** OKLCH, not gamut-mapped: may lie outside sRGB (e.g. Tailwind's vivid P3-range colours). */
  l: number;
  c: number;
  h: number;
  /** sRGB hex, gamut-mapped from the OKLCH values above. */
  hex: string;
}

export interface TwlchResult {
  swatches: Swatch[];
  /** Position on the hue wheel (the shade-500 hue of the interpolated curve). */
  hue: number;
  /** Shade the input colour is anchored to. */
  anchorShade: number;
  /** Chroma multiplier minus 1 that "match" applied at the anchor shade (before `delta`). */
  matchDelta: number;
  /** OKLab distance (×100) between the input and the scale at the anchor shade. */
  error: number;
  /**
   * The colour at any shade from 50 to 950, including in-between ones such as 550. Computed sets
   * (`fourier`, `epicycles`) read it straight from their function (unless `delta` is set); the others
   * run PCHIP through the swatches.
   */
  shade(n: number): Swatch;
}

export type Lch = { l: number; c: number; h: number };
const wrap180 = (a: number) => ((((a + 180) % 360) + 360) % 360) - 180;
const wrap360 = (a: number) => ((a % 360) + 360) % 360;
const smooth = (t: number) => t * t * (3 - 2 * t);

/** Tailwind's shade labels. */
export const SHADES = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950];

/** Parse any colour colorjs.io understands into OKLCH, with an undefined hue read as 0. */
export function toLch(color: string | Color): Lch {
  const [l, c, h] = new Color(color).to("oklch").coords;
  return { l: l ?? 0, c: c ?? 0, h: h == null || Number.isNaN(h) ? 0 : h };
}

/** Hue-indexed model: for each shade, L, C and hue drift as periodic curves over hue. */
export function createTwlch(
  families: readonly Family[],
  interpolation: Interpolation = "smooth",
  /** When given, scales come from this generator and `families` is ignored (pass `[]`). */
  source?: CurveSource,
) {
  if (!source && families.length < 2) throw new Error("twlch needs at least two families");
  const shades = SHADES;
  const n = shades.length;
  const mid = Math.floor(n / 2);
  const interp = interpolation === "linear" ? linearXY : pchipXY;

  // Anchor hue = a family's hue at the middle shade; sort around the wheel, keep strictly increasing.
  const sorted = families.map((f) => ({ f, a: wrap360(f.h[mid]) })).sort((p, q) => p.a - q.a);
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].a <= sorted[i - 1].a) sorted[i].a = sorted[i - 1].a + 1e-6;
  }
  const anchors = source ? [...source.hues] : sorted.map((s) => s.a);

  const L: ((a: number) => number)[] = [];
  const C: ((a: number) => number)[] = [];
  const D: ((a: number) => number)[] = [];
  for (let i = 0; i < n && !source; i++) {
    L.push(
      interp(
        anchors,
        sorted.map((s) => s.f.l[i]),
        360,
      ),
    );
    C.push(
      interp(
        anchors,
        sorted.map((s) => s.f.c[i]),
        360,
      ),
    );
    // hue drift relative to the anchor, so the curve follows each shade's own hue spacing
    D.push(
      interp(
        anchors,
        sorted.map((s) => wrap180(s.f.h[i] - s.a)),
        360,
      ),
    );
  }

  /** The dataset scale at hue `a`, before any bending. */
  const curve = (a: number): Lch[] =>
    source
      ? source.curve(a)
      : shades.map((_, i) => ({ l: L[i](a), c: Math.max(0, C[i](a)), h: wrap360(a + D[i](a)) }));

  const dist = (p: Lch, q: Lch) => {
    const pa = p.c * Math.cos((p.h * Math.PI) / 180);
    const pb = p.c * Math.sin((p.h * Math.PI) / 180);
    const qa = q.c * Math.cos((q.h * Math.PI) / 180);
    const qb = q.c * Math.sin((q.h * Math.PI) / 180);
    return 100 * Math.hypot(p.l - q.l, pa - qa, pb - qb);
  };

  /** Closest (hue, shade) on the model for a colour. */
  function locate(input: Lch, shade?: number) {
    const only = shade === undefined ? -1 : shades.indexOf(shade);
    if (shade !== undefined && only < 0) throw new Error(`unknown shade ${shade}`);
    let best = { a: 0, i: 0, d: Infinity };
    const scan = (from: number, to: number, stepA: number) => {
      for (let a = from; a <= to; a += stepA) {
        const s = curve(wrap360(a));
        for (let i = 0; i < n; i++) {
          if (only >= 0 && i !== only) continue;
          const d = dist(input, s[i]);
          if (d < best.d) best = { a: wrap360(a), i, d };
        }
      }
    };
    scan(0, 359, 1);
    // coarse 1° grid, then successively finer passes so an exact family colour lands on its own hue
    for (const [span, step] of [
      [1, 0.05],
      [0.05, 0.001],
      [0.001, 0.00002],
    ]) {
      const c = best.a;
      scan(c - span, c + span, step);
    }
    return best;
  }

  /** One swatch: unclipped OKLCH (may be outside sRGB), plus a hex gamut-mapped to sRGB. */
  function toSwatch(shade: number, s: Lch): Swatch {
    const l = Math.min(1, Math.max(0, s.l));
    const c = Math.max(0, s.c);
    const h = wrap360(s.h);
    const hex = new Color("oklch", [l, c, h])
      .toGamut({ space: "srgb", method: "css" })
      .to("srgb")
      .toString({ format: "hex" });
    return { shade, l, c, h, hex };
  }

  /** Gamut-map to sRGB and format. `keep` is a shade whose chroma must not be scaled by delta. */
  function finish(out: Lch[], delta: number, keep: number): Swatch[] {
    return out.map((s, j) =>
      toSwatch(shades[j], { ...s, c: j === keep ? s.c : s.c * (1 + delta) }),
    );
  }

  /** Curves through a finished scale, so any shade between 50 and 950 can be read off it. */
  function shadeReader(swatches: Swatch[]): (n: number) => Swatch {
    const xs = swatches.map((s) => s.shade);
    const hs = swatches.map((s) => s.h);
    for (let i = 1; i < hs.length; i++) hs[i] = hs[i - 1] + wrap180(hs[i] - hs[i - 1]); // no 360° jumps
    const fl = interp(
      xs,
      swatches.map((s) => s.l),
    );
    const fc = interp(
      xs,
      swatches.map((s) => s.c),
    );
    const fh = interp(xs, hs);
    return (n) => {
      if (!(n >= xs[0] && n <= xs[xs.length - 1])) {
        throw new RangeError(`shade must be between ${xs[0]} and ${xs[xs.length - 1]}`);
      }
      const known = swatches.find((s) => s.shade === n);
      return known ?? toSwatch(n, { l: fl(n), c: Math.max(0, fc(n)), h: wrap360(fh(n)) });
    };
  }

  /** Position of a shade among the 11, as a fraction: piecewise linear between the labels (150 → 1.5). */
  function shadePos(shade: number) {
    let k = 0;
    while (k < n - 2 && shade > shades[k + 1]) k++;
    return k + (shade - shades[k]) / (shades[k + 1] - shades[k]);
  }

  /**
   * `shade(n)` for a model that is a function of shade: read it directly, bent the same way as the
   * swatches (`bend`, for "match"). A non-zero `delta` scales every shade but the anchor, which is not a
   * smooth function of shade, so that case is left to PCHIP through the swatches.
   */
  function functionReader(
    swatches: Swatch[],
    a: number,
    delta: number,
    bend?: (pos: number, s: Lch) => Lch,
  ): (n: number) => Swatch {
    if (!source?.at || delta !== 0) return shadeReader(swatches);
    const at = source.at.bind(source);
    const [first, last] = [shades[0], shades[n - 1]];
    return (sh) => {
      if (!(sh >= first && sh <= last)) {
        throw new RangeError(`shade must be between ${first} and ${last}`);
      }
      const known = swatches.find((s) => s.shade === sh);
      if (known) return known;
      const s = at(sh, a);
      return toSwatch(sh, bend ? bend(shadePos(sh), s) : s);
    };
  }

  function run(input: Lch, opts: TwlchOptions = {}): TwlchResult {
    const { mode = "snap", delta = 0, shade } = opts;
    const { a, i, d } = locate(input, shade);
    const base = curve(a);

    let out: Lch[];
    let matchDelta = 0;
    let bend: ((pos: number, s: Lch) => Lch) | undefined;
    if (mode === "snap") {
      out = base;
    } else {
      const dl = input.l - base[i].l;
      const dh = wrap180(input.h - base[i].h);
      const ratio = base[i].c > 1e-4 ? input.c / base[i].c : 1;
      matchDelta = ratio - 1;
      // weight 1 at the anchor, easing to 0 at both ends so 50 and 950 stay on the dataset
      bend = (pos, s) => {
        const t = pos <= i ? (i === 0 ? 1 : pos / i) : (n - 1 - pos) / (n - 1 - i);
        const w = smooth(Math.min(1, Math.max(0, t)));
        return { l: s.l + dl * w, c: s.c * (1 + matchDelta * w), h: wrap360(s.h + dh * w) };
      };
      out = base.map((s, j) => bend!(j, s));
      out[i] = { ...input };
    }
    const swatches = finish(out, delta, mode === "match" ? i : -1);
    return {
      swatches,
      hue: a,
      anchorShade: shades[i],
      matchDelta,
      error: d,
      shade: functionReader(swatches, a, delta, bend),
    };
  }

  /** The dataset scale at a given shade-500 hue, with chroma scaled by (1 + delta). */
  function fromHue(hue: number, delta = 0): TwlchResult {
    const a = wrap360(hue);
    const swatches = finish(curve(a), delta, -1);
    return {
      swatches,
      hue: a,
      anchorShade: shades[mid],
      matchDelta: 0,
      error: 0,
      shade: functionReader(swatches, a, delta),
    };
  }

  /** Shade-500 hues of the dataset families, sorted around the wheel. */
  const hues = anchors.slice();

  return { curve, locate, run, fromHue, hues, shades };
}
