import { pchip } from "@darosh/twlch";
import { Application, Container, Graphics, Text } from "pixi.js";
import type { TextStyleOptions } from "pixi.js";
import type { Family } from "@darosh/twlch";
import { fmt, niceMax } from "./color.ts";
import type { PlotFamily, SpaceInfo } from "./spaces.ts";

export type Channel = "l" | "c" | "h";

export type PlotOptions = {
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
  /**
   * 3D only: the scale of a fitted model sampled densely around the hue wheel. When set (and `smooth`
   * is on) the guide curves follow these exact values instead of a PCHIP through the families.
   */
  ring: PlotFamily[] | null;
};

const CHANNELS: { key: Channel }[] = [{ key: "l" }, { key: "c" }, { key: "h" }];
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

const SAMPLES = 12;

/** Unwrapped hue for h, raw values otherwise. */
export function seriesOf(f: Family, key: Channel): number[] {
  return key === "h" ? unwrap(f.h) : f[key];
}

/** Points of a curve as (fractional shade index, value): the data itself, or a PCHIP resampling of it. */
export function sampleCurve(vals: number[], smooth: boolean): { t: number; v: number }[] {
  if (!smooth) return vals.map((v, t) => ({ t, v }));
  const f = pchip(vals);
  const n = (vals.length - 1) * SAMPLES;
  return Array.from({ length: n + 1 }, (_, k) => ({ t: k / SAMPLES, v: f(k / SAMPLES) }));
}

type Panel = {
  key: Channel;
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
        background: "#0f1115",
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
    const rebuild = ["families", "space", "smooth", "colors", "shades"].some(
      (k) =>
        k in opts &&
        (opts as Record<string, unknown>)[k] !== (this.opts as Record<string, unknown>)[k],
    );
    Object.assign(this.opts, opts);
    if (rebuild) this.needsBuild = true;
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
    const niceC = niceMax(maxC);
    const hs = fams.flatMap((f) => seriesOf(f, "h"));
    const hMin = Math.min(0, Math.floor(Math.min(...hs) / 30) * 30);
    const hMax = Math.max(360, Math.ceil(Math.max(...hs) / 30) * 30);
    this.panels = CHANNELS.map((ch, i) => {
      const y0 = MARGIN.top + i * (ph + MARGIN.gap);
      const range =
        ch.key === "l" ? [0, this.opts.space.lMax] : ch.key === "c" ? [0, niceC] : [hMin, hMax];
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

  private px(p: Panel, i: number) {
    return p.x0 + ((p.x1 - p.x0) * i) / (this.opts.shades.length - 1);
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
    const labelStyle: TextStyleOptions = {
      fill: 0x9aa4b2,
      fontSize: 11,
      fontFamily: "system-ui, sans-serif",
    };

    const grid = this.grid;
    const last = this.panels[this.panels.length - 1];
    for (const p of this.panels) {
      grid.rect(p.x0, p.y0, p.x1 - p.x0, p.y1 - p.y0).fill(0x151922);
      const ticks = 4;
      for (let t = 0; t <= ticks; t++) {
        const v = p.min + ((p.max - p.min) * t) / ticks;
        const y = this.py(p, v);
        grid.moveTo(p.x0, y).lineTo(p.x1, y).stroke({ width: 1, color: 0x232a36 });
        const txt = new Text({ text: fmt(v, p.max - p.min), style: labelStyle });
        txt.anchor.set(1, 0.5);
        txt.position.set(p.x0 - 6, y);
        this.labels.addChild(txt);
      }
      this.opts.shades.forEach((s, i) => {
        const x = this.px(p, i);
        grid.moveTo(x, p.y0).lineTo(x, p.y1).stroke({ width: 1, color: 0x1c222d });
        if (p === last) {
          const t = new Text({ text: String(s), style: labelStyle });
          t.anchor.set(0.5, 0);
          t.position.set(x, p.y1 + 6);
          this.labels.addChild(t);
        }
      });
      const title = new Text({
        text: this.opts.space.titles[p.key],
        style: { ...labelStyle, fill: 0xd6dbe4 },
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
        const vals = seriesOf(f, p.key);
        const poly: number[] = [];
        sampleCurve(vals, this.opts.smooth).forEach(({ t, v }) =>
          poly.push(this.px(p, t), this.py(p, v)),
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
        seriesOf(f, p.key).forEach((v, i) =>
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
    const n = this.opts.shades.length;
    const k = Math.min(n - 1, Math.max(0, Math.round(((cur.x - p.x0) / (p.x1 - p.x0)) * (n - 1))));
    const key = `${f.name}|${k}|${this.opts.space.id}`;
    if (key !== this.readoutKey) {
      this.readoutKey = key;
      const s = this.opts.space;
      this.readoutText.text = `${f.name} ${this.opts.shades[k]}\n${s.short.l} ${fmt(f.l[k], this.panels[0].max)}  ${s.short.c} ${fmt(f.c[k], this.panels[1].max)}  ${s.short.h} ${f.h[k].toFixed(1)}`;
      this.readoutText.position.set(6, 5);
      this.readoutBg
        .clear()
        .roundRect(0, 0, this.readoutText.width + 12, this.readoutText.height + 10, 4)
        .fill({ color: 0x000000, alpha: 0.8 });
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
