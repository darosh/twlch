import type { Theme } from "./palette.ts";

const KEY = "twlch-theme";

function initial(): Theme {
  try {
    const s = localStorage.getItem(KEY);
    if (s === "dark" || s === "light") return s;
  } catch {
    // storage unavailable
  }
  return "dark";
}

function apply(t: Theme) {
  document.documentElement.classList.toggle("dark", t === "dark");
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute("content", t === "dark" ? "#0a0a0a" : "#ffffff");
}

class ThemeStore {
  value = $state<Theme>(initial());
  constructor() {
    apply(this.value);
  }
  toggle() {
    this.value = this.value === "dark" ? "light" : "dark";
    apply(this.value);
    try {
      localStorage.setItem(KEY, this.value);
    } catch {
      // ignore
    }
  }
}

export const theme = new ThemeStore();
