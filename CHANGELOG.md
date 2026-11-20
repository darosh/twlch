# Changelog

## [0.2.0](../../releases/tag/v0.2.0) - 2026-11-20

Changes since [v0.1.0](../../releases/tag/v0.1.0).

### Library (`@darosh/twlch`)

- added `fourier` and `epicycles` options: compute the chromatic scales from fitted closed-form models instead of interpolating the Tailwind families
- added `fourierAt(shade, hue)` and `epicyclesAt(shade, hue)`, plus curve/hue/source helpers; the models are plain generated code with shade as a real parameter
- added `result.shade(n)` to read any shade from 50 to 950 (from the model function for computed sets)
- added `@darosh/twlch/fourier` and `@darosh/twlch/epicycles` entry points, with browser builds
- added `fit:fourier` and `fit:epicycles` scripts to refit the models
- changed core scale logic moved into `model.ts`; `createTwlch` and `CurveSource` are exported
- fixed `match` mode: chroma `delta` now also scales the matched shade, so the whole scale moves together instead of kinking at the anchor (the matched shade equals the input colour only at `delta` 0)
- changed the Tailwind data is now typed constants in `src/data.generated.ts` (`shades`, `chromatic`, `neutral`, `chromaticHues`, `neutralHues`, `tailwindVersion`) instead of a parsed JSON string, so unused parts tree-shake; `tailwind.generated.ts` is gone
- changed `dist/` is unbundled and mirrors `src/` (no hashes in file names); entries are `index.ts`, `index-browser.ts`, `index-fourier.ts`, `index-epicycles.ts`, and the models moved from `models/` to `calc.fourier.ts`, `calc.epicycles.ts` (and `*.generated.ts`)
- changed browser builds moved to `dist/browser/`, named by brand and target: `twlch.bundle.module.min.js` (ES module, bundles colorjs.io) and `twlch.global.min.js` (`<script>`, expects colorjs.io's global build), likewise `twlch-fourier.*` and `twlch-epicycles.*`. Package `exports` keys are unchanged; direct `dist/twlch.*` URLs are not

### Demo app

- added dark/light theme switch in the header: dark by default, remembers the choice, and themes the plots too
- added tooltips to the icon buttons
- added "as JS arrays" copy format (`const name = ['color', ...];`)
- changed "as text" copy format to the name on its own line followed by one color per line
- changed "Copy scale" in the editor to offer the same formats as the panel copy menu
- changed light theme headings and icons to 80% opacity
- changed custom scales to be shared by the chromatic, fourier and epicycles datasets (neutral keeps its own)
- changed 3D guides of the neutral dataset to straight lines from each point to the neutral axis
- added filter menu in the right panel (All / Factory / Custom, default All), applied to the list, swatches and charts
- added copy menu in the right panel: shown scales as text, Tailwind v4 CSS variables (`@theme`) or JSON
- added share button in the right panel: copies a link encoding dataset, filter, copy format, plot space and custom scales (compact, deflate-compressed, base64url in the URL hash); opening it restores the state
- added fourier and epicycles datasets
- changed interpolation choice to a button group instead of a dropdown
- changed 2D plot to a proportional 0–1000 shade axis with a fixed 0.4 chroma axis floor
- changed smooth lines and 3D guide rings of computed scales to sample the model function directly
- fixed clicking the selected item of a single-choice button group leaving nothing selected
