import Color from "colorjs.io";

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

/** OKLCH -> clamped sRGB 0xRRGGBB, for UI colouring only. */
export function oklchToHex(l: number, c: number, h: number): number {
  const [r, g, b] = new Color("oklch", [l, c, h]).to("srgb").coords.map((v) => clamp01(v ?? 0));
  return (Math.round(r * 255) << 16) | (Math.round(g * 255) << 8) | Math.round(b * 255);
}

/** Round x up to a 1 / 1.5 / 2 / 2.5 / 3 / 4 / 5 / 6 / 8 / 10 × 10ⁿ value, for axis maxima. */
export function niceMax(x: number): number {
  if (!(x > 0)) return 1;
  const e = 10 ** Math.floor(Math.log10(x));
  const m = x / e;
  const nm = [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10].find((v) => m <= v + 1e-9) ?? 10;
  return nm * e;
}

/** Format an axis value with a precision suited to the axis range. */
export function fmt(v: number, range: number): string {
  const digits = range >= 50 ? 0 : range >= 5 ? 1 : range >= 0.5 ? 2 : 3;
  return v.toFixed(digits);
}

function luminance(hex: number): number {
  const lin = (v: number) => ((v /= 255) <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  return 0.2126 * lin((hex >> 16) & 255) + 0.7152 * lin((hex >> 8) & 255) + 0.0722 * lin(hex & 255);
}

/** WCAG contrast of a swatch (0xRRGGBB) against its label colour: black on shades 50–500 (index < 6), white on 600–950. */
export function labelContrast(hex: number, shadeIndex: number): number {
  const y = luminance(hex);
  return shadeIndex < 6 ? (y + 0.05) / 0.05 : 1.05 / (y + 0.05);
}
