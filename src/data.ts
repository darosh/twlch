import data from "./tailwind.generated.ts";

export type Family = { name: string; l: number[]; c: number[]; h: number[] };
export type TailwindData = {
  tailwind: string;
  shades: number[];
  chromatic: Family[];
  neutral: Family[];
};

export const tailwind: TailwindData = data;
