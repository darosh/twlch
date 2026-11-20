// Fits the epicycle model in src/models/epicycles.ts to the Tailwind chromatic families.
// Run: node scripts/fit-epicycles.ts [--rL 3] [--rZ 6] [--lam 0.015] [--ridge 0.003] [--search ga|greedy]
//        [--digits 4] [--loo] [--write]
//   --rL, --rZ   number of shade patterns for lightness and for chroma/hue
//   --lam        price per stored number: bigger = fewer circles, more error
//   --ridge      smoothness penalty on circle amplitudes, growing with frequency squared
//   --search     greedy adds the most useful circle one at a time; ga (default) then evolves the set of
//                circles, seeded with the greedy answer
//   --digits     significant digits of the written numbers (default 4); reported errors include the rounding
//   --loo        also report leave-one-hue-out error
//   --write      emit src/models/epicycles.generated.ts
//
// The shade patterns come from an SVD of the 17 families. Which circles carry each pattern around the hue
// wheel is a bitmask over (pattern, frequency 1…8): that structure is all the GA searches, because for a
// given structure the amplitudes and phases are an exact (ridge) least-squares fit.
import { writeFileSync } from "node:fs";
import { tailwind } from "../src/data.ts";
import type { Family } from "../src/data.ts";
import { createTwlch } from "../src/model.ts";
import { epicyclesCurve, epicyclesSize } from "../src/models/epicycles.ts";
import type { EpicyclesPart, EpicyclesSpec } from "../src/models/epicycles.ts";

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

function solve(A: number[][], b: number[]): number[] {
  const m = b.length;
  const T = A.map((r, i) => [...r, b[i]]);
  for (let c = 0; c < m; c++) {
    let p = c;
    for (let r = c + 1; r < m; r++) if (Math.abs(T[r][c]) > Math.abs(T[p][c])) p = r;
    [T[c], T[p]] = [T[p], T[c]];
    const d = T[c][c] || 1e-12;
    for (let r = c + 1; r < m; r++) {
      const f = T[r][c] / d;
      for (let k = c; k <= m; k++) T[r][k] -= f * T[c][k];
    }
  }
  const x = Array.from({ length: m }, () => 0);
  for (let i = m - 1; i >= 0; i--) {
    let s = T[i][m];
    for (let k = i + 1; k < m; k++) s -= T[i][k] * x[k];
    x[i] = s / (T[i][i] || 1e-12);
  }
  return x;
}

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
function rounded(spec: EpicyclesSpec): EpicyclesSpec {
  const part = (p: EpicyclesPart): EpicyclesPart => ({
    mu: p.mu.map(R4),
    comps: p.comps.map((c) => ({ u: c.u.map(R4), h: c.h, w: c.w.map(R4) })),
  });
  return {
    ...spec,
    hues: spec.hues.map((h) => Number(h.toFixed(3))),
    l: part(spec.l),
    z: part(spec.z),
  };
}

/** OKLab distance (x100) of the model at each family's hue, per shade. */
function errors(spec: EpicyclesSpec, test: Family[]) {
  const e: number[] = [];
  const dl: number[] = [];
  for (const f of test) {
    const m = epicyclesCurve(spec, anchor(f));
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
  const { e } = errors(spec, TS.unique);
  return Math.max(...e) + 3 * mean(e) + LAM * epicyclesSize(spec);
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
const spec = rounded(exact);
console.log(
  `rL=${RL} rZ=${RZ} lam=${LAM} search=${SEARCH} digits=${DIGITS}: ${epicyclesSize(spec)} numbers (${(Date.now() - t0) / 1000}s)`,
);
console.log(
  `circles lightness: ${S.SL.map((x) => x.join(",") || "-").join(" | ")}; chroma/hue: ${S.SZ.map((x) => x.join(",") || "-").join(" | ")}`,
);
const { e, dl } = errors(spec, ALL);
const endL = [0, 1, n - 2, n - 1].map((i) => 100 * Math.max(...ALL.map((_, k) => dl[k * n + i])));
console.log(
  `at the 17 Tailwind hues: dE mean ${mean(e).toFixed(2)} max ${Math.max(...e).toFixed(2)}; |dL|% at 50/100/900/950: ${endL.map((x) => x.toFixed(2)).join(" ")}`,
);
const between = errors(spec, TS.dense).e;
console.log(
  `vs interpolation every ${STEP}° of hue: dE mean ${mean(between).toFixed(2)} max ${Math.max(...between).toFixed(2)}`,
);

if (process.argv.includes("--loo")) {
  const loo: number[] = [];
  for (const f of ALL) {
    const rest = trainingSet(ALL.filter((x) => x !== f));
    const m = fit(rest.train, S, rest.hues);
    loo.push(...errors(m, [f]).e);
  }
  console.log(
    `leave-one-hue-out dE: mean ${mean(loo).toFixed(2)} max ${Math.max(...loo).toFixed(2)}`,
  );
}

if (process.argv.includes("--write")) {
  const src = `// Generated by scripts/fit-epicycles.ts against Tailwind ${tailwind.tailwind}. Do not edit.
import type { EpicyclesSpec } from "./epicycles.ts";

export const epicycles: EpicyclesSpec = ${JSON.stringify(spec)};
`;
  writeFileSync(new URL("../src/models/epicycles.generated.ts", import.meta.url), src);
  console.log("wrote src/models/epicycles.generated.ts");
}
