import type Color from "colorjs.io";
import { tailwind } from "./data.ts";
import { createTwlch, toLch } from "./model.ts";
import type { CurveSource, Interpolation, TwlchOptions, TwlchResult } from "./model.ts";

export { createTwlch } from "./model.ts";
export type {
  CurveSource,
  DatasetName,
  Interpolation,
  Swatch,
  TwlchOptions,
  TwlchResult,
} from "./model.ts";

type Model = ReturnType<typeof createTwlch>;
const cache = new Map<unknown, Map<Interpolation, Model>>();
function modelFor(
  dataset: TwlchOptions["dataset"] = "chromatic",
  interp: Interpolation = "smooth",
  source?: CurveSource,
) {
  const key = source ?? dataset;
  let byInterp = cache.get(key);
  if (!byInterp) cache.set(key, (byInterp = new Map()));
  let m = byInterp.get(interp);
  if (!m) {
    m = source
      ? createTwlch([], interp, source)
      : createTwlch(typeof dataset === "string" ? tailwind[dataset] : dataset, interp);
    byInterp.set(interp, m);
  }
  return m;
}

/** Generate a 50–950 scale from any colour colorjs.io can parse. */
export function twlch(
  color: string | Color,
  opts: TwlchOptions = {},
  source?: CurveSource,
): TwlchResult {
  return modelFor(opts.dataset, opts.interpolation, source).run(toLch(color), opts);
}

/** Generate the scale at a hue on the wheel (the shade-500 hue), without needing a colour. */
export function twlchHue(
  hue: number,
  opts: Pick<TwlchOptions, "dataset" | "delta" | "interpolation"> = {},
  source?: CurveSource,
): TwlchResult {
  return modelFor(opts.dataset, opts.interpolation, source).fromHue(hue, opts.delta ?? 0);
}

/** Shade-500 hues of the dataset's families, sorted: the anchors that bulk-adding interpolates between. */
export function twlchAnchors(
  dataset: TwlchOptions["dataset"] = "chromatic",
  interp: Interpolation = "smooth",
  source?: CurveSource,
): number[] {
  return modelFor(dataset, interp, source).hues;
}
