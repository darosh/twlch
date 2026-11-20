import { DATASETS, FILTERS, store } from "./store.svelte.ts";
import type { CustomSpec, SharedState } from "./store.svelte.ts";
import type { SpaceId } from "./spaces.ts";

const SPACE_IDS: SpaceId[] = ["oklch", "lch", "hct", "jzczhz"];
const INTERP = ["smooth", "linear"] as const;
const FORMATS = ["oklch", "hex"] as const;

/** Compact tuple per custom scale; kind "c" = from a colour, "h" = from a hue. */
type Row = (string | number | null)[];

function toRow(d: CustomSpec): Row {
  const head = [
    d.kind === "color" ? "c" : "h",
    DATASETS.indexOf(d.dataset),
    INTERP.indexOf(d.interpolation),
    d.autoName ? 1 : 0,
    d.name,
  ];
  return d.kind === "color"
    ? [...head, d.color.replace(/^#/, ""), d.mode === "match" ? 1 : 0, d.delta, d.shade, d.hueNudge]
    : [...head, d.hue, d.delta, d.bulk ? 1 : 0];
}

function fromRow(r: Row): CustomSpec {
  const base = {
    dataset: DATASETS[r[1] as number],
    interpolation: INTERP[r[2] as number],
    autoName: r[3] === 1,
    name: String(r[4]),
  };
  if (!base.dataset || !base.interpolation) throw new Error("bad scale");
  if (r[0] === "c") {
    const raw = String(r[5]);
    return {
      ...base,
      kind: "color",
      color: /^[0-9a-f]{3,8}$/i.test(raw) ? "#" + raw : raw,
      mode: r[6] === 1 ? "match" : "snap",
      delta: Number(r[7]),
      shade: r[8] === null ? null : Number(r[8]),
      hueNudge: r[9] === undefined || r[9] === null ? 0 : Number(r[9]),
    };
  }
  return { ...base, kind: "hue", hue: Number(r[5]), delta: Number(r[6]), bulk: r[7] === 1 };
}

const b64 = {
  enc: (b: Uint8Array) =>
    btoa(String.fromCharCode(...b))
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, ""),
  dec: (s: string) =>
    Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0)),
};

async function pipe(data: Uint8Array, stream: CompressionStream | DecompressionStream) {
  const w = stream.writable.getWriter();
  void w.write(data as BufferSource);
  void w.close();
  return new Uint8Array(await new Response(stream.readable).arrayBuffer());
}

/** State → URL-safe string: compact JSON array, deflate-raw, base64url. First char: `z` compressed, `p` plain. */
export async function encodeState(s: SharedState): Promise<string> {
  const json = JSON.stringify([
    DATASETS.indexOf(s.dataset),
    FILTERS.indexOf(s.filter),
    FORMATS.indexOf(s.copyFormat),
    SPACE_IDS.indexOf(s.space),
    s.custom.map(toRow),
  ]);
  const bytes = new TextEncoder().encode(json);
  if (typeof CompressionStream === "undefined") return "p" + b64.enc(bytes);
  return "z" + b64.enc(await pipe(bytes, new CompressionStream("deflate-raw")));
}

export async function decodeState(text: string): Promise<SharedState> {
  const body = b64.dec(text.slice(1));
  const bytes = text[0] === "z" ? await pipe(body, new DecompressionStream("deflate-raw")) : body;
  const [d, f, m, sp, rows] = JSON.parse(new TextDecoder().decode(bytes)) as [
    number,
    number,
    number,
    number,
    Row[],
  ];
  const state: SharedState = {
    // tolerate out-of-range values (older links) by falling back to defaults
    dataset: DATASETS[d] ?? DATASETS[0],
    filter: FILTERS[f] ?? FILTERS[0],
    copyFormat: FORMATS[m] ?? FORMATS[0],
    space: SPACE_IDS[sp] ?? SPACE_IDS[0],
    custom: rows.map(fromRow),
  };
  return state;
}

export async function shareUrl(s: SharedState): Promise<string> {
  return `${location.origin}${location.pathname}#s=${await encodeState(s)}`;
}

/** Restore from `#s=...` if present. Returns false when there was nothing or it was invalid. */
export async function readHash(): Promise<boolean | null> {
  const m = /^#s=([A-Za-z0-9_-]+)$/.exec(location.hash);
  if (!m) return null;
  try {
    store.restore(await decodeState(m[1]));
    return true;
  } catch {
    return false;
  }
}
