// Standalone entry: only the epicycle model, no Tailwind data tables.
import { epicyclesSource } from "./models/epicycles.ts";
import { epicycles } from "./models/epicycles.generated.ts";
import { standalone } from "./standalone.ts";

export type { Interpolation, Swatch, TwlchResult } from "./model.ts";
export { epicyclesCurve } from "./models/epicycles.ts";
export type { EpicyclesSpec } from "./models/epicycles.ts";
export { epicycles } from "./models/epicycles.generated.ts";

export const { twlch, twlchHue, twlchAnchors } = standalone(epicyclesSource(epicycles));
