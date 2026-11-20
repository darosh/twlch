/**
 * Fourier model of the Tailwind chromatic scales, as a plain generated function of shade and hue (see
 * fourier.generated.ts): Fourier series in hue whose coefficients are smooth functions of shade.
 * Coefficients are fitted by scripts/fit-fourier.ts.
 */
import type { CurveSource } from "../model.ts";
import { fourierAt, fourierCurve, fourierHues } from "./fourier.generated.ts";

export { fourierAt, fourierCurve, fourierHues };

/** A `CurveSource` for the core model. */
export const fourierSource: CurveSource = { hues: fourierHues, curve: fourierCurve, at: fourierAt };
