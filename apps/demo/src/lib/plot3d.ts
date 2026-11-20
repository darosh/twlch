import { Container3D, FlatMaterial, Geometry3D, Mesh3D, SphereGeometry, View3D } from "@pixi/3d";
import { OrbitCamera } from "@pixi/3d/extras";
import { Application, Point, Text } from "pixi.js";
import { pchip } from "@darosh/twlch";
import { fmt, niceMax } from "./color.ts";
import { sampleCurve, seriesOf } from "./plot.ts";
import type { PlotOptions } from "./plot.ts";

const BG = 0x0f1115;
const HEIGHT = 5; // world height of L = 1
const RADIUS = 3.2; // world radius of the outermost chroma ring

const mix = (a: number, b: number, t: number) => {
  const ch = (s: number) => Math.round(((a >> s) & 255) * (1 - t) + ((b >> s) & 255) * t);
  return (ch(16) << 16) | (ch(8) << 8) | ch(0);
};

type Entry = {
  name: string;
  line: Mesh3D;
  lineMat: FlatMaterial;
  spheres: Mesh3D[];
  color: number;
  screenPts: [number, number, number][];
};

/** OKLCH as a cylinder: angle = hue, radius = chroma, height = lightness. */
export class Plot3D {
  private app = new Application();
  private ready: Promise<void>;
  private opts: PlotOptions;
  private view!: View3D;
  private orbit!: OrbitCamera;
  /** Shift + wheel zooms (and doesn't scroll the page); a plain wheel is left to the page. */
  private wheel = (e: WheelEvent) => {
    if (!e.shiftKey || !this.orbit) return;
    e.preventDefault();
    // browsers turn Shift + wheel into horizontal scrolling, so the delta may arrive on either axis
    const d = e.deltaY || e.deltaX;
    this.orbit.zoom(Math.exp(-d * 0.0015));
  };
  private content!: Container3D;
  private labels: { text: Text; pos: [number, number, number] }[] = [];
  private entries: Entry[] = [];
  /** Shared by every sphere and kept across rebuilds. */
  private ball?: SphereGeometry;
  private cursorMoved = false;
  private needsPick = false;
  private camSig = "";
  private scale = 1;
  private needsBuild = true;
  private needsStyle = true;
  private cursor: { x: number; y: number } | null = null;
  private screen = new Point();
  private leave: () => void;
  private move: (e: PointerEvent) => void;
  private host: HTMLElement;

  constructor(host: HTMLElement, opts: PlotOptions) {
    this.opts = opts;
    this.host = host;
    this.move = (e) => {
      const r = host.getBoundingClientRect();
      this.cursor = { x: e.clientX - r.left, y: e.clientY - r.top };
      this.cursorMoved = true;
    };
    this.leave = () => {
      this.cursor = null;
      this.opts.onHover(null);
    };
    host.addEventListener("pointerleave", this.leave);
    host.addEventListener("wheel", this.wheel, { passive: false });
    host.addEventListener("pointermove", this.move);
    this.ready = this.app
      .init({
        resizeTo: host,
        background: BG,
        antialias: true,
        autoDensity: true,
        resolution: window.devicePixelRatio,
      })
      .then(() => {
        host.appendChild(this.app.canvas);
        this.view = new View3D({ autoResize: true });
        this.app.stage.addChild(this.view);
        this.view.camera.position.set(4.4, 5.2, 6);
        this.view.camera.lookAt({ x: 0, y: HEIGHT / 2, z: 0 });
        this.orbit = new OrbitCamera({
          view: this.view,
          target: { x: 0, y: HEIGHT / 2, z: 0 },
          enableDamping: true,
          enableZoom: false, // zoom is Shift + wheel (below) so plain scrolling still scrolls the page
          minDistance: 3,
          maxDistance: 30,
        });
        this.content = new Container3D();
        this.view.root.addChild(this.content);

        this.app.stage.eventMode = "static";
        this.app.stage.hitArea = this.app.screen;
        this.app.stage.on("pointerleave", () => (this.cursor = null));
        this.app.ticker.add(() => this.frame());
      });
  }

  update(opts: Partial<PlotOptions>) {
    const rebuild = ["families", "space", "smooth", "guides", "ring"].some(
      (k) =>
        k in opts &&
        (opts as Record<string, unknown>)[k] !== (this.opts as Record<string, unknown>)[k],
    );
    Object.assign(this.opts, opts);
    if (rebuild) {
      this.needsBuild = true;
      this.needsPick = true;
    }
    this.needsStyle = true;
  }

  async destroy() {
    this.host.removeEventListener("pointerleave", this.leave);
    this.host.removeEventListener("wheel", this.wheel);
    this.host.removeEventListener("pointermove", this.move);
    await this.ready;
    this.orbit.destroy();
    this.ball?.destroy();
    this.app.destroy({ removeView: true }, { children: true });
  }

  private pos(l: number, c: number, h: number): [number, number, number] {
    const a = (h * Math.PI) / 180;
    const r = c * this.scale;
    return [r * Math.cos(a), (l / this.opts.space.lMax) * HEIGHT, -r * Math.sin(a)];
  }

  private lineMesh(points: number[], color: number, strip = true) {
    const material = new FlatMaterial({ baseColor: color });
    const mesh = new Mesh3D({
      geometry: new Geometry3D({
        positions: new Float32Array(points),
        topology: strip ? "line-strip" : "line-list",
      }),
      material,
      castShadow: false,
    });
    this.content.addChild(mesh);
    return { mesh, material };
  }

  /** Closed loop through the same shade of every family, ordered by that shade's own hue. */
  private ringPoints(shade: number): number[] {
    const pts = this.opts.families
      .map((f) => ({ l: f.l[shade], c: f.c[shade], h: ((f.h[shade] % 360) + 360) % 360 }))
      .sort((a, b) => a.h - b.h);
    const n = pts.length;
    if (n < 3) return [];
    const out: number[] = [];
    if (this.opts.smooth && this.opts.ring) {
      // the model is a function of hue: sample it directly, no interpolation needed
      const r = this.opts.ring;
      for (let i = 0; i <= r.length; i++) {
        const f = r[i % r.length];
        out.push(...this.pos(f.l[shade], f.c[shade], f.h[shade]));
      }
      return out;
    }
    if (!this.opts.smooth) {
      for (let i = 0; i <= n; i++) {
        const p = pts[i % n];
        out.push(...this.pos(p.l, p.c, p.h));
      }
      return out;
    }
    // Periodic PCHIP: pad two neighbours on each side (hue shifted by ±360°) so the seam has no kink.
    const pad = 2;
    const ext = [];
    for (let i = -pad; i < n + pad; i++) {
      const w = Math.floor(i / n);
      const p = pts[((i % n) + n) % n];
      ext.push({ l: p.l, c: p.c, h: p.h + 360 * w });
    }
    const fl = pchip(ext.map((p) => p.l));
    const fc = pchip(ext.map((p) => p.c));
    const fh = pchip(ext.map((p) => p.h));
    const per = 16;
    for (let k = 0; k <= n * per; k++) {
      const t = pad + k / per;
      out.push(...this.pos(fl(t), fc(t), fh(t)));
    }
    return out;
  }

  private build() {
    for (const n of this.content.removeChildren() as Mesh3D[])
      n.destroy({ children: true, geometry: n.geometry !== this.ball, material: true });
    for (const l of this.labels) l.text.destroy();
    this.labels = [];
    this.entries = [];

    const fams = this.opts.families;
    const maxC = Math.max(1e-6, ...fams.flatMap((f) => f.c));
    const niceC = niceMax(maxC);
    this.scale = RADIUS / niceC;

    // axes: L axis, hue spokes, chroma rings on the L=0 floor
    const grid = 0x2a3241;
    this.lineMesh([0, 0, 0, 0, HEIGHT, 0], grid);
    for (let h = 0; h < 360; h += 90) this.lineMesh([0, 0, 0, ...this.pos(0, niceC, h)], grid);
    const rings = 3;
    for (let k = 1; k <= rings; k++) {
      const c = (niceC * k) / rings;
      const pts: number[] = [];
      for (let a = 0; a <= 360; a += 6) pts.push(...this.pos(0, c, a));
      this.lineMesh(pts, grid);
    }
    const label = (text: string, pos: [number, number, number]) => {
      const t = new Text({
        text,
        style: { fill: 0x7d8899, fontSize: 11, fontFamily: "system-ui, sans-serif" },
      });
      t.anchor.set(0.5);
      this.app.stage.addChild(t);
      this.labels.push({ text: t, pos });
    };
    for (let h = 0; h < 360; h += 90) label(`${h}°`, this.pos(0, niceC * 1.12, h));
    const { short, lMax } = this.opts.space;
    label(`${short.l} 0`, [0, 0, 0]);
    label(`${short.l} ${fmt(lMax, lMax)}`, [0, HEIGHT, 0]);
    label(`${short.c} ${fmt(niceC, niceC)}`, this.pos(0, niceC, 45));

    if (this.opts.guides) {
      const guides = 0x555555;

      for (let k = 0; k < this.opts.shades.length; k++) {
        const pts = this.ringPoints(k);
        if (pts.length) this.lineMesh(pts, guides);
      }
    }

    const ball = (this.ball ??= new SphereGeometry({
      radius: 0.07,
      widthSegments: 10,
      heightSegments: 6,
    }));
    for (const f of fams) {
      const color = this.opts.colors[f.name] ?? 0xffffff;
      const l = seriesOf(f, "l");
      const c = seriesOf(f, "c");
      const h = seriesOf(f, "h");
      const pl = sampleCurve(l, this.opts.smooth);
      const pc = sampleCurve(c, this.opts.smooth);
      const ph = sampleCurve(h, this.opts.smooth);
      const pts: number[] = [];
      const screenPts: [number, number, number][] = [];
      pl.forEach((_, i) => {
        const p = this.pos(pl[i].v, pc[i].v, ph[i].v);
        pts.push(...p);
        screenPts.push(p);
      });
      const { mesh: line, material: lineMat } = this.lineMesh(pts, color);
      const spheres = f.l.map((_, i) => {
        const s = new Mesh3D({
          geometry: ball,
          material: new FlatMaterial({ baseColor: f.hex[i] }),
          castShadow: false,
        });
        s.position.set(...this.pos(f.l[i], f.c[i], f.h[i]));
        this.content.addChild(s);
        return s;
      });
      this.entries.push({ name: f.name, line, lineMat, spheres, color, screenPts });
    }
  }

  private style() {
    const hover = this.opts.hover;
    for (const e of this.entries) {
      const on = e.name === hover;
      e.lineMat.baseColor = hover && !on ? mix(e.color, BG, 0.75) : e.color;
      const k = on ? 1.9 : hover ? 0.6 : 1;
      for (const s of e.spheres) s.scale.set(k, k, k);
    }
  }

  /** Family whose projected polyline is closest to the pointer, within 12px. */
  private pick(): string | null {
    if (!this.cursor) return null;
    const cx = this.cursor.x;
    const cy = this.cursor.y;
    let best: string | null = null;
    let bestD = 12;
    const w = { x: 0, y: 0, z: 0 };
    for (const e of this.entries) {
      let px = 0;
      let py = 0;
      let has = false;
      for (const p of e.screenPts) {
        w.x = p[0];
        w.y = p[1];
        w.z = p[2];
        const s = this.view.worldToScreen(w, this.screen);
        if (!s) {
          has = false;
          continue;
        }
        if (has) {
          const d = segDist(cx, cy, px, py, s.x, s.y);
          if (d < bestD) {
            bestD = d;
            best = e.name;
          }
        }
        px = s.x;
        py = s.y;
        has = true;
      }
    }
    return best;
  }

  private frame() {
    if (this.needsBuild) {
      this.needsBuild = false;
      this.build();
    }
    if (this.needsStyle) {
      this.needsStyle = false;
      this.style();
    }
    for (const l of this.labels) {
      const p = this.view.worldToScreen({ x: l.pos[0], y: l.pos[1], z: l.pos[2] }, this.screen);
      l.text.visible = p !== null;
      if (p) l.text.position.set(p.x, p.y);
    }
    // Picking projects every curve point, so only redo it when the pointer or the camera moved.
    const c = this.view.camera.position;
    const sig = `${c.x.toFixed(3)},${c.y.toFixed(3)},${c.z.toFixed(3)}`;
    const moved = this.cursorMoved || sig !== this.camSig || this.needsPick;
    this.cursorMoved = false;
    this.needsPick = false;
    this.camSig = sig;
    if (this.cursor && moved) {
      const picked = this.pick();
      if (picked !== this.opts.hover) this.opts.onHover(picked);
    }
  }
}

function segDist(px: number, py: number, ax: number, ay: number, bx: number, by: number) {
  const dx = bx - ax;
  const dy = by - ay;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy || 1)));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}
