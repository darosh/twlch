// Standalone entry: only the Fourier model, no Tailwind data tables.
import { fourierSource } from "./calc.fourier.ts";
import { standalone } from "./standalone.ts";

export type { Interpolation, Swatch, TwlchResult } from "./model.ts";
export { fourierAt, fourierCurve, fourierHues } from "./calc.fourier.ts";

export const { twlch, twlchHue, twlchAnchors } = standalone(fourierSource);
