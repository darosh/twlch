// Shared by the standalone entries (fourier.ts, epicycles.ts): the public API over one fitted model,
// without the Tailwind data tables.
import type Color from "colorjs.io";
import { createTwlch, toLch } from "./model.ts";
import type { CurveSource, Interpolation, TwlchOptions, TwlchResult } from "./model.ts";

type Options = Pick<TwlchOptions, "mode" | "delta" | "shade" | "interpolation">;

export function standalone(source: CurveSource) {
  const models = new Map<Interpolation, ReturnType<typeof createTwlch>>();
  const modelFor = (interp: Interpolation = "smooth") => {
    let m = models.get(interp);
    if (!m) models.set(interp, (m = createTwlch([], interp, source)));
    return m;
  };

  return {
    /** Generate a 50–950 scale from any colour colorjs.io can parse. */
    twlch: (color: string | Color, opts: Options = {}): TwlchResult =>
      modelFor(opts.interpolation).run(toLch(color), opts),
    /** Generate the scale at a hue on the wheel (the shade-500 hue). */
    twlchHue: (hue: number, opts: Pick<Options, "delta" | "interpolation"> = {}): TwlchResult =>
      modelFor(opts.interpolation).fromHue(hue, opts.delta ?? 0),
    /** Shade-500 hues of the Tailwind families the model was fitted to, sorted. */
    twlchAnchors: (interp?: Interpolation): number[] => modelFor(interp).hues,
  };
}
