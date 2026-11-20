// Standalone entry: only the Fourier model, no Tailwind data tables.
import { fourierSource } from "./models/fourier.ts";
import { fourier } from "./models/fourier.generated.ts";
import { standalone } from "./standalone.ts";

export type { Interpolation, Swatch, TwlchResult } from "./model.ts";
export { fourierCurve } from "./models/fourier.ts";
export type { FourierSpec } from "./models/fourier.ts";
export { fourier } from "./models/fourier.generated.ts";

export const { twlch, twlchHue, twlchAnchors } = standalone(fourierSource(fourier));
