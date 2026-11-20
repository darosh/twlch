// Fits the Fourier model (scripts/fourier-model.ts) to the Tailwind chromatic families and writes it as a
// plain function of shade and hue.
// Run: node scripts/fit-fourier.ts [--K 3] [--KL 12] [--KR 12] [--lam 1e-4] [--digits 4] [--loo] [--write]
//   --loo    also report leave-one-hue-out error (refit without each family, predict it from its hue)
//   --digits significant digits of the written coefficients (default 4); the reported errors include the rounding
//   --shadeDeg degree of the Chebyshev series that make every per-shade coefficient a function of shade (default 10)
//   --shadeRidge smoothness penalty on their high orders: exact at the 11 shades at 0, smoother between them above (default 1e-3)
//   --write  emit src/calc.fourier.generated.ts: plain code, sums of cos/sin and polynomials, no data
//
// Lightness depends only on hue, so it is solved first, per shade, as a ridge-regularised Fourier
// series (closed form). The penalty grows with harmonic order and its strength is chosen per shade by
// leave-one-out error plus wiggle between hues, weighted towards in-sample accuracy at the ends.
// The chroma bump and hue drift are then fitted with Levenberg–Marquardt, and what they leave over
// (per shade, per family) is fitted with the same kind of series: chroma residual and hue residual.
import { writeFileSync } from "node:fs";
import { tailwind } from "../src/data.ts";
import type { Family } from "../src/data.ts";
import { createTwlch } from "../src/model.ts";
import { pchipXY } from "../src/pchip.ts";
import { fourierCurve, initialParams, layout } from "./fourier-model.ts";
import type { FourierSpec } from "./fourier-model.ts";
import {
  chebEval,
  chebLines,
  chebT,
  chebTerms,
  fitCheb,
  solve,
  sumExpr,
  sumNames,
  trigLines,
  xOf,
} from "./lib.ts";

const arg = (name: string, d: number) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? Number(process.argv[i + 1]) : d;
};
const K = arg("K", 3);
const KL = arg("KL", 12);
const KR = arg("KR", 12);
const DIGITS = arg("digits", 4);
const DEG = arg("shadeDeg", 10);
const SHADE_RIDGE = arg("shadeRidge", 1e-3);
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
function errors(curve: (a: number) => { l: number; c: number; h: number }[], f: Family) {
  const m = curve(anchor(f));
  return m.map((s, i) => {
    const p = lab(s.l, s.c, s.h);
    const q = lab(f.l[i], f.c[i], f.h[i]);
    return 100 * Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
  });
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
const hues = fams.map(anchor).sort((a, b) => a - b);
const SHADES = tailwind.shades;
const R4 = (x: number) => Number(x.toPrecision(DIGITS));

// ---- shade as a parameter -----------------------------------------------------------------------------
// The chroma bump and hue drift are already functions of u = (shade − 50) / 900. Every per-shade series
// coefficient (lightness, chroma residual, hue residual) becomes a Chebyshev series in x = (shade − 500) / 450.
interface FourierCont {
  hues: number[];
  /** P, μ, ln σ_left, ln σ_right, d1, d2: Fourier series in hue (K harmonics), constant first. */
  bump: number[][];
  c0: number;
  pw: number;
  /** One Chebyshev series in shade per Fourier coefficient: constant, then (cos, sin) per harmonic. */
  L: number[][];
  Cr: number[][];
  Hr: number[][];
}
function toContinuous(params: number[]): FourierCont {
  const group = (off: number, nk: number) =>
    Array.from({ length: nk }, (_, q) =>
      fitCheb(
        SHADES.map((_, i) => params[off + i * nk + q]),
        SHADES,
        DEG,
        SHADE_RIDGE,
      ),
    );
  return {
    hues,
    bump: [o.P, o.mu, o.lsL, o.lsR, o.d1, o.d2].map((off) => params.slice(off, off + o.nf)),
    c0: params[o.c0],
    pw: params[o.pw],
    L: group(o.L, o.nl),
    Cr: group(o.Cr, o.nr),
    Hr: group(o.Hr, o.nr),
  };
}
const roundCont = (c: FourierCont): FourierCont => ({
  hues: c.hues.map((h) => Number(h.toFixed(3))),
  bump: c.bump.map((w) => w.map(R4)),
  c0: R4(c.c0),
  pw: R4(c.pw),
  L: c.L.map((f) => f.map(R4)),
  Cr: c.Cr.map((f) => f.map(R4)),
  Hr: c.Hr.map((f) => f.map(R4)),
});
const contSize = (c: FourierCont) =>
  c.hues.length +
  c.bump.reduce((t, w) => t + w.length, 0) +
  2 +
  [...c.L, ...c.Cr, ...c.Hr].reduce((t, f) => t + f.length, 0);

/** The colour at an arbitrary shade (50…950) and hue. */
function evalAt(c: FourierCont, shade: number, a: number) {
  const T = chebT(xOf(shade), DEG);
  const u = (shade - 50) / 900;
  const hueSeries = (w: number[]) => {
    let v = w[0];
    for (let j = 1; j <= K; j++) {
      v += w[2 * j - 1] * Math.cos(j * a * R) + w[2 * j] * Math.sin(j * a * R);
    }
    return v;
  };
  const shadeSeries = (fns: number[][], k: number) => {
    let v = chebEval(fns[0], T);
    for (let j = 1; j <= k; j++) {
      v +=
        chebEval(fns[2 * j - 1], T) * Math.cos(j * a * R) +
        chebEval(fns[2 * j], T) * Math.sin(j * a * R);
    }
    return v;
  };
  const [P, mu, lsL, lsR, d1, d2] = c.bump.map(hueSeries);
  const z = Math.abs((u - mu) / (u < mu ? Math.exp(lsL) : Math.exp(lsR)));
  const chroma = Math.max(0, c.c0 + P * Math.exp(-0.5 * z ** c.pw) + shadeSeries(c.Cr, KR));
  const h = a + d1 * u + d2 * u * u + shadeSeries(c.Hr, KR);
  return { l: shadeSeries(c.L, KL), c: chroma, h: ((h % 360) + 360) % 360 };
}

function generate(c: FourierCont, version: string): string {
  const harmonics = Array.from({ length: Math.max(K, KL, KR) }, (_, j) => j + 1);
  const out: string[] = [];
  out.push(`// Generated by scripts/fit-fourier.ts against Tailwind ${version}. Do not edit.`);
  out.push(
    `// The Tailwind chromatic scales as a function of shade and hue: Fourier series in hue (sums of`,
  );
  out.push(
    `// cos/sin of whole turns) whose coefficients are smooth functions of shade (Chebyshev sums). Chroma`,
  );
  out.push(`// is a two-sided bump over shade plus a residual, the hue a drift plus a residual.`);
  out.push(`import { chromaticHues, shades } from "./data.generated.ts";`);
  out.push(``);
  out.push(`const R = Math.PI / 180;`);
  out.push(``);
  out.push(`/** Shade-500 hues of the Tailwind families it was fitted to, sorted. */`);
  out.push(`export const fourierHues: number[] = chromaticHues;`);
  out.push(``);
  out.push(`/** The colour (OKLCH) at a shade from 50 to 950 and a hue in degrees. */`);
  out.push(
    `export function fourierAt(shade: number, hue: number): { l: number; c: number; h: number } {`,
  );
  out.push(...chebLines(DEG));
  out.push(`  const u = (shade - 50) / 900;`);
  out.push(`  const t = hue * R;`);
  out.push(...trigLines(harmonics));
  out.push(``);
  out.push(
    `  // chroma bump P·exp(-½|(u − μ)/σ|^pw) and hue drift d1·u + d2·u²: Fourier series in hue`,
  );
  const bumpNames = ["P", "mu", "lsL", "lsR", "d1", "d2"];
  c.bump.forEach((w, q) => {
    const terms: [number, string][] = [];
    for (let j = 1; j <= K; j++) terms.push([w[2 * j - 1], `c${j}`], [w[2 * j], `s${j}`]);
    out.push(`  const ${bumpNames[q]} = ${sumExpr(w[0], terms, "    ")};`);
  });
  const groups: [string, number[][], number, string][] = [
    ["l", c.L, KL, "lightness"],
    ["cr", c.Cr, KR, "chroma residual"],
    ["hr", c.Hr, KR, "hue residual (degrees)"],
  ];
  for (const [name, fns, k, label] of groups) {
    out.push(``);
    out.push(`  // ${label}: a Fourier series in hue whose coefficients are functions of shade`);
    const names: string[] = [];
    fns.forEach((f, q) => {
      const id = q === 0 ? `${name}0` : `${name}${Math.ceil(q / 2)}${q % 2 ? "c" : "s"}`;
      names.push(id);
      out.push(`  const ${id} = ${sumExpr(f[0], chebTerms(f), "    ")};`);
    });
    const parts = [names[0]];
    for (let j = 1; j <= k; j++)
      parts.push(`${names[2 * j - 1]} * c${j}`, `${names[2 * j]} * s${j}`);
    out.push(`  const ${name}Sum = ${sumNames(parts, "    ")};`);
  }
  out.push(``);
  out.push(`  const z = Math.abs((u - mu) / (u < mu ? Math.exp(lsL) : Math.exp(lsR)));`);
  out.push(`  const chroma = Math.max(0, ${c.c0} + P * Math.exp(-0.5 * z ** ${c.pw}) + crSum);`);
  out.push(`  const h = hue + d1 * u + d2 * u * u + hrSum;`);
  out.push(`  return { l: lSum, c: chroma, h: ((h % 360) + 360) % 360 };`);
  out.push(`}`);
  out.push(``);
  out.push(`/** The scale at hue \`a\`: the 11 Tailwind shades 50, 100, 200 … 900, 950. */`);
  out.push(`export function fourierCurve(a: number): { l: number; c: number; h: number }[] {`);
  out.push(`  return shades.map((shade) => fourierAt(shade, a));`);
  out.push(`}`);
  return out.join("\n") + "\n";
}

const cont = roundCont(toContinuous(p));
const curve = (a: number) => SHADES.map((sh) => evalAt(cont, sh, a));
console.log(
  `K=${K} KL=${KL} KR=${KR} shadeDeg=${DEG} digits=${DIGITS}: ${contSize(cont)} numbers (${(Date.now() - t0) / 1000}s)`,
);

// per-shade error at the 17 Tailwind hues: lightness, chroma, hue and total dE
console.log("shade  max|dL|%  max|dC|x100  max|dh|deg  max dE   mean dE");
SHADES.forEach((sh, i) => {
  const rows = fams.map((f) => {
    const s = curve(anchor(f))[i];
    return {
      dl: Math.abs(s.l - f.l[i]),
      dc: Math.abs(s.c - f.c[i]),
      dh: Math.abs(wrap180(s.h - f.h[i])),
      de: errors(curve, f)[i],
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
const all = fams.flatMap((f) => errors(curve, f));
console.log(
  `at the 17 Tailwind hues, 11 shades: dE mean ${mean(all).toFixed(2)} max ${Math.max(...all).toFixed(2)}`,
);
{
  // against the interpolated palette everywhere, and between shades against PCHIP of its own 11 values
  const real = createTwlch(fams, "smooth");
  const lab = (q: { l: number; c: number; h: number }) => [
    q.l,
    q.c * Math.cos(q.h * R),
    q.c * Math.sin(q.h * R),
  ];
  const dist = (a: number[], b: number[]) =>
    100 * Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
  const vsInterp: number[] = [];
  for (let a = 0; a < 360; a += 3) {
    const r = real.curve(a);
    curve(a).forEach((q, i) => vsInterp.push(dist(lab(q), lab(r[i]))));
  }
  console.log(
    `vs interpolation every 3° of hue: dE mean ${mean(vsInterp).toFixed(2)} max ${Math.max(...vsInterp).toFixed(2)}`,
  );
  const mids = SHADES.slice(1).map((v, i) => (v + SHADES[i]) / 2);
  const dev: number[] = [];
  for (let a = 0; a < 360; a += 10) {
    const vals = SHADES.map((sh) => lab(evalAt(cont, sh, a)));
    const f = [0, 1, 2].map((q) =>
      pchipXY(
        SHADES,
        vals.map((v) => v[q]),
      ),
    );
    for (const sh of mids) {
      const q = lab(evalAt(cont, sh, a));
      dev.push(dist(q, [f[0](sh), f[1](sh), f[2](sh)]));
    }
  }
  console.log(
    `between shades vs PCHIP of its own 11 values: dE mean ${mean(dev).toFixed(2)} max ${Math.max(...dev).toFixed(2)}`,
  );
}

if (process.argv.includes("--loo")) {
  const loo: number[] = [];
  const looL: number[] = [];
  for (const f of fams) {
    const rest = fams.filter((g) => g !== f);
    const { p: pl } = fitAll(rest, p, lams);
    const dcurve = (a: number) => fourierCurve({ K, KL, KR, n, hues, params: pl }, a);
    loo.push(...errors(dcurve, f));
    looL.push(...dcurve(anchor(f)).map((x, i) => Math.abs(x.l - f.l[i])));
  }
  console.log(
    `leave-one-hue-out dE: mean ${mean(loo).toFixed(2)} max ${Math.max(...loo).toFixed(2)}; |dL| mean ${(100 * mean(looL)).toFixed(2)}% max ${(100 * Math.max(...looL)).toFixed(2)}%`,
  );
}

if (process.argv.includes("--write")) {
  const file = new URL("../src/calc.fourier.generated.ts", import.meta.url);
  writeFileSync(file, generate(cont, tailwind.tailwind));
  console.log("wrote src/calc.fourier.generated.ts");
  // the generated function must agree with the spec it was generated from, at any shade
  const gen = (await import(`${file.href}?t=${Date.now()}`)) as {
    fourierAt: (shade: number, hue: number) => { l: number; c: number; h: number };
  };
  let worst = 0;
  for (let a = 0; a < 360; a += 7) {
    for (let sh = 50; sh <= 950; sh += 25) {
      const q = gen.fourierAt(sh, a);
      const r = evalAt(cont, sh, a);
      worst = Math.max(
        worst,
        Math.abs(q.l - r.l),
        Math.abs(q.c - r.c),
        Math.abs(((q.h - r.h + 540) % 360) - 180) * 1e-3,
      );
    }
  }
  console.log(`generated function vs spec: max difference ${worst.toExponential(1)}`);
}
