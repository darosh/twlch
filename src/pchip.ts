/**
 * Monotone cubic Hermite interpolation (Fritsch–Carlson / PCHIP) through uniformly spaced samples.
 * Passes through every sample, never overshoots between them and keeps extrema at the data points.
 * Returns f(t) for t in [0, y.length - 1] (t is clamped).
 */
export function pchip(y: readonly number[]): (t: number) => number {
  const n = y.length;
  if (n === 0) return () => NaN;
  if (n === 1) return () => y[0];

  const d: number[] = []; // secant slopes (spacing 1)
  for (let i = 0; i < n - 1; i++) d.push(y[i + 1] - y[i]);

  const m = Array.from<number>({ length: n });
  if (n === 2) {
    m[0] = m[1] = d[0];
  } else {
    for (let i = 1; i < n - 1; i++) {
      m[i] = d[i - 1] * d[i] <= 0 ? 0 : (2 * d[i - 1] * d[i]) / (d[i - 1] + d[i]); // harmonic mean
    }
    m[0] = endSlope(d[0], d[1]);
    m[n - 1] = endSlope(d[n - 2], d[n - 3]);
  }

  return (t: number) => {
    const c = Math.min(n - 1, Math.max(0, t));
    const i = Math.min(n - 2, Math.floor(c));
    const s = c - i;
    const s2 = s * s;
    const s3 = s2 * s;
    return (
      (2 * s3 - 3 * s2 + 1) * y[i] +
      (s3 - 2 * s2 + s) * m[i] +
      (-2 * s3 + 3 * s2) * y[i + 1] +
      (s3 - s2) * m[i + 1]
    );
  };
}

/** Shape-preserving one-sided three-point endpoint slope (same rule as SciPy's PchipInterpolator). */
function endSlope(d0: number, d1: number): number {
  const m = (3 * d0 - d1) / 2;
  if (Math.sign(m) !== Math.sign(d0)) return 0;
  if (Math.sign(d0) !== Math.sign(d1) && Math.abs(m) > 3 * Math.abs(d0)) return 3 * d0;
  return m;
}

/** Fritsch–Carlson slopes for unevenly spaced samples (SciPy's weighted harmonic mean). */
function slopesXY(x: readonly number[], y: readonly number[]): number[] {
  const n = x.length;
  const h: number[] = [];
  const d: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    h.push(x[i + 1] - x[i]);
    d.push((y[i + 1] - y[i]) / h[i]);
  }
  if (n === 2) return [d[0], d[0]];
  const m = Array.from<number>({ length: n });
  for (let i = 1; i < n - 1; i++) {
    if (d[i - 1] * d[i] <= 0) m[i] = 0;
    else {
      const w1 = 2 * h[i] + h[i - 1];
      const w2 = h[i] + 2 * h[i - 1];
      m[i] = (w1 + w2) / (w1 / d[i - 1] + w2 / d[i]);
    }
  }
  const edge = (h0: number, h1: number, d0: number, d1: number) => {
    const s = ((2 * h0 + h1) * d0 - h0 * d1) / (h0 + h1);
    if (Math.sign(s) !== Math.sign(d0)) return 0;
    if (Math.sign(d0) !== Math.sign(d1) && Math.abs(s) > 3 * Math.abs(d0)) return 3 * d0;
    return s;
  };
  m[0] = edge(h[0], h[1], d[0], d[1]);
  m[n - 1] = edge(h[n - 2], h[n - 3], d[n - 2], d[n - 3]);
  return m;
}

/**
 * Monotone cubic Hermite through (x, y) with strictly increasing x.
 * With `period`, the samples form a closed ring (x spans less than one period) and f wraps around;
 * otherwise t is clamped to [x[0], x[n-1]].
 */
export function pchipXY(
  x: readonly number[],
  y: readonly number[],
  period?: number,
): (t: number) => number {
  const n = x.length;
  if (n === 0) return () => NaN;
  if (n === 1) return () => y[0];

  let xs = x as number[];
  let ys = y as number[];
  if (period !== undefined) {
    const k = Math.min(2, n);
    const head = x.slice(n - k).map((v) => v - period);
    const tail = x.slice(0, k).map((v) => v + period);
    xs = [...head, ...x, ...tail];
    ys = [...y.slice(n - k), ...y, ...y.slice(0, k)];
  }
  const m = slopesXY(xs, ys);
  const lo = period !== undefined ? x[0] : xs[0];

  return (t: number) => {
    let c = t;
    if (period !== undefined) c = lo + ((((t - lo) % period) + period) % period);
    else c = Math.min(xs[xs.length - 1], Math.max(xs[0], t));
    let i = 0;
    let a = 0;
    let b = xs.length - 2;
    while (a <= b) {
      const mid = (a + b) >> 1;
      if (xs[mid] <= c) {
        i = mid;
        a = mid + 1;
      } else b = mid - 1;
    }
    const hh = xs[i + 1] - xs[i];
    const s = (c - xs[i]) / hh;
    const s2 = s * s;
    const s3 = s2 * s;
    return (
      (2 * s3 - 3 * s2 + 1) * ys[i] +
      (s3 - 2 * s2 + s) * hh * m[i] +
      (-2 * s3 + 3 * s2) * ys[i + 1] +
      (s3 - s2) * hh * m[i + 1]
    );
  };
}

/** Piecewise-linear counterpart of `pchipXY` (same signature, same ring handling). */
export function linearXY(
  x: readonly number[],
  y: readonly number[],
  period?: number,
): (t: number) => number {
  const n = x.length;
  if (n === 0) return () => NaN;
  if (n === 1) return () => y[0];
  const xs = period !== undefined ? [...x, x[0] + period] : (x as number[]);
  const ys = period !== undefined ? [...y, y[0]] : (y as number[]);
  const lo = xs[0];
  return (t: number) => {
    const c =
      period !== undefined
        ? lo + ((((t - lo) % period) + period) % period)
        : Math.min(xs[xs.length - 1], Math.max(xs[0], t));
    let a = 0;
    let b = xs.length - 2;
    let i = 0;
    while (a <= b) {
      const m = (a + b) >> 1;
      if (xs[m] <= c) {
        i = m;
        a = m + 1;
      } else b = m - 1;
    }
    const s = (c - xs[i]) / (xs[i + 1] - xs[i]);
    return ys[i] + (ys[i + 1] - ys[i]) * s;
  };
}
