export type Theme = "dark" | "light";

/** Plot colours per theme (the DOM follows the CSS variables in app.css). */
export const PALETTES = {
  dark: {
    bg: 0x0f1115,
    panel: 0x151922,
    gridH: 0x232a36,
    gridV: 0x1c222d,
    grid3d: 0x2a3241,
    axisLabel: 0x9aa4b2,
    label: 0xd6dbe4,
    label3d: 0x7d8899,
    guide: 0x555555,
    readoutBg: 0x000000,
    readoutText: 0xffffff,
  },
  light: {
    bg: 0xfafafa,
    panel: 0xf0f1f4,
    gridH: 0xdde1e8,
    gridV: 0xe6e9ee,
    grid3d: 0xcfd5de,
    axisLabel: 0x5b6573,
    label: 0x2a303a,
    label3d: 0x6b7585,
    guide: 0xb4bbc7,
    readoutBg: 0xffffff,
    readoutText: 0x111111,
  },
} satisfies Record<Theme, Record<string, number>>;

export const hexOfNum = (n: number) => "#" + n.toString(16).padStart(6, "0");
