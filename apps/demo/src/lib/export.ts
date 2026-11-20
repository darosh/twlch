import { tailwind } from "@darosh/twlch";
import { swatchValue } from "./store.svelte.ts";
import type { Scale } from "./store.svelte.ts";

type Format = "hex" | "oklch";

const slug = (name: string) =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "color";

/** The name on its own line, then one color per line; scales separated by a blank line. */
export function asText(scales: Scale[], format: Format): string {
  return scales
    .map((s) => [s.name, ...tailwind.shades.map((_, i) => swatchValue(s, i, format))].join("\n"))
    .join("\n\n");
}

const ident = (name: string) => {
  const id = name
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)
    .map((w, i) => (i === 0 ? w.charAt(0).toLowerCase() : w.charAt(0).toUpperCase()) + w.slice(1))
    .join("");
  return /^[0-9]/.test(id) || !id ? `c${id}` : id;
};

/** `const name = ['color', ...];` per scale. */
export function asJs(scales: Scale[], format: Format): string {
  return scales
    .map(
      (s) =>
        `const ${ident(s.name)} = [${tailwind.shades.map((_, i) => `'${swatchValue(s, i, format)}'`).join(", ")}];`,
    )
    .join("\n");
}

/** Tailwind v4 `@theme` block: `--color-<name>-<shade>: value;` */
export function asCss(scales: Scale[], format: Format): string {
  const lines = scales.flatMap((s) =>
    tailwind.shades.map(
      (sh, i) => `  --color-${slug(s.name)}-${sh}: ${swatchValue(s, i, format)};`,
    ),
  );
  return `@theme {\n${lines.join("\n")}\n}`;
}

export function asJson(scales: Scale[], format: Format): string {
  const out: Record<string, Record<string, string>> = {};
  for (const s of scales) {
    out[s.name] = Object.fromEntries(
      tailwind.shades.map((sh, i) => [sh, swatchValue(s, i, format)]),
    );
  }
  return JSON.stringify(out, null, 2);
}

export const EXPORTERS = [
  { label: "As text", fn: asText },
  { label: "As JS arrays", fn: asJs },
  { label: "As CSS variables (Tailwind)", fn: asCss },
  { label: "As JSON", fn: asJson },
];
