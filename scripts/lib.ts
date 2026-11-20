// Helpers shared by the model fitters (fit-fourier.ts, fit-epicycles.ts): a linear solver, Chebyshev
// series in shade, and the pieces of the code generators.

/** Solve A·x = b (Gaussian elimination with partial pivoting). */
export function solve(A: number[][], b: number[]): number[] {
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

// ---- shade as a parameter: Chebyshev series in x = (shade − 500) / 450, over [−1, 1] for 50…950 ------
export const xOf = (shade: number) => (shade - 500) / 450;

/** T₀…T_deg at x. */
export const chebT = (x: number, deg: number) => {
  const T = [1, x];
  for (let m = 2; m <= deg; m++) T.push(2 * x * T[m - 1] - T[m - 2]);
  return T.slice(0, deg + 1);
};

/**
 * Least-squares Chebyshev coefficients (degree `deg`) of a per-shade vector. `ridge` penalizes order m by
 * ridge·m², trading exactness at the shades for smoothness between them.
 */
export function fitCheb(vals: number[], shades: number[], deg: number, ridge = 0): number[] {
  const X = shades.map((sh) => chebT(xOf(sh), deg));
  const m = deg + 1;
  const N = Array.from({ length: m }, (_, a) =>
    Array.from(
      { length: m },
      (_, b) => X.reduce((t, x) => t + x[a] * x[b], 0) + (a === b ? 1e-12 + ridge * a * a : 0),
    ),
  );
  return solve(
    N,
    Array.from({ length: m }, (_, a) => X.reduce((t, x, i) => t + x[a] * vals[i], 0)),
  );
}

/** Evaluate Chebyshev coefficients at a precomputed T vector. */
export const chebEval = (f: number[], T: number[]) => f.reduce((t, q, m) => t + q * T[m], 0);

// ---- code generation ----------------------------------------------------------------------------------
const term = (w: number, v: string) => `${w < 0 ? "-" : "+"} ${Math.abs(w)} * ${v}`;

/** Join expression parts with spaces, wrapped to ~96 columns. */
function wrapJoin(parts: string[], indent: string) {
  const lines: string[] = [];
  let cur = parts[0];
  for (const p of parts.slice(1)) {
    if ((indent + cur + " " + p).length > 96) {
      lines.push(cur);
      cur = p;
    } else cur += " " + p;
  }
  lines.push(cur);
  return lines.join("\n" + indent);
}

/** `first + w * v + …`: zero terms vanish and a zero start is dropped; wrapped to ~96 columns. */
export function sumExpr(first: number, terms: [number, string][], indent: string) {
  const live = terms.filter(([w]) => w !== 0);
  const lead = (w: number, v: string) => (w < 0 ? `-${Math.abs(w)} * ${v}` : `${w} * ${v}`);
  const parts =
    first === 0 && live.length
      ? [lead(live[0][0], live[0][1]), ...live.slice(1).map(([w, v]) => term(w, v))]
      : [String(first), ...live.map(([w, v]) => term(w, v))];
  return wrapJoin(parts, indent);
}

/** `a + b * c + …` over variable names (all coefficients are 1). */
export function sumNames(names: string[], indent: string) {
  return wrapJoin([names[0], ...names.slice(1).map((v) => `+ ${v}`)], indent);
}

/** Names of T₁…T_deg in generated code: x, T2, T3, … */
export const chebNames = (deg: number) => [
  "x",
  ...Array.from({ length: deg - 1 }, (_, m) => `T${m + 2}`),
];

/** The terms of a Chebyshev series after its constant: [q₁, "x"], [q₂, "T2"], … */
export const chebTerms = (f: number[]): [number, string][] => {
  const names = chebNames(f.length - 1);
  return f.slice(1).map((q, m) => [q, names[m]]);
};

/** Generated lines declaring x and T₂…T_deg from `shade`. */
export function chebLines(deg: number): string[] {
  const out = [`  const x = (shade - 500) / 450;`];
  for (let m = 2; m <= deg; m++) {
    out.push(
      `  const T${m} = 2 * x * ${m === 2 ? "x" : `T${m - 1}`} - ${m === 2 ? "1" : m === 3 ? "x" : `T${m - 2}`};`,
    );
  }
  return out;
}

/** Generated lines declaring c_k = cos(k·t) and s_k = sin(k·t) for each harmonic k (t = hue in radians). */
export function trigLines(harmonics: number[]): string[] {
  return harmonics.flatMap((k) => {
    const arg = k === 1 ? "t" : `${k} * t`;
    return [`  const c${k} = Math.cos(${arg});`, `  const s${k} = Math.sin(${arg});`];
  });
}
