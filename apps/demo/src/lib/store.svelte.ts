import Color from "colorjs.io";
import { tailwind } from "twlch";
import type { Family } from "twlch";
import { twlch, twlchAnchors, twlchHue } from "twlch";
import type { DatasetName, Interpolation, TwlchResult } from "twlch";
import { colorName, uniqueName } from "./custom.ts";
import { oklchToHex } from "./color.ts";
import { SPACES, convertFamilies } from "./spaces.ts";
import type { PlotFamily, SpaceId } from "./spaces.ts";

type DefBase = { dataset: DatasetName; interpolation: Interpolation };
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
};

const hexOf = (n: number) => "#" + n.toString(16).padStart(6, "0");
let counter = 0;
const nextId = () => `c${++counter}`;

function fromResult(def: CustomDef, r: TwlchResult): Scale {
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
  };
}

class Store {
  dataset = $state<DatasetName>("chromatic");
  space = $state<SpaceId>("oklch");
  smooth = $state(true);
  guides = $state(true);
  copyFormat = $state<"hex" | "oklch">("oklch");
  hover = $state<string | null>(null);
  selectedId = $state<string | null>(null);
  custom = $state<CustomDef[]>([]);

  private memo = new Map<string, { key: string; scale: Scale }>();

  spaceInfo = $derived(SPACES[this.space]);

  /** All scales sorted around the hue wheel. */
  scales = $derived.by<Scale[]>(() => {
    const stock = tailwind[this.dataset].map((f): Scale => ({
      id: "tw:" + f.name,
      name: f.name,
      kind: "tailwind",
      family: f,
      hex: f.l.map((_, i) => hexOf(oklchToHex(f.l[i], f.c[i], f.h[i]))),
      hue: f.h[5],
    }));
    const own: Scale[] = [];
    // Editing one scale shouldn't regenerate the other 50: reuse results whose parameters didn't change.
    const seen = new Map<string, { key: string; scale: Scale }>();
    for (const def of this.custom) {
      if (def.dataset !== this.dataset) continue; // scales belong to the dataset they were made in
      const key = JSON.stringify(def);
      const hit = this.memo.get(def.id);
      if (hit && hit.key === key) {
        seen.set(def.id, hit);
        own.push(hit.scale);
        continue;
      }
      try {
        const base = { dataset: def.dataset, delta: def.delta, interpolation: def.interpolation };
        const r =
          def.kind === "color"
            ? twlch(def.color, { ...base, mode: def.mode, shade: def.shade ?? undefined })
            : twlchHue(def.hue, base);
        const scale = fromResult(def, r);
        seen.set(def.id, { key, scale });
        own.push(scale);
      } catch {
        // keep the app alive if a model can't be built for this dataset
      }
    }
    this.memo = seen;
    return [...stock, ...own].sort((a, b) => a.hue - b.hue);
  });

  selected = $derived(this.scales.find((s) => s.id === this.selectedId) ?? null);
  selectedDef = $derived(this.custom.find((d) => d.id === this.selectedId) ?? null);

  plotFamilies = $derived<PlotFamily[]>(
    convertFamilies(
      this.scales.map((s) => s.family),
      this.spaceInfo,
    ),
  );
  /** Curve colour per scale: its base colour (shade 500), so lines match what the swatches show. */
  colors = $derived(
    Object.fromEntries(this.scales.map((s) => [s.name, parseInt(s.hex[5].slice(1), 16)])) as Record<
      string,
      number
    >,
  );

  private names(except?: string) {
    return new Set(this.scales.filter((s) => s.id !== except).map((s) => s.name));
  }

  /** Editable scales that belong to the dataset on screen. */
  mine = $derived(this.custom.filter((d) => d.dataset === this.dataset));

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
    const r = twlchHue(hue, { dataset: this.dataset, interpolation });
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
    this.custom = this.custom.filter((d) => !(d.kind === "hue" && d.bulk && d.dataset === ds));
    const anchors = twlchAnchors(ds, interpolation);
    const taken = this.names();
    const defs: CustomDef[] = [];
    anchors.forEach((a, i) => {
      const next = i + 1 < anchors.length ? anchors[i + 1] : anchors[0] + 360;
      for (let k = 1; k <= n; k++) {
        const hue = (a + (k * (next - a)) / (n + 1)) % 360;
        const r = twlchHue(hue, { dataset: ds, interpolation });
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
            : twlchHue(next.hue, { dataset: next.dataset, interpolation: next.interpolation })
                .swatches[5].hex;
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
