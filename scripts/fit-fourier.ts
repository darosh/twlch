// Fits the Fourier model in src/models/fourier.ts to the Tailwind chromatic families.
// Run: node scripts/fit-fourier.ts [--K 3] [--KL 12] [--KR 12] [--lam 1e-4] [--digits 4] [--loo] [--write]
//   --loo    also report leave-one-hue-out error (refit without each family, predict it from its hue)
//   --digits significant digits of the written coefficients (default 4); the reported errors include the rounding
//   --write  emit src/models/fourier.generated.ts
//
// Lightness depends only on hue, so it is solved first, per shade, as a ridge-regularised Fourier
// series (closed form). The penalty grows with harmonic order and its strength is chosen per shade by
// leave-one-out error plus wiggle between hues, weighted towards in-sample accuracy at the ends.
// The chroma bump and hue drift are then fitted with Levenberg–Marquardt, and what they leave over
// (per shade, per family) is fitted with the same kind of series: chroma residual and hue residual.
import { writeFileSync } from "node:fs";
import { tailwind } from "../src/data.ts";
import type { Family } from "../src/data.ts";
import { fourierCurve, initialParams, layout } from "../src/models/fourier.ts";
import { pchipXY } from "../src/pchip.ts";
import type { FourierSpec } from "../src/models/fourier.ts";

const arg = (name: string, d: number) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? Number(process.argv[i + 1]) : d;
};
const K = arg("K", 3);
const KL = arg("KL", 12);
const KR = arg("KR", 12);
const DIGITS = arg("digits", 4);
const LAM = arg("lam", 1e-4);
const R = Math.PI / 180;
const n = tailwind.shades.length;
const MID = Math.floor(n / 2);
const fams = tailwind.chromatic;
const o = layout(K, KL, KR, n);
const anchor = (f: Family) => ((f.h[MID] % 360) + 360) % 360;
const mean = (x: number[]) => x.reduce((s, v) => s + v, 0) / x.length;

const lab = (l: number, c: number, h: number): [number, number, number] => [
  l,
  c * Math.cos(h * R),
  c * Math.sin(h * R),
];

/** Per-shade OKLab distance (x100) between the model at the family's hue and the family. */
function errors(spec: FourierSpec, f: Family) {
  const m = fourierCurve(spec, anchor(f));
  return m.map((s, i) => {
    const p = lab(s.l, s.c, s.h);
    const q = lab(f.l[i], f.c[i], f.h[i]);
    return 100 * Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
  });
}

function solve(A: number[][], b: number[]): number[] {
  const m = b.length;
  const M = A.map((row, i) => [...row, b[i]]);
  for (let c = 0; c < m; c++) {
    let piv = c;
    for (let r = c + 1; r < m; r++) if (Math.abs(M[r][c]) > Math.abs(M[piv][c])) piv = r;
    [M[c], M[piv]] = [M[piv], M[c]];
    const d = M[c][c] || 1e-12;
    for (let r = c + 1; r < m; r++) {
      const f = M[r][c] / d;
      for (let k = c; k <= m; k++) M[r][k] -= f * M[c][k];
    }
  }
  const x = Array.from({ length: m }, () => 0);
  for (let i = m - 1; i >= 0; i--) {
    let s = M[i][m];
    for (let k = i + 1; k < m; k++) s -= M[i][k] * x[k];
    x[i] = s / (M[i][i] || 1e-12);
  }
  return x;
}

// ---- per-shade ridge Fourier series (lightness, chroma residual, hue residual) -------------------------------------------------------
const basis = (a: number, k: number) => {
  const v = [1];
  for (let j = 1; j <= k; j++) v.push(Math.cos(j * a * R), Math.sin(j * a * R));
  return v;
};
const pen = (r: number) => (r === 0 ? 0 : Math.ceil(r / 2) ** 2);

type Target = (f: Family, i: number) => number;
function ridgeFit(data: Family[], i: number, lam: number, k: number, y: Target): number[] {
  const X = data.map((f) => basis(anchor(f), k));
  const t = data.map((f) => y(f, i));
  const m = 1 + 2 * k;
  const N = Array.from({ length: m }, (_, r) =>
    Array.from(
      { length: m },
      (_, c) => X.reduce((s, x) => s + x[r] * x[c], 0) + (r === c ? lam * pen(r) : 0),
    ),
  );
  return solve(
    N,
    Array.from({ length: m }, (_, r) => X.reduce((s, x, j) => s + x[r] * t[j], 0)),
  );
}
const evalSeries = (w: number[], a: number, k: number) =>
  basis(a, k).reduce((s, b, q) => s + b * w[q], 0);

// Candidate penalties; lightness at the ends (50, 100, 900, 950) weighs in-sample error more: 0.1% is visible.
const LAMS = [1e-3, 3e-3, 1e-2, 3e-2, 1e-1, 3e-1, 1];
function chooseLam(data: Family[], i: number, k: number, y: Target, weight: number) {
  let best = { lam: LAMS[0], score: Infinity };
  const sorted = data.slice().sort((p, q) => anchor(p) - anchor(q));
  const pc = pchipXY(
    sorted.map(anchor),
    sorted.map((f) => y(f, i)),
    360,
  );
  for (const lam of LAMS) {
    const w = ridgeFit(data, i, lam, k, y);
    const inMax = Math.max(...data.map((f) => Math.abs(evalSeries(w, anchor(f), k) - y(f, i))));
    const loo = data.map((f) =>
      Math.abs(
        evalSeries(
          ridgeFit(
            data.filter((g) => g !== f),
            i,
            lam,
            k,
            y,
          ),
          anchor(f),
          k,
        ) - y(f, i),
      ),
    );
    // wiggle between the fitted hues, measured against the monotone interpolation of the same data
    let ring = 0;
    for (let a = 0; a < 360; a += 1) ring = Math.max(ring, Math.abs(evalSeries(w, a, k) - pc(a)));
    const score = weight * inMax + mean(loo) + ring;
    if (score < best.score) best = { lam, score };
  }
  return best.lam;
}

/** Fit one series per shade into p at `off`; `scale` converts the fit unit to the stored unit. */
function fitSeries(
  data: Family[],
  p: number[],
  off: number,
  k: number,
  y: Target,
  weight: (i: number) => number,
  scale = 1,
  lams?: number[],
) {
  const chosen: number[] = [];
  const nk = 1 + 2 * k;
  for (let i = 0; i < n; i++) {
    const lam = lams?.[i] ?? chooseLam(data, i, k, y, weight(i));
    chosen.push(lam);
    const w = ridgeFit(data, i, lam, k, y);
    for (let q = 0; q < nk; q++) p[off + i * nk + q] = w[q] * scale;
  }
  return chosen;
}
const endWeight = (i: number) => (i <= 1 || i >= n - 2 ? 4 : arg("wl", 4));
const flatWeight = () => arg("wc", 2);
// hue residual is fitted as arc length at chroma 0.25, so its penalty is comparable to chroma's
const HS = R * 0.25;
const wrap180 = (a: number) => ((((a + 180) % 360) + 360) % 360) - 180;

// ---- chroma and hue: Levenberg–Marquardt over the non-lightness parameters -------------------------
// ridge weights per parameter: harmonic order k, scaled by group (hue drift is in degrees)
const ridge: number[] = Array.from({ length: o.size }, () => 0);
for (const [off, sc] of [
  [o.P, 1],
  [o.mu, 1],
  [o.lsL, 1],
  [o.lsR, 1],
  [o.d1, 0.01],
  [o.d2, 0.01],
]) {
  for (let j = 1; j <= K; j++) ridge[off + 2 * j - 1] = ridge[off + 2 * j] = j * sc;
}
// the series (lightness and both residuals) are solved separately, not by LM
const free = Array.from({ length: o.size }, (_, i) => i).filter((i) => i < o.L || i >= o.c0);

function residuals(p: number[], data: Family[]): number[] {
  const spec: FourierSpec = { K, KL, KR, n, hues: [], params: p };
  const r: number[] = [];
  for (const f of data) {
    const m = fourierCurve(spec, anchor(f));
    for (let i = 0; i < n; i++) {
      const a = lab(m[i].l, m[i].c, m[i].h);
      const b = lab(f.l[i], f.c[i], f.h[i]);
      for (let j = 0; j < 3; j++) r.push(100 * (a[j] - b[j]));
    }
  }
  const w = 100 * Math.sqrt(LAM);
  for (let k = 0; k < p.length; k++) if (ridge[k]) r.push(w * ridge[k] * p[k]);
  return r;
}

/** Levenberg–Marquardt with a finite-difference Jacobian over the free parameters. */
function fit(p0: number[], data: Family[], iters = 400) {
  let p = p0.slice();
  let r = residuals(p, data);
  let cost = r.reduce((s, x) => s + x * x, 0);
  let lam = 1e-2;
  for (let it = 0; it < iters; it++) {
    const J: number[][] = [];
    for (const k of free) {
      const h = 1e-6 * Math.max(1, Math.abs(p[k]));
      const q = p.slice();
      q[k] += h;
      J.push(residuals(q, data).map((v, i) => (v - r[i]) / h));
    }
    const A = J.map((ji) => J.map((jj) => ji.reduce((s, v, k) => s + v * jj[k], 0)));
    const g = J.map((row) => row.reduce((s, v, k) => s + v * r[k], 0));
    let improved = false;
    for (let tries = 0; tries < 14; tries++) {
      const Ad = A.map((row, i) => row.map((v, j) => (i === j ? v + lam * (A[i][i] + 1e-9) : v)));
      const d = solve(
        Ad,
        g.map((v) => -v),
      );
      const q = p.slice();
      free.forEach((k, i) => (q[k] += d[i]));
      const rq = residuals(q, data);
      const cq = rq.reduce((s, x) => s + x * x, 0);
      if (cq < cost) {
        const rel = (cost - cq) / cost;
        p = q;
        r = rq;
        cost = cq;
        lam = Math.max(lam / 3, 1e-9);
        improved = true;
        if (rel < 1e-10) return p;
        break;
      }
      lam *= 4;
    }
    if (!improved) break;
  }
  return p;
}

type Lams = { l: number[]; c: number[]; h: number[] };
function fitAll(data: Family[], start?: number[], lams?: Lams) {
  const meanL = tailwind.shades.map((_, i) => mean(data.map((f) => f.l[i])));
  let p = start ? start.slice() : initialParams(K, KL, KR, n, meanL);
  const l = fitSeries(data, p, o.L, KL, (f, i) => f.l[i], endWeight, 1, lams?.l);
  p.fill(0, o.Cr, o.c0); // residuals start empty: LM fits the bump and drift alone
  p = fit(p, data);
  const bump = new Map(
    data.map((f) => [f, fourierCurve({ K, KL, KR, n, hues: [], params: p }, anchor(f))]),
  );
  const c = fitSeries(
    data,
    p,
    o.Cr,
    KR,
    (f, i) => f.c[i] - bump.get(f)![i].c,
    flatWeight,
    1,
    lams?.c,
  );
  const h = fitSeries(
    data,
    p,
    o.Hr,
    KR,
    (f, i) => wrap180(f.h[i] - bump.get(f)![i].h) * HS,
    flatWeight,
    1 / HS,
    lams?.h,
  );
  return { p, lams: { l, c, h } };
}

const t0 = Date.now();
const { p, lams } = fitAll(fams);
const sig = (x: number) => Number(x.toPrecision(DIGITS));
const rounded = p.map(sig);
const hues = fams.map(anchor).sort((a, b) => a - b);
const spec: FourierSpec = { K, KL, KR, n, hues, params: rounded };
console.log(
  `K=${K} KL=${KL} lam=${LAM} params=${p.length} data=${fams.length * n * 3} (${(Date.now() - t0) / 1000}s)`,
);

// per-shade in-sample error: lightness, chroma, hue (degrees x chroma, i.e. perceptual) and total dE
console.log("shade  max|dL|%  max|dC|x100  max|dh|deg  max dE   mean dE");
tailwind.shades.forEach((sh, i) => {
  const rows = fams.map((f) => {
    const s = fourierCurve(spec, anchor(f))[i];
    return {
      dl: Math.abs(s.l - f.l[i]),
      dc: Math.abs(s.c - f.c[i]),
      dh: Math.abs(wrap180(s.h - f.h[i])),
      de: errors(spec, f)[i],
    };
  });
  console.log(
    [
      String(sh).padStart(5),
      (100 * Math.max(...rows.map((r) => r.dl))).toFixed(2).padStart(9),
      (100 * Math.max(...rows.map((r) => r.dc))).toFixed(2).padStart(12),
      Math.max(...rows.map((r) => r.dh))
        .toFixed(2)
        .padStart(12),
      Math.max(...rows.map((r) => r.de))
        .toFixed(2)
        .padStart(8),
      mean(rows.map((r) => r.de))
        .toFixed(2)
        .padStart(9),
    ].join(" "),
  );
});
const all = fams.flatMap((f) => errors(spec, f));
console.log(`in-sample dE: mean ${mean(all).toFixed(2)} max ${Math.max(...all).toFixed(2)}`);

if (process.argv.includes("--loo")) {
  const loo: number[] = [];
  const looL: number[] = [];
  for (const f of fams) {
    const rest = fams.filter((g) => g !== f);
    const { p: pl } = fitAll(rest, p, lams);
    const s: FourierSpec = { K, KL, KR, n, hues, params: pl };
    loo.push(...errors(s, f));
    looL.push(...fourierCurve(s, anchor(f)).map((x, i) => Math.abs(x.l - f.l[i])));
  }
  console.log(
    `leave-one-hue-out dE: mean ${mean(loo).toFixed(2)} max ${Math.max(...loo).toFixed(2)}; |dL| mean ${(100 * mean(looL)).toFixed(2)}% max ${(100 * Math.max(...looL)).toFixed(2)}%`,
  );
}

if (process.argv.includes("--write")) {
  const src = `// Generated by scripts/fit-fourier.ts against Tailwind ${tailwind.tailwind}. Do not edit.
import type { FourierSpec } from "./fourier.ts";

export const fourier: FourierSpec = ${JSON.stringify({ K, KL, KR, n, hues: hues.map((h) => Number(h.toFixed(3))), params: rounded })};
`;
  writeFileSync(new URL("../src/models/fourier.generated.ts", import.meta.url), src);
  console.log("wrote src/models/fourier.generated.ts");
}
