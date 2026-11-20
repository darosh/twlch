// Fits the epicycle model to the Tailwind chromatic families and writes it as a plain function.
// Run: node scripts/fit-epicycles.ts [--rL 3] [--rZ 6] [--lam 0.015] [--ridge 0.003] [--search ga|greedy]
//        [--digits 4] [--loo] [--write]
//   --rL, --rZ   number of shade patterns for lightness and for chroma/hue
//   --lam        price per stored number: bigger = fewer circles, more error
//   --ridge      smoothness penalty on circle amplitudes, growing with frequency squared
//   --search     greedy adds the most useful circle one at a time; ga (default) then evolves the set of
//                circles, seeded with the greedy answer
//   --digits     significant digits of the written numbers (default 4); reported errors include the rounding
//   --loo        also report leave-one-hue-out error
//   --write      emit src/calc.epicycles.generated.ts: plain code, the sums of cos/sin unrolled, no data
//
// The shade patterns come from an SVD of the 17 families. Which circles carry each pattern around the hue
// wheel is a bitmask over (pattern, frequency 1…8): that structure is all the GA searches, because for a
// given structure the amplitudes and phases are an exact (ridge) least-squares fit.
import { writeFileSync } from "node:fs";
import { tailwind } from "../src/data.ts";
import type { Family } from "../src/data.ts";
import { createTwlch } from "../src/model.ts";
import { pchipXY } from "../src/pchip.ts";
import {
  chebEval,
  chebLines,
  chebT,
  chebTerms,
  fitCheb,
  solve,
  sumExpr,
  trigLines,
  xOf,
} from "./lib.ts";

// ---- the model: shade patterns carried around the hue wheel by circles -------------------------------
//   value(shade, hue) = mean(shade) + Σ_k pattern_k(shade) · circles_k(hue)
//   circles_k(hue)    = w₀ + Σ_j a_j cos(h_j·hue) + b_j sin(h_j·hue)      (h_j whole numbers: closes at 360°)
// Lightness is one such surface; chroma and hue are one complex surface z = c·e^{i(h − hue)}, stored as n
// real parts then n imaginary parts, which factors the hue wheel itself out.
interface EpicyclesPart {
  mu: number[];
  comps: { u: number[]; h: number[]; w: number[] }[];
}
interface EpicyclesSpec {
  n: number;
  hues: number[];
  l: EpicyclesPart;
  z: EpicyclesPart;
}
const evalPart = (part: EpicyclesPart, a: number): number[] => {
  const out = part.mu.slice();
  for (const { u, h, w } of part.comps) {
    let s = w[0];
    for (let j = 0; j < h.length; j++) {
      s +=
        w[2 * j + 1] * Math.cos(h[j] * a * (Math.PI / 180)) +
        w[2 * j + 2] * Math.sin(h[j] * a * (Math.PI / 180));
    }
    for (let i = 0; i < out.length; i++) out[i] += s * u[i];
  }
  return out;
};
/** The scale at hue `a` (degrees), one entry per shade. */
function evalSpec(spec: EpicyclesSpec, a: number) {
  const L = evalPart(spec.l, a);
  const Z = evalPart(spec.z, a);
  return Array.from({ length: spec.n }, (_, i) => {
    const h = a + Math.atan2(Z[spec.n + i], Z[i]) / (Math.PI / 180);
    return { l: L[i], c: Math.hypot(Z[i], Z[spec.n + i]), h: ((h % 360) + 360) % 360 };
  });
}
/** Numbers stored: what the size penalty prices. */
const sizeOf = (spec: EpicyclesSpec) => {
  const part = (p: EpicyclesPart) =>
    p.mu.length + p.comps.reduce((s, c) => s + c.u.length + c.h.length + c.w.length, 0);
  return part(spec.l) + part(spec.z) + spec.hues.length;
};

// ---- code generation: plain sums of cos/sin, no loops, no data ---------------------------------------
// ---- shade as a parameter: every shade pattern and mean becomes a Chebyshev series in shade -----------
// x = (shade − 500) / 450 runs over [−1, 1] for shades 50…950; T_m are Chebyshev polynomials.
const SHADES = tailwind.shades;
interface ContPart {
  /** One series per output (lightness: 1; chroma/hue: real part, imaginary part). */
  mu: number[][];
  comps: { u: number[][]; h: number[]; w: number[] }[];
}
interface ContSpec {
  hues: number[];
  l: ContPart;
  z: ContPart;
}
function toContinuous(spec: EpicyclesSpec, deg: number): ContSpec {
  const split = (v: number[], k: number) =>
    Array.from({ length: k }, (_, q) => fitCheb(v.slice(q * n, (q + 1) * n), SHADES, deg));
  const part = (p: EpicyclesPart, k: number): ContPart => ({
    mu: split(p.mu, k),
    comps: p.comps.map((c) => ({ u: split(c.u, k), h: c.h, w: c.w })),
  });
  return { hues: spec.hues, l: part(spec.l, 1), z: part(spec.z, 2) };
}
const roundCont = (c: ContSpec): ContSpec => {
  const part = (p: ContPart): ContPart => ({
    mu: p.mu.map((f) => f.map(R4)),
    comps: p.comps.map((k) => ({ u: k.u.map((f) => f.map(R4)), h: k.h, w: k.w.map(R4) })),
  });
  return { hues: c.hues.map((h) => Number(h.toFixed(3))), l: part(c.l), z: part(c.z) };
};
const contSize = (c: ContSpec) => {
  const part = (p: ContPart) =>
    p.mu.reduce((t, f) => t + f.length, 0) +
    p.comps.reduce(
      (t, k) => t + k.u.reduce((q, f) => q + f.length, 0) + k.h.length + k.w.length,
      0,
    );
  return part(c.l) + part(c.z) + c.hues.length;
};
/** The colour at an arbitrary shade (50…950) and hue. */
function evalAt(c: ContSpec, shade: number, a: number) {
  const T = chebT(xOf(shade), DEG);
  const fn = (f: number[]) => chebEval(f, T);
  const circles = (k: { h: number[]; w: number[] }) => {
    let v = k.w[0];
    for (let j = 0; j < k.h.length; j++) {
      v += k.w[2 * j + 1] * Math.cos(k.h[j] * a * R) + k.w[2 * j + 2] * Math.sin(k.h[j] * a * R);
    }
    return v;
  };
  const out = (p: ContPart, q: number) =>
    fn(p.mu[q]) + p.comps.reduce((t, k) => t + fn(k.u[q]) * circles(k), 0);
  const x = out(c.z, 0);
  const y = out(c.z, 1);
  const h = a + Math.atan2(y, x) / R;
  return { l: out(c.l, 0), c: Math.hypot(x, y), h: ((h % 360) + 360) % 360 };
}

function generate(c: ContSpec, version: string): string {
  const harmonics = [...new Set([...c.l.comps, ...c.z.comps].flatMap((k) => k.h))].sort(
    (a, b) => a - b,
  );
  const out: string[] = [];
  out.push(`// Generated by scripts/fit-epicycles.ts against Tailwind ${version}. Do not edit.`);
  out.push(
    `// A few shade patterns, each carried around the hue wheel by a handful of rotating circles`,
  );
  out.push(
    `// (epicycles): sums of cos/sin of whole turns of hue. Each pattern is itself a smooth function of`,
  );
  out.push(
    `// shade (a Chebyshev sum), so shade is a real parameter. Lightness is one surface; chroma and hue`,
  );
  out.push(`// are one complex surface c·e^{i(h − hue)}, so the hue wheel itself is factored out.`);
  out.push(`import { chromaticHues, shades } from "./data.generated.ts";`);
  out.push(``);
  out.push(`const R = Math.PI / 180;`);
  out.push(``);
  out.push(`/** Shade-500 hues of the Tailwind families it was fitted to, sorted. */`);
  out.push(`export const epicyclesHues: number[] = chromaticHues;`);
  out.push(``);
  out.push(`/** The colour (OKLCH) at a shade from 50 to 950 and a hue in degrees. */`);
  out.push(
    `export function epicyclesAt(shade: number, hue: number): { l: number; c: number; h: number } {`,
  );
  out.push(...chebLines(DEG));
  out.push(`  const t = hue * R;`);
  out.push(...trigLines(harmonics));
  const parts: [string, string[], ContPart][] = [
    ["l", ["l"], c.l],
    ["z", ["x", "y"], c.z],
  ];
  for (const [name, outs, part] of parts) {
    out.push(``);
    out.push(
      `  // ${name === "l" ? "lightness" : "chroma and hue"}: one value per pattern, the circles summed`,
    );
    part.comps.forEach((k, ki) => {
      const terms: [number, string][] = [];
      k.h.forEach((h, j) => terms.push([k.w[2 * j + 1], `c${h}`], [k.w[2 * j + 2], `s${h}`]));
      out.push(`  const ${name}${ki} = ${sumExpr(k.w[0], terms, "    ")};`);
    });
    out.push(`  // ... and the shade functions that carry them`);
    outs.forEach((o, q) => {
      out.push(`  const ${o}m = ${sumExpr(part.mu[q][0], chebTerms(part.mu[q]), "    ")};`);
      part.comps.forEach((k, ki) =>
        out.push(`  const ${o}u${ki} = ${sumExpr(k.u[q][0], chebTerms(k.u[q]), "    ")};`),
      );
    });
  }
  const sumOf = (o: string, name: string, part: ContPart) =>
    `${o}m${part.comps.map((_, ki) => ` + ${o}u${ki} * ${name}${ki}`).join("")}`;
  out.push(``);
  out.push(`  const X = ${sumOf("x", "z", c.z)};`);
  out.push(`  const Y = ${sumOf("y", "z", c.z)};`);
  out.push(`  const h = hue + Math.atan2(Y, X) / R;`);
  out.push(
    `  return { l: ${sumOf("l", "l", c.l)}, c: Math.hypot(X, Y), h: ((h % 360) + 360) % 360 };`,
  );
  out.push(`}`);
  out.push(``);
  out.push(`/** The scale at hue \`a\`: the 11 Tailwind shades 50, 100, 200 … 900, 950. */`);
  out.push(`export function epicyclesCurve(a: number): { l: number; c: number; h: number }[] {`);
  out.push(`  return shades.map((shade) => epicyclesAt(shade, a));`);
  out.push(`}`);
  return out.join("\n") + "\n";
}

const arg = (name: string, d: number) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? Number(process.argv[i + 1]) : d;
};
const sarg = (name: string, d: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : d;
};
const RL = arg("rL", 3);
const RZ = arg("rZ", 6);
const LAM = arg("lam", 0.015);
const RIDGE = arg("ridge", 0.003);
const DIGITS = arg("digits", 4);
const SEARCH = sarg("search", "ga");
const DEG = arg("shadeDeg", 8);
const KMAX = 8;
const R = Math.PI / 180;
const n = tailwind.shades.length;
const MID = Math.floor(n / 2);
const ALL = tailwind.chromatic;
const STEP = arg("step", 3);
const AW = arg("anchorWeight", 3);

/**
 * What the model is fitted to and scored on: the interpolated palette on a dense hue grid (so it cannot
 * wander between the Tailwind hues), with the real families counted AW times.
 */
function trainingSet(fams: Family[]) {
  const model = createTwlch(fams, "smooth");
  const dense: Family[] = [];
  for (let a = 0; a < 360; a += STEP) {
    const c = model.curve(a);
    dense.push({
      name: `h${a}`,
      l: c.map((s) => s.l),
      c: c.map((s) => s.c),
      h: c.map((s) => s.h),
    });
  }
  const unique = [...fams, ...dense];
  const train = [...unique, ...Array.from({ length: AW - 1 }, () => fams).flat()];
  return { train, unique, dense, hues: fams.map(anchor).sort((a, b) => a - b) };
}
const anchor = (f: Family) => f.h[MID];
const mean = (x: number[]) => x.reduce((s, v) => s + v, 0) / x.length;

/** Eigenvectors of a symmetric matrix (Jacobi), sorted by decreasing eigenvalue. */
function eigenvectors(S: number[][]): number[][] {
  const m = S.length;
  const A = S.map((r) => [...r]);
  const V = Array.from({ length: m }, (_, i) => Array.from({ length: m }, (_, j) => +(i === j)));
  for (let sweep = 0; sweep < 60; sweep++) {
    let off = 0;
    for (let p = 0; p < m; p++) for (let q = p + 1; q < m; q++) off += A[p][q] ** 2;
    if (off < 1e-22) break;
    for (let p = 0; p < m; p++) {
      for (let q = p + 1; q < m; q++) {
        if (Math.abs(A[p][q]) < 1e-16) continue;
        const th = (A[q][q] - A[p][p]) / (2 * A[p][q]);
        const t = Math.sign(th || 1) / (Math.abs(th) + Math.sqrt(th * th + 1));
        const c = 1 / Math.sqrt(t * t + 1);
        const s = t * c;
        for (let k = 0; k < m; k++) {
          const a = A[k][p];
          const b = A[k][q];
          A[k][p] = c * a - s * b;
          A[k][q] = s * a + c * b;
        }
        for (let k = 0; k < m; k++) {
          const a = A[p][k];
          const b = A[q][k];
          A[p][k] = c * a - s * b;
          A[q][k] = s * a + c * b;
        }
        for (let k = 0; k < m; k++) {
          const a = V[k][p];
          const b = V[k][q];
          V[k][p] = c * a - s * b;
          V[k][q] = s * a + c * b;
        }
      }
    }
  }
  const idx = A.map((_, i) => i).sort((a, b) => A[b][b] - A[a][a]);
  return idx.map((i) => V.map((r) => r[i]));
}

// ---- data matrices: lightness, and chroma/hue as a complex offset from the anchor hue ----------------
const rowL = (f: Family) => f.l.slice();
const rowZ = (f: Family) => {
  const a = anchor(f);
  return [
    ...f.c.map((c, i) => c * Math.cos((f.h[i] - a) * R)),
    ...f.c.map((c, i) => c * Math.sin((f.h[i] - a) * R)),
  ];
};

interface Basis {
  mu: number[];
  U: number[][];
  scores: number[][];
}
function svdBasis(rows: number[][], r: number): Basis {
  const cols = rows[0].length;
  const mu = Array.from({ length: cols }, (_, j) => mean(rows.map((x) => x[j])));
  const Z = rows.map((x) => x.map((v, j) => v - mu[j]));
  const G = Array.from({ length: cols }, (_, a) =>
    Array.from({ length: cols }, (_, b) => Z.reduce((s, x) => s + x[a] * x[b], 0)),
  );
  const U = eigenvectors(G).slice(0, r);
  return { mu, U, scores: Z.map((x) => U.map((u) => x.reduce((s, v, j) => s + v * u[j], 0))) };
}

const design = (al: number, S: number[]) => {
  const v = [1];
  for (const j of S) v.push(Math.cos(j * al * R), Math.sin(j * al * R));
  return v;
};

/** Per pattern, the circle amplitudes: ridge least squares of the pattern's scores over hue. */
function fitScores(train: Family[], B: Basis, S: number[][]): number[][] {
  return B.U.map((_, k) => {
    const X = train.map((f) => design(anchor(f), S[k]));
    const m = X[0].length;
    const N = Array.from({ length: m }, (_, a) =>
      Array.from({ length: m }, (_, b) => {
        const pen = a === b ? 1e-9 + (a > 0 ? RIDGE * S[k][Math.floor((a - 1) / 2)] ** 2 : 0) : 0;
        return X.reduce((s, x) => s + x[a] * x[b], 0) + pen;
      }),
    );
    return solve(
      N,
      Array.from({ length: m }, (_, a) => X.reduce((s, x, i) => s + x[a] * B.scores[i][k], 0)),
    );
  });
}

/** A circle structure: for each pattern of lightness and of chroma/hue, its frequencies. */
interface Structure {
  SL: number[][];
  SZ: number[][];
}
const bitsToStructure = (bits: boolean[]): Structure => {
  let p = 0;
  const make = (r: number) =>
    Array.from({ length: r }, () => {
      const s: number[] = [];
      for (let j = 1; j <= KMAX; j++) if (bits[p++]) s.push(j);
      return s;
    });
  return { SL: make(RL), SZ: make(RZ) };
};

/** Fit everything for a structure; folds patterns without circles into the mean. */
function fit(train: Family[], S: Structure, hues: number[]): EpicyclesSpec {
  const part = (rows: number[][], r: number, Sk: number[][]): EpicyclesPart => {
    const B = svdBasis(rows, r);
    const W = fitScores(train, B, Sk);
    const mu = B.mu.slice();
    const comps: EpicyclesPart["comps"] = [];
    B.U.forEach((u, k) => {
      if (Sk[k].length === 0) {
        for (let j = 0; j < mu.length; j++) mu[j] += W[k][0] * u[j];
      } else {
        comps.push({ u, h: Sk[k], w: W[k] });
      }
    });
    return { mu, comps };
  };
  return {
    n,
    hues,
    l: part(train.map(rowL), RL, S.SL),
    z: part(train.map(rowZ), RZ, S.SZ),
  };
}

const R4 = (x: number) => Number(x.toPrecision(DIGITS));
/** OKLab distance (x100) of the model at each family's hue, per shade. */
function errors(curve: (a: number) => { l: number; c: number; h: number }[], test: Family[]) {
  const e: number[] = [];
  const dl: number[] = [];
  for (const f of test) {
    const m = curve(anchor(f));
    m.forEach((s, i) => {
      const a = [s.l, s.c * Math.cos(s.h * R), s.c * Math.sin(s.h * R)];
      const b = [f.l[i], f.c[i] * Math.cos(f.h[i] * R), f.c[i] * Math.sin(f.h[i] * R)];
      e.push(100 * Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]));
      dl.push(Math.abs(s.l - f.l[i]));
    });
  }
  return { e, dl };
}

const TS = trainingSet(ALL);

// ---- search over the circle structure ----------------------------------------------------------------
const NBITS = (RL + RZ) * KMAX;
function fitness(bits: boolean[]) {
  const S = bitsToStructure(bits);
  const spec = fit(TS.train, S, TS.hues);
  const { e } = errors((a) => evalSpec(spec, a), TS.unique);
  return Math.max(...e) + 3 * mean(e) + LAM * sizeOf(spec);
}

function greedy(): boolean[] {
  // add one circle at a time, walking the whole path (the score can rise before it falls again)
  let bits = Array.from({ length: NBITS }, () => false);
  let best = { bits, score: fitness(bits) };
  for (let step = 0; step < NBITS; step++) {
    let pick = -1;
    let score = Infinity;
    for (let i = 0; i < NBITS; i++) {
      if (bits[i]) continue;
      const b = bits.slice();
      b[i] = true;
      const f = fitness(b);
      if (f < score) {
        score = f;
        pick = i;
      }
    }
    bits = bits.slice();
    bits[pick] = true;
    if (score < best.score) best = { bits, score };
  }
  return best.bits;
}

function genetic(seed: boolean[], gens = 120, popN = 60): boolean[] {
  let s = 12345;
  const rnd = () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
  const mutate = (b: boolean[], rate: number) => b.map((v) => (rnd() < rate ? !v : v));
  let pop = [seed, ...Array.from({ length: popN - 1 }, () => mutate(seed, 3 / NBITS))];
  let sc = pop.map(fitness);
  for (let g = 0; g < gens; g++) {
    const next = [pop[sc.indexOf(Math.min(...sc))]];
    const tour = () => {
      let b = Math.floor(rnd() * popN);
      for (let k = 0; k < 2; k++) {
        const c = Math.floor(rnd() * popN);
        if (sc[c] < sc[b]) b = c;
      }
      return pop[b];
    };
    while (next.length < popN) {
      const a = tour();
      const b = tour();
      next.push(
        mutate(
          a.map((v, i) => (rnd() < 0.5 ? v : b[i])),
          1.5 / NBITS,
        ),
      );
    }
    pop = next;
    sc = pop.map(fitness);
  }
  return pop[sc.indexOf(Math.min(...sc))];
}

const t0 = Date.now();
const g = greedy();
const bits = SEARCH === "ga" ? genetic(g) : g;
const S = bitsToStructure(bits);
const exact = fit(TS.train, S, TS.hues);
const spec = roundCont(toContinuous(exact, DEG));
const curve = (a: number) => SHADES.map((sh) => evalAt(spec, sh, a));
console.log(
  `rL=${RL} rZ=${RZ} lam=${LAM} search=${SEARCH} shadeDeg=${DEG} digits=${DIGITS}: ${contSize(spec)} numbers (${(Date.now() - t0) / 1000}s)`,
);
console.log(
  `circles lightness: ${S.SL.map((x) => x.join(",") || "-").join(" | ")}; chroma/hue: ${S.SZ.map((x) => x.join(",") || "-").join(" | ")}`,
);
const { e, dl } = errors(curve, ALL);
const endL = [0, 1, n - 2, n - 1].map((i) => 100 * Math.max(...ALL.map((_, k) => dl[k * n + i])));
console.log(
  `at the 17 Tailwind hues, 11 shades: dE mean ${mean(e).toFixed(2)} max ${Math.max(...e).toFixed(2)}; |dL|% at 50/100/900/950: ${endL.map((x) => x.toFixed(2)).join(" ")}`,
);
const between = errors(curve, TS.dense).e;
console.log(
  `vs interpolation every ${STEP}° of hue: dE mean ${mean(between).toFixed(2)} max ${Math.max(...between).toFixed(2)}`,
);
{
  // between the 11 shades: how far the continuous function strays from PCHIP through its own 11 values
  const lab = (p: { l: number; c: number; h: number }) => [
    p.l,
    p.c * Math.cos(p.h * R),
    p.c * Math.sin(p.h * R),
  ];
  const mids = SHADES.slice(1).map((v, i) => (v + SHADES[i]) / 2);
  const dev: number[] = [];
  for (let a = 0; a < 360; a += 10) {
    const vals = SHADES.map((sh) => lab(evalAt(spec, sh, a)));
    const f = [0, 1, 2].map((q) =>
      pchipXY(
        SHADES,
        vals.map((v) => v[q]),
      ),
    );
    for (const sh of mids) {
      const p = lab(evalAt(spec, sh, a));
      dev.push(100 * Math.hypot(...[0, 1, 2].map((q) => p[q] - f[q](sh))));
    }
  }
  console.log(
    `between shades vs PCHIP of its own 11 values: dE mean ${mean(dev).toFixed(2)} max ${Math.max(...dev).toFixed(2)}`,
  );
}

if (process.argv.includes("--loo")) {
  const loo: number[] = [];
  for (const f of ALL) {
    const rest = trainingSet(ALL.filter((x) => x !== f));
    const m = fit(rest.train, S, rest.hues);
    loo.push(...errors((a) => evalSpec(m, a), [f]).e);
  }
  console.log(
    `leave-one-hue-out dE: mean ${mean(loo).toFixed(2)} max ${Math.max(...loo).toFixed(2)}`,
  );
}

if (process.argv.includes("--write")) {
  const file = new URL("../src/calc.epicycles.generated.ts", import.meta.url);
  writeFileSync(file, generate(spec, tailwind.tailwind));
  console.log("wrote src/calc.epicycles.generated.ts");
  // the generated function must agree with the spec it was generated from, at any shade
  const gen = (await import(`${file.href}?t=${Date.now()}`)) as {
    epicyclesAt: (shade: number, hue: number) => { l: number; c: number; h: number };
  };
  let worst = 0;
  for (let a = 0; a < 360; a += 7) {
    for (let sh = 50; sh <= 950; sh += 25) {
      const p = gen.epicyclesAt(sh, a);
      const q = evalAt(spec, sh, a);
      worst = Math.max(
        worst,
        Math.abs(p.l - q.l),
        Math.abs(p.c - q.c),
        Math.abs(((p.h - q.h + 540) % 360) - 180) * 1e-3,
      );
    }
  }
  console.log(`generated function vs spec: max difference ${worst.toExponential(1)}`);
}
