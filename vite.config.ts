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
      entry: "src/index.ts",
      dts: true,
      exports: false,
    },
    // Standalone browser builds with colorjs.io inlined, for CDNs and <script> tags.
    {
      entry: { "twlch.browser": "src/index.ts" },
      format: "esm",
      platform: "browser",
      minify: true,
      dts: false,
      clean: false,
      deps: { alwaysBundle: ["colorjs.io"] },
    },
    {
      entry: { "twlch.browser": "src/index.ts" },
      format: "iife",
      globalName: "twlch",
      platform: "browser",
      minify: true,
      dts: false,
      clean: false,
      deps: { alwaysBundle: ["colorjs.io"] },
    },
  ],
  fmt: {
    ignorePatterns: ["src/tailwind.generated.ts"],
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
