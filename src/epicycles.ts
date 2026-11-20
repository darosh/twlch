// Standalone entry: only the epicycle model, no Tailwind data tables.
import { epicyclesSource } from "./models/epicycles.ts";
import { standalone } from "./standalone.ts";

export type { Interpolation, Swatch, TwlchResult } from "./model.ts";
export { epicyclesAt, epicyclesCurve, epicyclesHues } from "./models/epicycles.ts";

export const { twlch, twlchHue, twlchAnchors } = standalone(epicyclesSource);
