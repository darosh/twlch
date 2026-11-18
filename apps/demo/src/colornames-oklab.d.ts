declare module "colornames-oklab" {
  export type NamedColor = {
    name: string;
    tier: "srgb" | "p3" | "rec2020";
    hex: string;
    oklab: [number, number, number];
  };
  export function closest(lab: [number, number, number]): NamedColor & { distance: number };
  const colors: NamedColor[];
  export default colors;
}
