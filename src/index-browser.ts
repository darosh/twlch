// Entry for the standalone browser builds: Tailwind datasets and interpolation, no fitted formulas.
// (The `fourier` and `epicycles` options live in the main entry and in the standalone model entries.)
import type Color from "colorjs.io";
import * as core from "./scale.ts";
import type { Interpolation, TwlchOptions, TwlchResult } from "./model.ts";

export { pchip, pchipXY, linearXY } from "./pchip.ts";
export { createTwlch } from "./scale.ts";
export type {
  TwlchOptions,
  TwlchResult,
  Swatch,
  DatasetName,
  Interpolation,
  CurveSource,
} from "./scale.ts";
export { tailwind } from "./data.ts";
export type { Family, TailwindData } from "./data.ts";

/** Generate a 50–950 scale from any colour colorjs.io can parse. */
export function twlch(color: string | Color, opts: TwlchOptions = {}): TwlchResult {
  return core.twlch(color, opts);
}

/** Generate the scale at a hue on the wheel (the shade-500 hue), without needing a colour. */
export function twlchHue(
  hue: number,
  opts: Pick<TwlchOptions, "dataset" | "delta" | "interpolation"> = {},
): TwlchResult {
  return core.twlchHue(hue, opts);
}

/** Shade-500 hues of the dataset's families, sorted: the anchors that bulk-adding interpolates between. */
export function twlchAnchors(
  dataset: TwlchOptions["dataset"] = "chromatic",
  interp: Interpolation = "smooth",
): number[] {
  return core.twlchAnchors(dataset, interp);
}
