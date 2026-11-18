import Color from "colorjs.io";
import { closest } from "colornames-oklab";

/** Nearest colornames-oklab name for any CSS colour. */
export function colorName(css: string): string {
  const [l, a, b] = new Color(css).to("oklab").coords;
  return closest([l ?? 0, a ?? 0, b ?? 0]).name;
}

/** Make a name unique within `taken` by appending a number. */
export function uniqueName(name: string, taken: Set<string>): string {
  if (!taken.has(name)) return name;
  let i = 2;
  while (taken.has(`${name} ${i}`)) i++;
  return `${name} ${i}`;
}
