import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import { defineConfig } from "vite-plus";

export default defineConfig({
  // Overridden to "/twlch/" by the gh-pages deploy script.
  base: process.env.TWLCH_BASE ?? "/",
  plugins: [tailwindcss(), svelte()],
  resolve: {
    alias: {
      $lib: fileURLToPath(new URL("./src/lib", import.meta.url)),
      // Use the library source directly so `vp dev` needs no rebuild of packages/twlch.
      twlch: fileURLToPath(new URL("../../src/index.ts", import.meta.url)),
    },
  },
});
