import { defineConfig } from "vite-plus";
import type { PackUserConfig } from "vite-plus/pack";

const browserBuilds = (prefix: string, entry: string, globalName: string): PackUserConfig[] => {
  const common = {
    platform: "browser" as const,
    minify: true,
    dts: false,
    clean: false,
    hash: false,
    outDir: "dist/browser",
    outputOptions: { entryFileNames: "[name].js" },
  };
  return [
    {
      ...common,
      entry: { [`${prefix}.bundle.module.min`]: entry },
      format: "esm" as const,
      deps: { alwaysBundle: ["colorjs.io"], onlyBundle: ["colorjs.io"] },
    },
    {
      ...common,
      entry: { [`${prefix}.global.min`]: entry },
      format: "iife" as const,
      globalName,
      // <script> builds expect colorjs.io's own global build (https://colorjs.io/dist/color.global.js)
      deps: { neverBundle: ["colorjs.io"] },
      outputOptions: { ...common.outputOptions, globals: { "colorjs.io": "Color" } },
    },
  ];
};

export default defineConfig({
  staged: {
    "*": "vp check --fix",
  },
  test: {
    include: ["tests/**/*.test.ts"],
  },
  pack: [
    // The library: one file per source module (dist mirrors src), so bundlers can tree-shake it.
    {
      entry: [
        "src/index.ts",
        "src/index-fourier.ts",
        "src/index-epicycles.ts",
        "src/index-browser.ts",
      ],
      unbundle: true,
      root: "src",
      hash: false,
      dts: true,
      exports: false,
    },
    // Browser builds, in dist/browser/. `twlch.bundle.module.min.js` is an ES module that inlines colorjs.io;
    // `twlch.global.min.js` is a <script> build that expects colorjs.io's own global build (`Color`).
    ...browserBuilds("twlch", "src/index-browser.ts", "twlch"),
    // Single-model builds: no Tailwind data tables, a fraction of the size.
    ...browserBuilds("twlch-fourier", "src/index-fourier.ts", "twlchFourier"),
    ...browserBuilds("twlch-epicycles", "src/index-epicycles.ts", "twlchEpicycles"),
  ],
  fmt: {
    ignorePatterns: [
      "src/data.generated.ts",
      "src/calc.fourier.generated.ts",
      "src/calc.epicycles.generated.ts",
    ],
  },
  lint: {
    ignorePatterns: ["apps/demo/src/lib/components/ui/**"],
    jsPlugins: [{ name: "vite-plus", specifier: "vite-plus/oxlint-plugin" }],
    rules: { "vite-plus/prefer-vite-plus-imports": "error" },
    options: { typeAware: true, typeCheck: true },
  },
  run: {
    cache: true,
  },
});
