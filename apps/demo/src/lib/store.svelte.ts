import Color from "colorjs.io";
import { tailwind } from "@darosh/twlch";
import type { Family } from "@darosh/twlch";
import { epicyclesAt, fourierAt, twlch, twlchAnchors, twlchHue } from "@darosh/twlch";
import type { DatasetName, Generator, Interpolation, TwlchResult } from "@darosh/twlch";
import { colorName, uniqueName } from "./custom.ts";
import { oklchToHex } from "./color.ts";
import { SPACES, convertFamilies } from "./spaces.ts";
import type { PlotFamily, SpaceId } from "./spaces.ts";

/** Datasets in the UI. "fourier" and "epicycles" are dummy ones: the chromatic scales computed by a fitted model. */
export type Dataset = DatasetName | Generator;
export const DATASETS: Dataset[] = ["chromatic", "neutral", "fourier", "epicycles"];
/** The library's dataset and (optional) generator behind a UI dataset. */
export const libDataset = (d: Dataset): { dataset: DatasetName; generator?: Generator } =>
  d === "fourier" || d === "epicycles" ? { dataset: "chromatic", generator: d } : { dataset: d };
/** Custom scales are shared by the chromatic and computed datasets; neutral keeps its own. */
const poolOf = (d: Dataset) => (d === "neutral" ? "neutral" : "chromatic");
/** Library options that select a dataset. */
const datasetOpts = (d: Dataset) => {
  const { dataset, generator } = libDataset(d);
  return generator === "fourier"
    ? { dataset, fourier: true }
    : generator === "epicycles"
      ? { dataset, epicycles: true }
      : { dataset };
};

type DefBase = { dataset: Dataset; interpolation: Interpolation };
export type CustomDef = DefBase &
  (
    | {
        id: string;
        kind: "color";
        name: string;
        autoName: boolean;
        color: string;
        mode: "snap" | "match";
        delta: number;
        shade: number | null;
      }
    | {
        id: string;
        kind: "hue";
        name: string;
        autoName: boolean;
        hue: number;
        delta: number;
        bulk: boolean;
      }
  );

/** A CustomDef without its id (distributes over the union). */
export type CustomSpec = CustomDef extends infer D
  ? D extends unknown
    ? Omit<D, "id">
    : never
  : never;
export type ScaleFilter = "all" | "factory" | "custom";
export const FILTERS: ScaleFilter[] = ["all", "factory", "custom"];

export type SharedState = {
  dataset: Dataset;
  filter: ScaleFilter;
  copyFormat: "hex" | "oklch";
  space: SpaceId;
  custom: CustomSpec[];
};

export type Scale = {
  id: string;
  name: string;
  kind: "tailwind" | "color" | "hue";
  family: Family;
  /** #rrggbb per shade */
  hex: string[];
  /** Shade-500 hue, used for sorting. */
  hue: number;
  result?: TwlchResult;
  /**
   * The scale read straight from the model's function at 12 points per shade step, for the smooth plot
   * lines (instead of PCHIP through the 11 shades). Only for scales that are exactly the function.
   */
  dense?: Family;
};

const DENSE = 12; // points per shade step, as the plots resample
/** A scale of a computed set at `hue`, sampled between the shades from the model's own function. */
function denseAt(generator: Generator, hue: number, name: string): Family {
  const at = generator === "fourier" ? fourierAt : epicyclesAt;
  const shades = tailwind.shades;
  const l: number[] = [];
  const c: number[] = [];
  const h: number[] = [];
  for (let k = 0; k <= (shades.length - 1) * DENSE; k++) {
    const pos = k / DENSE;
    const lo = Math.min(Math.floor(pos), shades.length - 2);
    const s = at(shades[lo] + (pos - lo) * (shades[lo + 1] - shades[lo]), hue);
    l.push(s.l);
    c.push(s.c);
    h.push(s.h);
  }
  return { name, l, c, h };
}

const hexOf = (n: number) => "#" + n.toString(16).padStart(6, "0");
let counter = 0;
const nextId = () => `c${++counter}`;

function fromResult(def: CustomDef, r: TwlchResult, dataset: Dataset): Scale {
  const { generator } = libDataset(dataset);
  const family: Family = {
    name: def.name,
    l: r.swatches.map((s) => s.l),
    c: r.swatches.map((s) => s.c),
    h: r.swatches.map((s) => s.h),
  };
  return {
    id: def.id,
    name: def.name,
    kind: def.kind,
    family,
    hex: r.swatches.map((s) => s.hex),
    hue: family.h[5],
    result: r,
    // exactly the function only when nothing bends or scales it: a hue, or a colour snapped to a scale
    dense:
      generator && def.delta === 0 && (def.kind === "hue" || def.mode === "snap")
        ? denseAt(generator, r.hue, def.name)
        : undefined,
  };
}

class Store {
  dataset = $state<Dataset>("chromatic");
  space = $state<SpaceId>("oklch");
  smooth = $state(true);
  guides = $state(true);
  copyFormat = $state<"hex" | "oklch">("oklch");
  filter = $state<ScaleFilter>("all");
  hover = $state<string | null>(null);
  selectedId = $state<string | null>(null);
  custom = $state<CustomDef[]>([]);

  private memo = new Map<string, { key: string; scale: Scale }>();

  spaceInfo = $derived(SPACES[this.space]);

  /** All scales sorted around the hue wheel. */
  scales = $derived.by<Scale[]>(() => {
    // fourier / epicycles: the model evaluated at each chromatic family's hue, to compare against the real ones
    const source =
      this.dataset === "fourier" || this.dataset === "epicycles"
        ? tailwind.chromatic.map((f): Family => {
            const r = twlchHue(f.h[5], datasetOpts(this.dataset));
            return {
              name: f.name,
              l: r.swatches.map((s) => s.l),
              c: r.swatches.map((s) => s.c),
              h: r.swatches.map((s) => s.h),
            };
          })
        : tailwind[this.dataset];
    const { generator } = libDataset(this.dataset);
    const hueOf = new Map(tailwind.chromatic.map((f) => [f.name, f.h[5]]));
    const stock = source.map((f): Scale => ({
      id: "tw:" + f.name,
      name: f.name,
      kind: "tailwind",
      family: f,
      dense: generator ? denseAt(generator, hueOf.get(f.name) ?? f.h[5], f.name) : undefined,
      hex: f.l.map((_, i) => hexOf(oklchToHex(f.l[i], f.c[i], f.h[i]))),
      hue: f.h[5],
    }));
    const own: Scale[] = [];
    // Editing one scale shouldn't regenerate the other 50: reuse results whose parameters didn't change.
    const seen = new Map<string, { key: string; scale: Scale }>();
    for (const def of this.custom) {
      if (poolOf(def.dataset) !== poolOf(this.dataset)) continue; // chromatic and computed datasets share their custom scales
      const key = this.dataset + JSON.stringify(def);
      const hit = this.memo.get(def.id);
      if (hit && hit.key === key) {
        seen.set(def.id, hit);
        own.push(hit.scale);
        continue;
      }
      try {
        const base = {
          ...datasetOpts(this.dataset),
          delta: def.delta,
          interpolation: def.interpolation,
        };
        const r =
          def.kind === "color"
            ? twlch(def.color, { ...base, mode: def.mode, shade: def.shade ?? undefined })
            : twlchHue(def.hue, base);
        const scale = fromResult(def, r, this.dataset);
        seen.set(def.id, { key, scale });
        own.push(scale);
      } catch {
        // keep the app alive if a model can't be built for this dataset
      }
    }
    this.memo = seen;
    return [...stock, ...own].sort((a, b) => a.hue - b.hue);
  });

  /** `scales` narrowed by the panel filter. */
  visible = $derived(
    this.filter === "all"
      ? this.scales
      : this.scales.filter((s) => (this.filter === "factory") === (s.kind === "tailwind")),
  );

  selected = $derived(this.scales.find((s) => s.id === this.selectedId) ?? null);
  selectedDef = $derived(this.custom.find((d) => d.id === this.selectedId) ?? null);

  plotFamilies = $derived.by<PlotFamily[]>(() => {
    const fams = convertFamilies(
      this.visible.map((s) => s.family),
      this.spaceInfo,
    );
    if (!this.smooth) return fams;
    // smooth lines of computed scales come from the model's function, not PCHIP through the 11 shades
    const idx = this.visible.flatMap((s, i) => (s.dense ? [i] : []));
    const dense = convertFamilies(
      idx.map((i) => this.visible[i].dense as Family),
      this.spaceInfo,
    );
    idx.forEach((i, q) => (fams[i] = { ...fams[i], dense: dense[q] }));
    return fams;
  });
  /** For fourier / epicycles: the model sampled every 2° of hue, so smooth 3D guides use its exact values. */
  ringFamilies = $derived.by<PlotFamily[] | null>(() => {
    if (this.dataset !== "fourier" && this.dataset !== "epicycles") return null;
    const opts = datasetOpts(this.dataset);
    const sampled: Family[] = [];
    for (let a = 0; a < 360; a += 2) {
      const r = twlchHue(a, opts);
      sampled.push({
        name: `h${a}`,
        l: r.swatches.map((s) => s.l),
        c: r.swatches.map((s) => s.c),
        h: r.swatches.map((s) => s.h),
      });
    }
    return convertFamilies(sampled, this.spaceInfo);
  });
  /** Curve colour per scale: its base colour (shade 500), so lines match what the swatches show. */
  colors = $derived(
    Object.fromEntries(
      this.visible.map((s) => [s.name, parseInt(s.hex[5].slice(1), 16)]),
    ) as Record<string, number>,
  );

  private names(except?: string) {
    return new Set(this.scales.filter((s) => s.id !== except).map((s) => s.name));
  }

  /** Editable scales that belong to the dataset on screen. */
  mine = $derived(this.custom.filter((d) => poolOf(d.dataset) === poolOf(this.dataset)));

  addColor(color = "#3b82f6", interpolation: Interpolation = "smooth") {
    const def: CustomDef = {
      id: nextId(),
      kind: "color",
      dataset: this.dataset,
      interpolation,
      name: uniqueName(colorName(color), this.names()),
      autoName: true,
      color,
      mode: "snap",
      delta: 0,
      shade: null,
    };
    this.custom = [...this.custom, def];
    this.selectedId = def.id;
  }

  addHue(hue: number, bulk = false, interpolation: Interpolation = "smooth") {
    const r = twlchHue(hue, { ...datasetOpts(this.dataset), interpolation });
    const def: CustomDef = {
      id: nextId(),
      kind: "hue",
      dataset: this.dataset,
      interpolation,
      name: uniqueName(colorName(r.swatches[5].hex), this.names()),
      autoName: true,
      hue,
      delta: 0,
      bulk,
    };
    this.custom = [...this.custom, def];
    return def;
  }

  /** Insert `n` scales between every pair of neighbouring dataset scales (replacing earlier bulk ones). */
  bulkAdd(n: number, interpolation: Interpolation = "smooth") {
    const ds = this.dataset;
    this.custom = this.custom.filter(
      (d) => !(d.kind === "hue" && d.bulk && poolOf(d.dataset) === poolOf(ds)),
    );
    const { dataset, generator } = libDataset(ds);
    const anchors = twlchAnchors(dataset, interpolation, generator);
    const taken = this.names();
    const defs: CustomDef[] = [];
    anchors.forEach((a, i) => {
      const next = i + 1 < anchors.length ? anchors[i + 1] : anchors[0] + 360;
      for (let k = 1; k <= n; k++) {
        const hue = (a + (k * (next - a)) / (n + 1)) % 360;
        const r = twlchHue(hue, { ...datasetOpts(ds), interpolation });
        const name = uniqueName(colorName(r.swatches[5].hex), taken);
        taken.add(name);
        defs.push({
          id: nextId(),
          kind: "hue",
          dataset: ds,
          interpolation,
          name,
          autoName: true,
          hue,
          delta: 0,
          bulk: true,
        });
      }
    });
    this.custom = [...this.custom, ...defs];
    return defs.length;
  }

  /** Copy a stock scale into an editable one anchored at its shade-500 colour. */
  duplicate(s: Scale) {
    this.addColor(s.hex[5]);
  }

  update(id: string, patch: Partial<CustomDef>) {
    this.custom = this.custom.map((d) => {
      if (d.id !== id) return d;
      const next = { ...d, ...patch } as CustomDef;
      if (next.autoName && patch.name === undefined) {
        // follow the colour while the name hasn't been typed by hand
        const probe =
          next.kind === "color"
            ? next.color
            : twlchHue(next.hue, {
                ...datasetOpts(this.dataset),
                interpolation: next.interpolation,
              }).swatches[5].hex;
        next.name = uniqueName(colorName(probe), this.names(id));
      }
      if (patch.name !== undefined) next.autoName = false;
      return next;
    });
  }

  remove(id: string) {
    this.custom = this.custom.filter((d) => d.id !== id);
    if (this.selectedId === id) this.selectedId = null;
  }

  /** The state worth sharing; ids are dropped and regenerated by `restore`. */
  snapshot(): SharedState {
    return {
      dataset: this.dataset,
      filter: this.filter,
      copyFormat: this.copyFormat,
      space: this.space,
      custom: this.custom.map((d): CustomSpec => {
        const { id: _id, ...rest } = d;
        return rest;
      }),
    };
  }

  restore(s: SharedState) {
    this.dataset = s.dataset;
    this.filter = s.filter;
    this.copyFormat = s.copyFormat;
    this.space = s.space;
    this.custom = s.custom.map((d) => ({ ...d, id: nextId() }) as CustomDef);
    this.selectedId = null;
  }

  /** Remove every editable scale of the dataset on screen. */
  clearCustom() {
    const gone = new Set(this.mine.map((d) => d.id));
    this.custom = this.custom.filter((d) => !gone.has(d.id));
    if (this.selectedId && gone.has(this.selectedId)) this.selectedId = null;
  }
}

export const store = new Store();

export function isValidColor(text: string): boolean {
  try {
    new Color(text);
    return true;
  } catch {
    return false;
  }
}

/** Text shown in tooltips and copied to the clipboard for one swatch. */
export function swatchValue(s: Scale, i: number, format: "hex" | "oklch"): string {
  if (format === "hex") return s.hex[i];
  const { l, c, h } = { l: s.family.l[i], c: s.family.c[i], h: s.family.h[i] };
  const n = (v: number, d: number) => String(+v.toFixed(d));
  return `oklch(${n(l * 100, 1)}% ${n(c, 3)} ${n(h, 2)})`;
}
