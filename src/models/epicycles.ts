/**
 * Epicycle model of the Tailwind chromatic scales, as a plain generated function of hue (see
 * epicycles.generated.ts): a few shade patterns, each carried around the hue wheel by a handful of
 * rotating circles, and each pattern a smooth function of shade, so `epicyclesAt(shade, hue)` takes any
 * shade from 50 to 950. Which circles are switched on, and their amplitudes and phases, are chosen by
 * scripts/fit-epicycles.ts (greedy search and a genetic algorithm).
 */
import type { CurveSource } from "../model.ts";
import { epicyclesAt, epicyclesCurve, epicyclesHues } from "./epicycles.generated.ts";

export { epicyclesAt, epicyclesCurve, epicyclesHues };

/** A `CurveSource` for the core model. */
export const epicyclesSource: CurveSource = {
  hues: epicyclesHues,
  curve: epicyclesCurve,
  at: epicyclesAt,
};
