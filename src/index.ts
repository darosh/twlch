import type Color from "colorjs.io";
import { epicyclesSource } from "./calc.epicycles.ts";
import { fourierSource } from "./calc.fourier.ts";
import * as core from "./scale.ts";
import type {
  CurveSource,
  Interpolation,
  TwlchOptions as CoreOptions,
  TwlchResult,
} from "./model.ts";

export { pchip, pchipXY, linearXY } from "./pchip.ts";
export { createTwlch } from "./scale.ts";
export type { TwlchResult, Swatch, DatasetName, Interpolation, CurveSource } from "./scale.ts";
export { tailwind } from "./data.ts";
export type { Family, TailwindData } from "./data.ts";
export { fourierAt, fourierCurve, fourierHues, fourierSource } from "./calc.fourier.ts";
export { epicyclesAt, epicyclesCurve, epicyclesHues, epicyclesSource } from "./calc.epicycles.ts";

/** Which fitted model computes the scales, instead of interpolating the Tailwind families. */
export type Generator = "fourier" | "epicycles";

export interface TwlchOptions extends CoreOptions {
  /**
   * Compute the scales from the Fourier model (see scripts/fit-fourier.ts): a smooth function of hue
   * that reproduces the 17 Tailwind chromatic families almost exactly. Chromatic only: `dataset` is
   * ignored. Not together with `epicycles`.
   */
  fourier?: boolean;
  /**
   * Compute the scales from the epicycle model (see scripts/fit-epicycles.ts): a few shade patterns
   * carried around the hue wheel by rotating circles. About a quarter of the size of the Fourier model
   * and a little less exact. Chromatic only: `dataset` is ignored. Not together with `fourier`.
   */
  epicycles?: boolean;
}

const sources: Record<Generator, CurveSource> = {
  fourier: fourierSource,
  epicycles: epicyclesSource,
};
const sourceOf = (o: Pick<TwlchOptions, "fourier" | "epicycles">) => {
  if (o.fourier && o.epicycles) throw new Error("twlch: choose either `fourier` or `epicycles`");
  return o.fourier ? sources.fourier : o.epicycles ? sources.epicycles : undefined;
};

/** Generate a 50–950 scale from any colour colorjs.io can parse. */
export function twlch(color: string | Color, opts: TwlchOptions = {}): TwlchResult {
  return core.twlch(color, opts, sourceOf(opts));
}

/** Generate the scale at a hue on the wheel (the shade-500 hue), without needing a colour. */
export function twlchHue(
  hue: number,
  opts: Pick<TwlchOptions, "dataset" | "delta" | "interpolation" | "fourier" | "epicycles"> = {},
): TwlchResult {
  return core.twlchHue(hue, opts, sourceOf(opts));
}

/** Shade-500 hues of the dataset's families, sorted: the anchors that bulk-adding interpolates between. */
export function twlchAnchors(
  dataset: TwlchOptions["dataset"] = "chromatic",
  interp: Interpolation = "smooth",
  generator?: Generator,
): number[] {
  return core.twlchAnchors(dataset, interp, generator && sources[generator]);
}
