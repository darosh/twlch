/**
 * HCT model of Tailwind-like chromatic scales (see calc.hct.generated.ts): the same tone and chroma
 * ceiling for every hue at a given shade, in the HCT colour space of Material Design (CAM16 hue and
 * chroma, CIE L* tone). Every colour is HCT → linear sRGB with chroma lowered at fixed hue and tone
 * until it fits the Display P3 gamut (softly, so the chroma has no corner where the ceiling meets the
 * gamut). The OKLCH values are not gamut-mapped, so they may lie outside sRGB like Tailwind's own; only
 * `hex` is. It fits Tailwind less closely than `fourier` or `epicycles`: the point is a scale built the
 * Material way (tone ladder, constant hue) that still reads as a Tailwind one. The OKLCH hue is mapped
 * to the HCT hue by a smooth offset, fitted by scripts/fit-hct.ts.
 */
import type { CurveSource } from "./model.ts";
import { shades } from "./data.generated.ts";
import { hctChromas, hctHueOffset, hctHues, hctTones } from "./calc.hct.generated.ts";
import { hctToSoftGamut, linearToOklch } from "./hct.ts";
import { pchip } from "./pchip.ts";

export { hctHues };

const R = Math.PI / 180;
const toneAt = pchip(hctTones);
const chromaAt = pchip(hctChromas);
/** Position of a shade among the labels (50 → 0, 100 → 1, … 900 → 9, 950 → 10). */
const pos = (shade: number) =>
  shade <= 100 ? (shade - 50) / 50 : shade >= 900 ? 9 + (shade - 900) / 50 : shade / 100;

/** HCT hue from the OKLCH hue. */
export function hctHue(hue: number): number {
  const t = hue * R;
  let d = hctHueOffset[0];
  for (let k = 1; 2 * k < hctHueOffset.length; k++)
    d += hctHueOffset[2 * k - 1] * Math.cos(k * t) + hctHueOffset[2 * k] * Math.sin(k * t);
  return (((hue + d) % 360) + 360) % 360;
}

/** The colour (OKLCH) at a shade from 50 to 950 and a hue in degrees. */
export function hctAt(shade: number, hue: number): { l: number; c: number; h: number } {
  const p = Math.min(10, Math.max(0, pos(shade)));
  const t = Math.min(100, Math.max(0, toneAt(p)));
  const lch = linearToOklch(hctToSoftGamut(hctHue(hue), Math.max(0, chromaAt(p)), t));
  return lch.c < 1e-7 ? { ...lch, h: hue } : lch;
}

/** The scale at a hue, one colour per Tailwind shade. */
export const hctCurve = (hue: number) => shades.map((s) => hctAt(s, hue));

/** A `CurveSource` for the core model. */
export const hctSource: CurveSource = { hues: hctHues, curve: hctCurve, at: hctAt };
