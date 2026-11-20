/**
 * HCT (Material Design's colour space: CAM16 hue and chroma, CIE L* tone) to linear sRGB, and the gamut-
 * limited colour as OKLCH. Allocation-free and a few times faster than going through colorjs.io's generic
 * conversions, which matters because the model is searched thousands of times per colour. Follows
 * colorjs.io's `hct` space (same viewing conditions: D65 white, L* 50 background, average surround).
 */
type V3 = [number, number, number];

const D65 = [0.3127 / 0.329, 1, (1 - 0.3127 - 0.329) / 0.329];
const fromLstar = (l: number) => (l > 8 ? ((l + 16) / 116) ** 3 : l / (24389 / 27));
const LA = (200 / Math.PI) * fromLstar(50);
const YB = fromLstar(50) * 100;
const SC = 0.69; // surround "average"
const k4 = (1 / (5 * LA + 1)) ** 4;
const FL = k4 * LA + 0.1 * (1 - k4) * (1 - k4) * Math.cbrt(5 * LA);
const N = YB / 100;
const Z = 1.48 + Math.sqrt(N);
const NBB = 0.725 * N ** -0.2;
const D = Math.max(Math.min(1 - (1 / 3.6) * Math.exp((-LA - 42) / 92), 1), 0);

const CAT16 = [
  [0.401288, 0.650173, -0.051461],
  [-0.250268, 1.204414, 0.045854],
  [-0.002079, 0.048952, 0.953127],
];
const CAT16_INV = [
  [1.8620678550872327, -1.0112546305316843, 0.14918677544445175],
  [0.38752654323613717, 0.6214474419314753, -0.008973985167612518],
  [-0.015841498849333856, -0.03412293802851557, 1.0499644368778496],
];
const XYZ_TO_RGB = [
  [3.2409699419045226, -1.537383177570094, -0.4986107602930034],
  [-0.9692436362808796, 1.8759675015077202, 0.04155505740717559],
  [0.05563007969699366, -0.20397695888897652, 1.0569715142428786],
];
const W = D65.map((v) => v * 100);
const RGBW = CAT16.map((r) => r[0] * W[0] + r[1] * W[1] + r[2] * W[2]);
const DRGB_INV = RGBW.map((c) => 1 / (1 + (W[1] / c - 1) * D));
const adapt = (c: number) => {
  const x = (FL * c * 0.01) ** 0.42;
  return (400 * x) / (x + 27.13);
};
const AW =
  NBB *
  (2 * adapt(RGBW[0] / DRGB_INV[0]) +
    adapt(RGBW[1] / DRGB_INV[1]) +
    0.05 * adapt(RGBW[2] / DRGB_INV[2]));
const UNADAPT_K = (100 / FL) * 27.13 ** (1 / 0.42);
const unadapt = (a: number) => {
  const m = Math.abs(a);
  return Math.sign(a) * UNADAPT_K * (m / (400 - m)) ** (1 / 0.42);
};
const CHROMA_K = (1.64 - 0.29 ** N) ** -0.73;
const P1K = (5e4 / 13) * NBB * 1; // nc · ncb

/** XYZ (Y in 0 … 1) of the CAM16 colour (J, C, h in radians' cos/sin form). */
function cam16(J: number, C: number, hRad: number, out: V3) {
  const cosh = Math.cos(hRad);
  const sinh = Math.sin(hRad);
  const jr = Math.sqrt(J) * 0.1;
  const t = ((C / jr) * CHROMA_K) ** (10 / 9);
  const et = 0.25 * (Math.cos(hRad + 2) + 3.8);
  const A = AW * jr ** (2 / SC / Z);
  const p1 = P1K * et;
  const p2 = A / NBB;
  const den = 23 * p1 + t * (11 * cosh + 108 * sinh);
  const r = den === 0 ? 0 : (23 * (p2 + 0.305) * t) / den;
  const a = r * cosh;
  const b = r * sinh;
  const rc = unadapt((460 * p2 + 451 * a + 288 * b) / 1403) * DRGB_INV[0];
  const gc = unadapt((460 * p2 - 891 * a - 261 * b) / 1403) * DRGB_INV[1];
  const bc = unadapt((460 * p2 - 220 * a - 6300 * b) / 1403) * DRGB_INV[2];
  out[0] = (CAT16_INV[0][0] * rc + CAT16_INV[0][1] * gc + CAT16_INV[0][2] * bc) / 100;
  out[1] = (CAT16_INV[1][0] * rc + CAT16_INV[1][1] * gc + CAT16_INV[1][2] * bc) / 100;
  out[2] = (CAT16_INV[2][0] * rc + CAT16_INV[2][1] * gc + CAT16_INV[2][2] * bc) / 100;
}

/** HCT (hue in degrees, chroma, tone 0 … 100) → linear sRGB, unclamped. */
export function hctToLinear(h: number, c: number, t: number): V3 {
  if (t <= 0) return [0, 0, 0];
  const y = fromLstar(t);
  const hRad = (((h % 360) + 360) % 360) * (Math.PI / 180);
  const xyz: V3 = [0, 0, 0];
  let j = 0.00379058511492914 * t * t + 0.608983189401032 * t + 0.9155088574762233;
  let best: V3 = [0, 0, 0];
  let last = Infinity;
  for (let k = 0; k <= 15; k++) {
    cam16(j, c, hRad, xyz);
    const delta = Math.abs(xyz[1] - y);
    if (delta < last) {
      best = [xyz[0], xyz[1], xyz[2]];
      last = delta;
      if (delta <= 2e-12) break;
    }
    j -= ((xyz[1] - y) * j) / (2 * xyz[1]);
  }
  return XYZ_TO_RGB.map((r) => r[0] * best[0] + r[1] * best[1] + r[2] * best[2]) as V3;
}

const EPS = 1e-6;
/** Linear sRGB → linear Display P3. */
const P3 = [
  [0.8224621, 0.177538, 0],
  [0.0331941, 0.9668058, 0],
  [0.0170827, 0.0723974, 0.9105199],
];
/** Inside Display P3: the gamut the model is limited to (wider than sRGB, as Tailwind's own colours are). */
const inGamut = ([r, g, b]: V3) => {
  for (const [x, y, z] of P3) {
    const v = x * r + y * g + z * b;
    if (v < -EPS || v > 1 + EPS) return false;
  }
  return true;
};

/** The largest chroma up to `cap` that fits Display P3 at a hue and tone (`cap` itself if it fits). */
export function hctMaxChroma(h: number, t: number, cap: number): number {
  if (inGamut(hctToLinear(h, cap, t))) return cap;
  let lo = 0;
  let hi = cap;
  for (let k = 0; k < 14; k++) {
    const mid = (lo + hi) / 2;
    if (inGamut(hctToLinear(h, mid, t))) lo = mid;
    else hi = mid;
  }
  return lo;
}

/**
 * HCT → linear sRGB inside Display P3: chroma lowered, at fixed hue and tone, until the colour fits.
 * Components may lie outside 0 … 1 (colours beyond sRGB).
 */
export function hctToGamut(h: number, c: number, t: number): V3 {
  return hctToLinear(h, hctMaxChroma(h, t, c), t);
}

/** Sharpness of the soft clamp, per unit of HCT chroma: the corner is rounded over ~±1/K. */
const K = 0.3;

/**
 * Like `hctToGamut`, but the chroma meets the gamut boundary smoothly: the soft minimum of the wanted
 * chroma and the largest one that fits, so the result has no corner where one takes over from the other.
 */
export function hctToSoftGamut(h: number, c: number, t: number): V3 {
  // far inside the gamut the soft minimum is the wanted chroma to within 1 %
  const g = hctMaxChroma(h, t, c + 14);
  const ce = g >= c + 14 ? c : -Math.log(Math.exp(-K * c) + Math.exp(-K * g)) / K;
  return hctToLinear(h, ce, t);
}

/** Linear sRGB → OKLCH (hue undefined, here 0, for greys). */
export function linearToOklch([r, g, b]: V3): { l: number; c: number; h: number } {
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const a = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const bb = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  const c = Math.hypot(a, bb);
  return {
    l: 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    c,
    h: c < 1e-7 ? 0 : ((((Math.atan2(bb, a) * 180) / Math.PI) % 360) + 360) % 360,
  };
}
