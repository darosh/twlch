import { defineConfig } from "vite-plus";

export default defineConfig({
  staged: {
    "*": "vp check --fix",
  },
  test: {
    include: ["tests/**/*.test.ts"],
  },
  pack: [
    {
      entry: ["src/index.ts", "src/fourier.ts", "src/epicycles.ts", "src/browser.ts"],
      dts: true,
      exports: false,
    },
    // Standalone browser builds. ESM inlines colorjs.io; the IIFE (<script>) builds use its `Color` global.
    {
      entry: { "twlch.browser": "src/browser.ts" },
      format: "esm",
      platform: "browser",
      minify: true,
      dts: false,
      clean: false,
      deps: { alwaysBundle: ["colorjs.io"], onlyBundle: ["colorjs.io"] },
    },
    {
      entry: { "twlch.browser": "src/browser.ts" },
      format: "iife",
      globalName: "twlch",
      platform: "browser",
      minify: true,
      dts: false,
      clean: false,
      // <script> builds expect colorjs.io's own global build (https://colorjs.io/dist/color.global.js)
      deps: { neverBundle: ["colorjs.io"] },
      outputOptions: { globals: { "colorjs.io": "Color" } },
    },
    // Standalone single-model builds: no Tailwind data tables, a fraction of the size.
    {
      entry: { "twlch.fourier.browser": "src/fourier.ts" },
      format: "esm",
      platform: "browser",
      minify: true,
      dts: false,
      clean: false,
      deps: { alwaysBundle: ["colorjs.io"], onlyBundle: ["colorjs.io"] },
    },
    {
      entry: { "twlch.fourier.browser": "src/fourier.ts" },
      format: "iife",
      globalName: "twlchFourier",
      platform: "browser",
      minify: true,
      dts: false,
      clean: false,
      // <script> builds expect colorjs.io's own global build (https://colorjs.io/dist/color.global.js)
      deps: { neverBundle: ["colorjs.io"] },
      outputOptions: { globals: { "colorjs.io": "Color" } },
    },
    {
      entry: { "twlch.epicycles.browser": "src/epicycles.ts" },
      format: "esm",
      platform: "browser",
      minify: true,
      dts: false,
      clean: false,
      deps: { alwaysBundle: ["colorjs.io"], onlyBundle: ["colorjs.io"] },
    },
    {
      entry: { "twlch.epicycles.browser": "src/epicycles.ts" },
      format: "iife",
      globalName: "twlchEpicycles",
      platform: "browser",
      minify: true,
      dts: false,
      clean: false,
      // <script> builds expect colorjs.io's own global build (https://colorjs.io/dist/color.global.js)
      deps: { neverBundle: ["colorjs.io"] },
      outputOptions: { globals: { "colorjs.io": "Color" } },
    },
  ],
  fmt: {
    ignorePatterns: [
      "src/tailwind.generated.ts",
      "src/models/fourier.generated.ts",
      "src/models/epicycles.generated.ts",
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
