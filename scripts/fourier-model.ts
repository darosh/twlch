/**
 * The Fourier model as the fitter sees it: L, C and hue of the 11 Tailwind shades as smooth,
 * hue-periodic functions of the shade-500 hue, with every coefficient stored per shade. The library
 * gets it as generated plain code instead (src/calc.fourier.generated.ts), where each per-shade
 * coefficient is itself a smooth function of shade. See scripts/fit-fourier.ts.
 *
 *  - chroma: a two-sided bump over the shade axis, c0 + P·exp(-½|(t-μ)/σ|^pw), where P, μ and both
 *    widths are Fourier series in hue, plus a ridge-smoothed Fourier residual per shade (KR harmonics)
 *    that follows the hand-tuned chroma of the individual families,
 *  - lightness: one Fourier series in hue per shade (KL harmonics, ridge-smoothed so it doesn't ring
 *    between the fitted hues; Tailwind's lightness is hand-tuned and too jagged for fewer terms),
 *  - hue: the anchor hue plus a drift d1·t + d2·t² (Fourier series in hue) and the same kind of
 *    per-shade residual.
 */

export interface FourierSpec {
  /** Harmonics for the chroma and hue-drift series. */
  K: number;
  /** Harmonics for the per-shade lightness series. */
  KL: number;
  /** Harmonics for the per-shade chroma and hue residual series. */
  KR: number;
  /** Number of shades the spec was fitted for. */
  n: number;
  /** Shade-500 hues of the Tailwind families it was fitted to, sorted: where "bulk" scales are spread. */
  hues: number[];
  params: number[];
}

export interface FourierLch {
  l: number;
  c: number;
  h: number;
}

const R = Math.PI / 180;
/** Tailwind's shades; the chroma bump and hue drift run over u = (shade − 50) / 900. */
const SHADES = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950];

/** Offsets of each parameter group inside `params`. */
export function layout(K: number, KL: number, KR: number, n: number) {
  const nf = 1 + 2 * K;
  const nl = 1 + 2 * KL;
  const nr = 1 + 2 * KR;
  const o = {
    P: 0,
    mu: nf,
    lsL: 2 * nf,
    lsR: 3 * nf,
    d1: 4 * nf,
    d2: 5 * nf,
    L: 6 * nf, // per shade: nl values (mean + harmonics)
    Cr: 6 * nf + n * nl, // per shade: chroma residual series
    Hr: 6 * nf + n * nl + n * nr, // per shade: hue residual series, in degrees
    c0: 6 * nf + n * nl + 2 * n * nr,
    pw: 6 * nf + n * nl + 2 * n * nr + 1,
    size: 6 * nf + n * nl + 2 * n * nr + 2,
  };
  return { ...o, nf, nl, nr };
}

function fourier(a: number, p: readonly number[], o: number, k: number) {
  let s = p[o];
  for (let j = 1; j <= k; j++) {
    s += p[o + 2 * j - 1] * Math.cos(j * a * R) + p[o + 2 * j] * Math.sin(j * a * R);
  }
  return s;
}

/** The scale at hue `a` (degrees), one entry per shade. */
export function fourierCurve(spec: FourierSpec, a: number): FourierLch[] {
  const { K, KL, KR, n, params: p } = spec;
  const o = layout(K, KL, KR, n);
  const P = fourier(a, p, o.P, K);
  const mu = fourier(a, p, o.mu, K);
  const sL = Math.exp(fourier(a, p, o.lsL, K));
  const sR = Math.exp(fourier(a, p, o.lsR, K));
  const d1 = fourier(a, p, o.d1, K);
  const d2 = fourier(a, p, o.d2, K);
  const c0 = p[o.c0];
  const pw = p[o.pw];
  const out: FourierLch[] = [];
  for (let i = 0; i < n; i++) {
    const t = (SHADES[i] - 50) / 900;
    const l = fourier(a, p, o.L + i * o.nl, KL);
    const z = Math.abs((t - mu) / (t < mu ? sL : sR));
    const c = Math.max(0, c0 + P * Math.exp(-0.5 * z ** pw) + fourier(a, p, o.Cr + i * o.nr, KR));
    const h = a + d1 * t + d2 * t * t + fourier(a, p, o.Hr + i * o.nr, KR);
    out.push({ l, c, h: ((h % 360) + 360) % 360 });
  }
  return out;
}

/** Starting point for the fit. */
export function initialParams(
  K: number,
  KL: number,
  KR: number,
  n: number,
  meanL: number[],
): number[] {
  const o = layout(K, KL, KR, n);
  const p = Array.from({ length: o.size }, () => 0);
  p[o.P] = 0.2;
  p[o.mu] = 0.55;
  p[o.lsL] = Math.log(0.25);
  p[o.lsR] = Math.log(0.35);
  for (let i = 0; i < n; i++) p[o.L + i * o.nl] = meanL[i];
  p[o.c0] = 0.01;
  p[o.pw] = 2;
  return p;
}
