// Standalone entry: only the HCT model, no Tailwind data tables.
import { hctSource } from "./calc.hct.ts";
import { standalone } from "./standalone.ts";

export type { Interpolation, Swatch, TwlchResult } from "./model.ts";
export { hctAt, hctCurve, hctHue, hctHues } from "./calc.hct.ts";

export const { twlch, twlchHue, twlchAnchors } = standalone(hctSource);
