import { pchip } from "@darosh/twlch";
import { Application, Container, Graphics, Text } from "pixi.js";
import type { TextStyleOptions } from "pixi.js";
import type { Family } from "@darosh/twlch";
import { fmt, labelContrast, niceMax } from "./color.ts";
import { hexOfNum, PALETTES } from "./palette.ts";
import type { Theme } from "./palette.ts";
import type { PlotFamily, SpaceInfo } from "./spaces.ts";

export type Channel = "l" | "c" | "h";
/** The plot panels: the three channels plus the WCAG contrast of each swatch against its label colour. */
type PanelKey = Channel | "k";

export type PlotOptions = {
  theme: Theme;
  families: PlotFamily[];
  space: SpaceInfo;
  shades: number[];
  /** Colour used for the line of each family (0xRRGGBB). */
  colors: Record<string, number>;
  hover: string | null;
  onHover: (name: string | null) => void;
  /** Draw monotone cubic (PCHIP) curves through the 11 shades instead of straight segments. */
  smooth: boolean;
  /** 3D only: closed guide curves joining the same shade across all families. */
  guides: boolean;
  /** 3D only: draw guides as straight lines from each point to the lightness axis instead of rings. */
  spokes: boolean;
  /**
   * 3D only: the scale of a fitted model sampled densely around the hue wheel. When set (and `smooth`
   * is on) the guide curves follow these exact values instead of a PCHIP through the families.
   */
  ring: PlotFamily[] | null;
};

const CHANNELS: { key: PanelKey }[] = [{ key: "l" }, { key: "c" }, { key: "h" }, { key: "k" }];
const MARGIN = { left: 52, right: 20, top: 22, bottom: 26, gap: 30 };

/** Unwrap a hue series so consecutive values never jump by more than 180°. */
function unwrap(h: number[]): number[] {
  const out = [h[0]];
  for (let i = 1; i < h.length; i++) {
    let v = h[i];
    while (v - out[i - 1] > 180) v -= 360;
    while (v - out[i - 1] < -180) v += 360;
    out.push(v);
  }
  return out;
}

/** Black on white, the highest possible WCAG contrast. */
const MAX_CONTRAST = 21;
/** WCAG thresholds drawn on the contrast axis: UI/large text AA, text AA, text AAA. */
const WCAG_TICKS = [3, 4.5, 7];
const SAMPLES = 12;
const X_MAX = 1000;
/** Smallest chroma axis maximum (OKLCH units), so datasets are comparable at the same scale. */
export const C_MIN = 0.4;

/** Unwrapped hue for h, raw values otherwise. */
export function seriesOf(f: Family, key: Channel): number[] {
  return key === "h" ? unwrap(f.h) : f[key];
}

/** WCAG contrast of each swatch against its label colour (see labelContrast). */
export function contrastSeries(f: PlotFamily): number[] {
  return f.hex.map((hx, i) => labelContrast(hx, i));
}

/** The values plotted in a panel for a family. */
function panelSeries(f: PlotFamily, key: PanelKey): number[] {
  return key === "k" ? contrastSeries(f) : seriesOf(f, key);
}

/** The densely sampled series of a family that is an exact function (see PlotFamily.dense), if any. */
export function denseOf(f: PlotFamily, key: Channel): number[] | undefined {
  return f.dense ? seriesOf(f.dense, key) : undefined;
}

/**
 * Points of a curve as (fractional shade index, value): the data itself, the exact function values
 * where `dense` is given, or a PCHIP resampling of the 11 values.
 */
export function sampleCurve(
  vals: number[],
  smooth: boolean,
  dense?: number[],
): { t: number; v: number }[] {
  if (!smooth) return vals.map((v, t) => ({ t, v }));
  if (dense) return dense.map((v, k) => ({ t: k / SAMPLES, v }));
  const f = pchip(vals);
  const n = (vals.length - 1) * SAMPLES;
  return Array.from({ length: n + 1 }, (_, k) => ({ t: k / SAMPLES, v: f(k / SAMPLES) }));
}

type Panel = {
  key: PanelKey;
  x0: number;
  x1: number;
  y0: number;
  y1: number;
  min: number;
  max: number;
};

type Entry = {
  name: string;
  color: number;
  g: Graphics;
  /** Screen-space polyline per panel, flattened x,y pairs (for picking and the hover overlay). */
  lines: number[][];
};

/**
 * Three stacked panels (L, C, H) with one curve per scale.
 *
 * The scene is built once per data/size change; hovering only dims, overlays and moves a readout, so
 * moving the mouse never allocates new display objects.
 */
export class CurvePlot {
  private app = new Application();
  private ready: Promise<void>;
  private opts: PlotOptions;
  private panels: Panel[] = [];
  private ro: ResizeObserver;
  private root = new Container();
  private labels = new Container(); // text, rebuilt on data changes
  private grid = new Graphics(); // reused: destroying rendered Graphics leaks GPU-side data in Pixi 8
  private curves = new Container();
  private pool: Graphics[] = [];
  private entries: Entry[] = [];
  private hl = new Graphics(); // overlay for the hovered curve
  private readout = new Container();
  private readoutBg = new Graphics();
  private readoutText = new Text({
    text: "",
    style: { fill: 0xffffff, fontSize: 12, fontFamily: "ui-monospace, monospace", lineHeight: 16 },
  });
  private readoutKey = "";
  private needsBuild = true;
  private needsStyle = true;
  private cursor: { x: number; y: number } | null = null;
  private leave: () => void;
  private move: (e: PointerEvent) => void;
  private host: HTMLElement;

  constructor(host: HTMLElement, opts: PlotOptions) {
    this.opts = opts;
    this.host = host;
    this.move = (e) => {
      const r = host.getBoundingClientRect();
      this.cursor = { x: e.clientX - r.left, y: e.clientY - r.top };
      const picked = this.pick();
      if (picked !== this.opts.hover) this.opts.onHover(picked);
      this.needsStyle = true;
    };
    this.leave = () => {
      this.cursor = null;
      this.needsStyle = true;
      this.opts.onHover(null);
    };
    host.addEventListener("pointerleave", this.leave);
    host.addEventListener("pointermove", this.move);
    this.ready = this.app
      .init({
        resizeTo: host,
        background: hexOfNum(PALETTES[this.opts.theme].bg),
        antialias: true,
        autoDensity: true,
        resolution: window.devicePixelRatio,
      })
      .then(() => {
        host.appendChild(this.app.canvas);
        this.readout.addChild(this.readoutBg, this.readoutText);
        this.readout.visible = false;
        this.root.addChild(this.grid, this.labels, this.curves, this.hl, this.readout);
        this.app.stage.addChild(this.root);
        this.app.stage.eventMode = "none";
        this.app.renderer.on("resize", () => {
          this.needsBuild = true;
        });
        this.app.ticker.add(() => {
          if (this.needsBuild) {
            this.needsBuild = false;
            this.build();
          }
          if (this.needsStyle) {
            this.needsStyle = false;
            this.style();
          }
        });
      });
    // Element targets need an explicit observer (see pixijs skill: application).
    this.ro = new ResizeObserver(() => this.app.queueResize?.());
    this.ro.observe(host);
  }

  update(opts: Partial<PlotOptions>) {
    const rebuild = ["families", "space", "smooth", "colors", "shades", "theme"].some(
      (k) =>
        k in opts &&
        (opts as Record<string, unknown>)[k] !== (this.opts as Record<string, unknown>)[k],
    );
    Object.assign(this.opts, opts);
    if (rebuild) this.needsBuild = true;
    if (opts.theme && this.ready)
      void this.ready.then(
        () => (this.app.renderer.background.color = PALETTES[this.opts.theme].bg),
      );
    this.needsStyle = true;
  }

  async destroy() {
    this.host.removeEventListener("pointerleave", this.leave);
    this.host.removeEventListener("pointermove", this.move);
    this.ro.disconnect();
    await this.ready;
    this.app.destroy({ removeView: true }, { children: true });
  }

  private layout() {
    const { width, height } = this.app.screen;
    const n = CHANNELS.length;
    const ph = (height - MARGIN.top - MARGIN.bottom - MARGIN.gap * (n - 1)) / n;
    const fams = this.opts.families;
    const maxC = Math.max(1e-6, ...fams.flatMap((f) => f.c));
    const niceC = Math.max(C_MIN, niceMax(maxC)); // fixed floor so the chroma scale stays comparable
    const hs = fams.flatMap((f) => seriesOf(f, "h"));
    const hMin = Math.min(0, Math.floor(Math.min(...hs) / 30) * 30);
    const hMax = Math.max(360, Math.ceil(Math.max(...hs) / 30) * 30);
    this.panels = CHANNELS.map((ch, i) => {
      const y0 = MARGIN.top + i * (ph + MARGIN.gap);
      const range =
        ch.key === "l"
          ? [0, this.opts.space.lMax]
          : ch.key === "c"
            ? [0, niceC]
            : ch.key === "h"
              ? [hMin, hMax]
              : [1, MAX_CONTRAST];
      return {
        key: ch.key,
        x0: MARGIN.left,
        x1: width - MARGIN.right,
        y0,
        y1: y0 + ph,
        min: range[0],
        max: range[1],
      };
    });
  }

  /** Shade value (0…1000 axis) at a fractional shade index; linear between neighbouring shades. */
  private shadeAt(i: number) {
    const sh = this.opts.shades;
    const lo = Math.min(Math.max(Math.floor(i), 0), sh.length - 2);
    return sh[lo] + (i - lo) * (sh[lo + 1] - sh[lo]);
  }
  /** x of a fractional shade index: the axis is proportional to the shade value, 0 to 1000. */
  private px(p: Panel, i: number) {
    return this.pxShade(p, this.shadeAt(i));
  }
  private pxShade(p: Panel, shade: number) {
    return p.x0 + ((p.x1 - p.x0) * shade) / X_MAX;
  }
  private py(p: Panel, v: number) {
    return p.y1 - ((v - p.min) / (p.max - p.min)) * (p.y1 - p.y0);
  }

  /** Rebuild every display object. Runs on data, space, smoothing and size changes only. */
  private build() {
    this.layout();
    for (const c of this.labels.removeChildren()) c.destroy();
    this.grid.clear();
    this.entries = [];
    this.readoutKey = "";
    const pal = PALETTES[this.opts.theme];
    this.readoutText.style.fill = pal.readoutText;
    const labelStyle: TextStyleOptions = {
      fill: pal.axisLabel,
      fontSize: 11,
      fontFamily: "system-ui, sans-serif",
    };

    const grid = this.grid;
    const last = this.panels[this.panels.length - 1];
    for (const p of this.panels) {
      grid.rect(p.x0, p.y0, p.x1 - p.x0, p.y1 - p.y0).fill(pal.panel);
      const ticks = 4;
      const vals =
        p.key === "k"
          ? [1, ...WCAG_TICKS, MAX_CONTRAST]
          : Array.from({ length: ticks + 1 }, (_, t) => p.min + ((p.max - p.min) * t) / ticks);
      for (const v of vals) {
        const y = this.py(p, v);
        const wcag = p.key === "k" && WCAG_TICKS.includes(v);
        grid
          .moveTo(p.x0, y)
          .lineTo(p.x1, y)
          .stroke({ width: 1, color: wcag ? pal.threshold : pal.gridH });
        const txt = new Text({
          text: p.key === "k" ? `${v}:1` : fmt(v, p.max - p.min),
          style: wcag ? { ...labelStyle, fill: pal.label } : labelStyle,
        });
        txt.anchor.set(1, 0.5);
        txt.position.set(p.x0 - 6, y);
        this.labels.addChild(txt);
      }
      this.opts.shades.forEach((s) => {
        const x = this.pxShade(p, s);
        grid.moveTo(x, p.y0).lineTo(x, p.y1).stroke({ width: 1, color: pal.gridV });
        if (p === last) {
          const t = new Text({ text: String(s), style: labelStyle });
          t.anchor.set(0.5, 0);
          t.position.set(x, p.y1 + 6);
          this.labels.addChild(t);
        }
      });
      const title = new Text({
        text:
          p.key === "k"
            ? "Contrast (WCAG: 3 UI/large AA · 4.5 text AA · 7 text AAA; black on 50–500, white on 600–950)"
            : this.opts.space.titles[p.key],
        style: { ...labelStyle, fill: pal.label },
      });
      title.position.set(p.x0, p.y0 - 17);
      this.labels.addChild(title);
    }

    // One Graphics per scale (all three panels), so a hover change is just alpha on these.
    const fams = this.opts.families;
    while (this.pool.length < fams.length) {
      const g = new Graphics();
      this.pool.push(g);
      this.curves.addChild(g);
    }
    // Surplus Graphics are emptied and hidden, never destroyed (destroying rendered ones leaks).
    this.pool.forEach((g, i) => {
      g.clear();
      g.alpha = 1;
      g.visible = i < fams.length;
    });
    for (const [i, f] of fams.entries()) {
      const color = this.opts.colors[f.name] ?? 0xffffff;
      const g = this.pool[i];
      const lines: number[][] = [];
      for (const p of this.panels) {
        const vals = panelSeries(f, p.key);
        const poly: number[] = [];
        sampleCurve(vals, this.opts.smooth, p.key === "k" ? undefined : denseOf(f, p.key)).forEach(
          ({ t, v }) => poly.push(this.px(p, t), this.py(p, v)),
        );
        lines.push(poly);
        g.poly(poly, false).stroke({ width: 1.5, color, join: "round" });
        vals.forEach((v, i) => g.circle(this.px(p, i), this.py(p, v), 2.2).fill(color));
      }
      this.entries.push({ name: f.name, color, g, lines });
    }
    this.needsStyle = true;
  }

  /** Scale whose polyline is closest to the cursor, within 14px. */
  private pick(): string | null {
    if (!this.cursor || !this.panels.length) return null;
    const { x, y } = this.cursor;
    const pi = this.panels.findIndex(
      (q) => y >= q.y0 - 6 && y <= q.y1 + 6 && x >= q.x0 - 6 && x <= q.x1 + 6,
    );
    if (pi < 0) return null;
    let best: string | null = null;
    let bestD = 14;
    for (const e of this.entries) {
      const l = e.lines[pi];
      for (let i = 0; i + 3 < l.length; i += 2) {
        const d = segDist(x, y, l[i], l[i + 1], l[i + 2], l[i + 3]);
        if (d < bestD) {
          bestD = d;
          best = e.name;
        }
      }
    }
    return best;
  }

  /** Cheap per-hover pass: dim others, overlay the hovered curve, update the readout. */
  private style() {
    const picked = this.pick();
    const hover = picked ?? this.opts.hover;
    this.hl.clear();
    for (const e of this.entries) {
      const on = e.name === hover;
      e.g.alpha = hover && !on ? 0.22 : 1;
      if (!on) continue;
      this.panels.forEach((p, pi) => {
        this.hl.poly(e.lines[pi], false).stroke({ width: 3, color: e.color, join: "round" });
        const f = this.opts.families.find((x) => x.name === e.name)!;
        panelSeries(f, p.key).forEach((v, i) =>
          this.hl.circle(this.px(p, i), this.py(p, v), 3.5).fill(e.color),
        );
      });
    }
    this.updateReadout(hover);
  }

  private updateReadout(hover: string | null) {
    const cur = this.cursor;
    const f = hover ? this.opts.families.find((x) => x.name === hover) : undefined;
    const p = cur ? this.panels.find((q) => cur.y >= q.y0 - 6 && cur.y <= q.y1 + 6) : undefined;
    if (!f || !cur || !p) {
      this.readout.visible = false;
      return;
    }
    const at = ((cur.x - p.x0) / (p.x1 - p.x0)) * X_MAX;
    let k = 0;
    this.opts.shades.forEach((s, i) => {
      if (Math.abs(s - at) < Math.abs(this.opts.shades[k] - at)) k = i;
    });
    const key = `${f.name}|${k}|${this.opts.space.id}`;
    if (key !== this.readoutKey) {
      this.readoutKey = key;
      const s = this.opts.space;
      this.readoutText.text = `${f.name} ${this.opts.shades[k]}\n${s.short.l} ${fmt(f.l[k], this.panels[0].max)}  ${s.short.c} ${fmt(f.c[k], this.panels[1].max)}  ${s.short.h} ${f.h[k].toFixed(1)}  contrast ${contrastSeries(f)[k].toFixed(2)}`;
      this.readoutText.position.set(6, 5);
      this.readoutBg
        .clear()
        .roundRect(0, 0, this.readoutText.width + 12, this.readoutText.height + 10, 4)
        .fill({ color: PALETTES[this.opts.theme].readoutBg, alpha: 0.8 });
    }
    const w = this.readoutText.width + 12;
    const h = this.readoutText.height + 10;
    this.readout.position.set(
      Math.min(cur.x + 14, this.app.screen.width - w - 4),
      Math.max(4, cur.y - h - 10),
    );
    this.readout.visible = true;
  }
}

function segDist(px: number, py: number, ax: number, ay: number, bx: number, by: number) {
  const dx = bx - ax;
  const dy = by - ay;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy || 1)));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}
