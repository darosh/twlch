// Leave-one-out validation: rebuild each Tailwind family from the others, given one of its colours.
// Run: node scripts/loo.ts
import Color from "colorjs.io";
import { tailwind } from "../src/data.ts";
import type { Family } from "../src/data.ts";
import { createTwlch } from "../src/scale.ts";

type Lch = [number, number, number];
const mapped = (l: number, c: number, h: number): Lch =>
  new Color("oklch", [l, c, h]).toGamut({ space: "srgb" }).to("oklch").coords as Lch;
const de = (p: Lch, q: Lch) => {
  const r = Math.PI / 180;
  const [a1, b1] = [p[1] * Math.cos((p[2] || 0) * r), p[1] * Math.sin((p[2] || 0) * r)];
  const [a2, b2] = [q[1] * Math.cos((q[2] || 0) * r), q[1] * Math.sin((q[2] || 0) * r)];
  return 100 * Math.hypot(p[0] - q[0], a1 - a2, b1 - b2);
};

/** Fixed-curve baseline (colorizr-style): mean L per shade, mean chroma shape, constant hue. */
function baseline(rest: Family[], input: Lch, k: number): Lch[] {
  const n = tailwind.shades.length;
  const meanL = Array.from(
    { length: n },
    (_, i) => rest.reduce((s, f) => s + f.l[i], 0) / rest.length,
  );
  const meanC = Array.from(
    { length: n },
    (_, i) => rest.reduce((s, f) => s + f.c[i], 0) / rest.length,
  );
  const ratio = input[1] / meanC[k];
  return meanL.map((l, i) =>
    mapped(l + (i === k ? input[0] - meanL[k] : 0), meanC[i] * ratio, input[2]),
  );
}

const pad = (s: string | number, w = 8) => String(s).padEnd(w);
const f2 = (x: number) => x.toFixed(2);

for (const set of ["chromatic", "neutral"] as const) {
  const fams = tailwind[set];
  console.log(
    `\n== ${set} (${fams.length} families), dE = OKLab distance x100, anchor shade excluded ==`,
  );
  for (const k of [2, 5, 8]) {
    const rows: { name: string; twlch: number; snapd: number; base: number }[] = [];
    for (const f of fams) {
      const rest = fams.filter((g) => g !== f);
      const model = createTwlch(rest);
      const input: Lch = [f.l[k], f.c[k], f.h[k]];
      const truth = f.l.map((_, i) => mapped(f.l[i], f.c[i], f.h[i]));
      const css = new Color("oklch", input);
      const run = (opts: Parameters<typeof model.run>[1]) =>
        model.run(
          { l: input[0], c: input[1], h: input[2] },
          { ...opts, shade: tailwind.shades[k] },
        );
      void css;
      const m = run({ mode: "match" });
      const sn = run({ mode: "snap" });
      const snd = run({ mode: "snap", delta: m.matchDelta });
      void sn;
      const base = baseline(rest, input, k);
      const err = (sw: Lch[]) => {
        let s = 0;
        let c = 0;
        sw.forEach((p, i) => {
          if (i === k) return;
          s += de(p, truth[i]);
          c++;
        });
        return s / c;
      };
      rows.push({
        name: f.name,
        twlch: err(m.swatches.map((s) => [s.l, s.c, s.h])),
        snapd: err(snd.swatches.map((s) => [s.l, s.c, s.h])),
        base: err(base),
      });
    }
    const avg = (key: "twlch" | "snapd" | "base") =>
      rows.reduce((s, r) => s + r[key], 0) / rows.length;
    const worst = [...rows].sort((a, b) => b.twlch - a.twlch)[0];
    console.log(
      `input @${tailwind.shades[k]}: ${pad("twlch(match)")}${f2(avg("twlch"))}  ${pad("snap+delta")}${f2(avg("snapd"))}  ${pad("fixed-curve")}${f2(avg("base"))}   worst twlch: ${worst.name} ${f2(worst.twlch)}`,
    );
  }
}
