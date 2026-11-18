import Color from "colorjs.io";
import type { Family } from "twlch";
import { niceMax, oklchToHex } from "./color.ts";

export type SpaceId = "oklch" | "lch" | "hct" | "jzczhz";

export type SpaceInfo = {
  id: SpaceId;
  label: string;
  /** Index of lightness / chroma / hue in colorjs.io's coords for this space. */
  idx: { l: number; c: number; h: number };
  /** Panel titles and short axis names. */
  titles: { l: string; c: string; h: string };
  short: { l: string; c: string; h: string };
  /** Axis maximum for lightness (sRGB white, rounded up to a nice number). */
  lMax: number;
};

const white = (id: SpaceId, idx: number) => new Color("white").to(id).coords[idx] ?? 1;

function make(info: Omit<SpaceInfo, "lMax">): SpaceInfo {
  return { ...info, lMax: niceMax(white(info.id, info.idx.l)) };
}

export const SPACES: Record<SpaceId, SpaceInfo> = {
  oklch: make({
    id: "oklch",
    label: "OKLCH",
    idx: { l: 0, c: 1, h: 2 },
    titles: { l: "L (lightness)", c: "C (chroma)", h: "H (hue °)" },
    short: { l: "L", c: "C", h: "H" },
  }),
  lch: make({
    id: "lch",
    label: "CIE LCH (D50)",
    idx: { l: 0, c: 1, h: 2 },
    titles: { l: "L* (lightness)", c: "C* (chroma)", h: "h (hue °)" },
    short: { l: "L*", c: "C*", h: "h" },
  }),
  hct: make({
    id: "hct",
    label: "HCT (CAM16 + L*)",
    idx: { l: 2, c: 1, h: 0 },
    titles: { l: "T (tone, L*)", c: "C (CAM16 chroma)", h: "H (CAM16 hue °)" },
    short: { l: "T", c: "C", h: "H" },
  }),
  jzczhz: make({
    id: "jzczhz",
    label: "JzCzhz",
    idx: { l: 0, c: 1, h: 2 },
    titles: { l: "Jz (lightness)", c: "Cz (chroma)", h: "hz (hue °)" },
    short: { l: "Jz", c: "Cz", h: "hz" },
  }),
};

export type PlotFamily = Family & { hex: number[] };

/** Replace undefined hues (achromatic) by the nearest defined hue in the same family. */
function fillHue(h: number[]): number[] {
  const defined = h.map((v, i) => (Number.isNaN(v) ? -1 : i)).filter((i) => i >= 0);
  if (!defined.length) return h.map(() => 0);
  return h.map((v, i) =>
    Number.isNaN(v) ? h[defined.reduce((a, b) => (Math.abs(b - i) < Math.abs(a - i) ? b : a))] : v,
  );
}

/** Tailwind's OKLCH families re-expressed in another lightness/chroma/hue space, plus each colour's display hex. */
export function convertFamilies(fams: Family[], space: SpaceInfo): PlotFamily[] {
  return fams.map((f) => {
    const l: number[] = [];
    const c: number[] = [];
    const h: number[] = [];
    const hex: number[] = [];
    f.l.forEach((_, i) => {
      hex.push(oklchToHex(f.l[i], f.c[i], f.h[i]));
      if (space.id === "oklch") {
        l.push(f.l[i]);
        c.push(f.c[i]);
        h.push(f.h[i]);
        return;
      }
      const co = new Color("oklch", [f.l[i], f.c[i], f.h[i]]).to(space.id).coords;
      l.push(co[space.idx.l] ?? 0);
      c.push(co[space.idx.c] ?? 0);
      h.push(co[space.idx.h] ?? NaN);
    });
    return { name: f.name, l, c, h: fillHue(h), hex };
  });
}

export type GapStats = { cv: number; max: number; min: number };

/** Spread of hue gaps between neighbouring families at one shade. cv = std/mean of the gaps; lower = more evenly spaced. */
export function hueGaps(fams: Family[], shade: number): GapStats {
  const hs = fams.map((f) => ((f.h[shade] % 360) + 360) % 360).sort((a, b) => a - b);
  const gaps = hs.map((h, i) => (i === hs.length - 1 ? hs[0] + 360 - h : hs[i + 1] - h));
  const mean = gaps.reduce((a, b) => a + b, 0) / gaps.length;
  const sd = Math.sqrt(gaps.reduce((a, b) => a + (b - mean) ** 2, 0) / gaps.length);
  return { cv: sd / mean, max: Math.max(...gaps), min: Math.min(...gaps) };
}
