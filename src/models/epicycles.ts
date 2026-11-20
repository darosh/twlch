/**
 * Epicycle model of the Tailwind chromatic scales. The shade-by-hue surface is split into a few shade
 * patterns, each carried around the hue wheel by a handful of rotating circles ("epicycles"):
 *
 *   value(shade, hue) = mean(shade) + Σ_k pattern_k(shade) · circles_k(hue)
 *   circles_k(hue)    = w₀ + Σ_j  a_j cos(h_j·hue) + b_j sin(h_j·hue)
 *
 * Each circle has a whole-number frequency h_j (so the curve closes at 360°) and an amplitude and phase,
 * stored as the cos/sin pair (a_j, b_j). Which circles are switched on is chosen by
 * scripts/fit-epicycles.ts (greedy search and a genetic algorithm).
 *
 * Lightness is one such surface. Chroma and hue are one complex surface: z = c·e^{i(h − hue)} is stored
 * as n real parts followed by n imaginary parts, so the hue wheel itself is factored out.
 */
import type { CurveSource } from "../model.ts";

export interface EpicyclesPart {
  /** Mean per column. */
  mu: number[];
  comps: {
    /** Shade pattern, one value per column. */
    u: number[];
    /** Circle frequencies (whole numbers of turns per revolution of hue). */
    h: number[];
    /** w₀, then a, b for each circle in `h`. */
    w: number[];
  }[];
}

export interface EpicyclesSpec {
  /** Number of shades. */
  n: number;
  /** Shade-500 hues of the Tailwind families it was fitted to, sorted: where "bulk" scales are spread. */
  hues: number[];
  /** Lightness. */
  l: EpicyclesPart;
  /** Chroma and hue, as the complex offset from the anchor hue. */
  z: EpicyclesPart;
}

const R = Math.PI / 180;

function evalPart(part: EpicyclesPart, a: number): number[] {
  const out = part.mu.slice();
  for (const { u, h, w } of part.comps) {
    let s = w[0];
    for (let j = 0; j < h.length; j++) {
      s += w[2 * j + 1] * Math.cos(h[j] * a * R) + w[2 * j + 2] * Math.sin(h[j] * a * R);
    }
    for (let i = 0; i < out.length; i++) out[i] += s * u[i];
  }
  return out;
}

/** The scale at hue `a` (degrees), one entry per shade. */
export function epicyclesCurve(spec: EpicyclesSpec, a: number) {
  const { n } = spec;
  const L = evalPart(spec.l, a);
  const Z = evalPart(spec.z, a);
  return Array.from({ length: n }, (_, i) => {
    const h = a + Math.atan2(Z[n + i], Z[i]) / R;
    return { l: L[i], c: Math.hypot(Z[i], Z[n + i]), h: ((h % 360) + 360) % 360 };
  });
}

/** A `CurveSource` for the core model. */
export function epicyclesSource(spec: EpicyclesSpec): CurveSource {
  return { hues: spec.hues, curve: (a) => epicyclesCurve(spec, a) };
}

/** Number of stored numbers in a spec. */
export function epicyclesSize(spec: EpicyclesSpec) {
  const part = (p: EpicyclesPart) =>
    p.mu.length + p.comps.reduce((s, c) => s + c.u.length + c.h.length + c.w.length, 0);
  return part(spec.l) + part(spec.z) + spec.hues.length;
}
