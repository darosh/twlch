// Standalone entry: only the Fourier model, no Tailwind data tables.
import { fourierSource } from "./models/fourier.ts";
import { standalone } from "./standalone.ts";

export type { Interpolation, Swatch, TwlchResult } from "./model.ts";
export { fourierAt, fourierCurve, fourierHues } from "./models/fourier.ts";

export const { twlch, twlchHue, twlchAnchors } = standalone(fourierSource);
