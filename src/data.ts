import { chromatic, neutral, shades, tailwindVersion } from "./data.generated.ts";

export type Family = { name: string; l: number[]; c: number[]; h: number[] };
export type TailwindData = {
  tailwind: string;
  shades: number[];
  chromatic: Family[];
  neutral: Family[];
};

export {
  chromatic,
  chromaticHues,
  neutral,
  neutralHues,
  shades,
  tailwindVersion,
} from "./data.generated.ts";

export const tailwind: TailwindData = { tailwind: tailwindVersion, shades, chromatic, neutral };
