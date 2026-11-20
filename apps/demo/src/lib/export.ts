import { tailwind } from "@darosh/twlch";
import { swatchValue } from "./store.svelte.ts";
import type { Scale } from "./store.svelte.ts";

type Format = "hex" | "oklch";

const slug = (name: string) =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "color";

/** One scale per line: `name: 50 value, 100 value, ...` */
export function asText(scales: Scale[], format: Format): string {
  return scales
    .map(
      (s) =>
        `${s.name}: ${tailwind.shades.map((sh, i) => `${sh} ${swatchValue(s, i, format)}`).join(", ")}`,
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
