import type { Interpolation } from "@darosh/twlch";

export const INTERPOLATIONS: { value: Interpolation; label: string }[] = [
  { value: "smooth", label: "smooth" },
  { value: "linear", label: "linear" },
];
export const interpolationLabel = (v: Interpolation) =>
  INTERPOLATIONS.find((i) => i.value === v)?.label ?? v;
