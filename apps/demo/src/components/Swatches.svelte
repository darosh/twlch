<script lang="ts">
  import { tailwind } from "@darosh/twlch";
  import * as ToggleGroup from "$lib/components/ui/toggle-group";
  import { Switch } from "$lib/components/ui/switch";
  import { Label } from "$lib/components/ui/label";
  import { labelContrast } from "$lib/color.ts";
  import { copy } from "$lib/copy.ts";
  import { store, swatchValue } from "$lib/store.svelte.ts";
  import type { Scale } from "$lib/store.svelte.ts";

  // One tooltip for the whole grid: it glides between swatches and only fades out when the
  // pointer leaves the grid, so crossing the gaps never flashes it.
  // Label each swatch with its shade number: black on 50-500, white on 600-950.
  let contrast = $state(false);
  // Swatches whose label contrast falls below this get a warning icon.
  let threshold = $state("4.5");

  let tip = $state<{ x: number; y: number; scale: Scale; i: number } | null>(null);
  let visible = $state(false);
  let glide = $state(false);

  function show(e: PointerEvent, scale: Scale, i: number) {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    tip = { x: r.left + r.width / 2, y: r.top - 6, scale, i };
    if (!visible) {
      glide = false; // appear in place instead of sliding in from wherever it last was
      visible = true;
      requestAnimationFrame(() => (glide = true));
    }
    store.hover = scale.name;
  }
  function hide() {
    visible = false;
    store.hover = null;
  }
  const copyAll = (s: Scale) =>
    copy(s.hex.map((_, i) => swatchValue(s, i, store.copyFormat)).join("\n"), `Copied ${s.name} (${s.hex.length} colors)`);
</script>

<section id="swatches" class="flex flex-col gap-4 scroll-mt-16">
  <div class="mb-2">
    <div class="mb-4 flex items-center justify-between gap-x-4 gap-y-2">
      <h2 class="display text-2xl">Swatches</h2>
      <div class="flex flex-wrap items-center justify-end gap-x-4 gap-y-2">
      <div class="flex items-center gap-2">
        <Switch id="contrast" bind:checked={contrast} />
        <Label for="contrast" class="text-xs">contrast</Label>
      </div>
      <ToggleGroup.Root type="single" variant="outline" size="sm" bind:value={() => threshold, (v) => v && (threshold = v)} aria-label="Contrast warning threshold" disabled={!contrast}>
        <ToggleGroup.Item value="3">3</ToggleGroup.Item>
        <ToggleGroup.Item value="4.5">4.5</ToggleGroup.Item>
        <ToggleGroup.Item value="7">7</ToggleGroup.Item>
      </ToggleGroup.Root>
      <ToggleGroup.Root type="single" variant="outline" size="sm" bind:value={() => store.copyFormat, (v) => v && (store.copyFormat = v as "hex" | "oklch")} aria-label="Copy format">
        <ToggleGroup.Item value="oklch">oklch</ToggleGroup.Item>
        <ToggleGroup.Item value="hex">hex</ToggleGroup.Item>
      </ToggleGroup.Root>
      </div>
    </div>
    <p class="text-sm text-muted-foreground">Sorted by hue. Click a swatch to copy its value, a name to copy the whole scale, one color per line.</p>
  </div>

  <div class="flex flex-col gap-1" role="presentation" onpointerleave={hide}>
    <div class="flex items-center gap-1">
      <span class="w-32 shrink-0"></span>
      <div class="grid gap-1" style="grid-template-columns: repeat(11, minmax(0, 36px))">
        {#each tailwind.shades as shade}
          <span class="tnum text-center text-[10px] text-muted-foreground">{shade}</span>
        {/each}
      </div>
    </div>
    {#each store.visible as s (s.id)}
      <div
        class="flex items-center gap-1 rounded-md py-0.5 transition-opacity {store.hover && store.hover !== s.name ? 'opacity-40' : ''} {store.selectedId === s.id ? 'bg-muted/60' : ''}"
      >
        <button
          class="w-32 shrink-0 truncate text-left text-sm hover:underline {s.kind !== 'tailwind' ? 'font-semibold' : ''}"
          title="Copy all {s.hex.length} colors"
          onclick={() => copyAll(s)}
          onpointerenter={() => (store.hover = s.name)}
          onpointerleave={() => (store.hover = null)}
        >
          {s.name}
        </button>
        <div class="grid gap-1" style="grid-template-columns: repeat(11, minmax(0, 36px))">
          {#each s.hex as hx, i}
            <button
              class="tnum relative aspect-square w-full rounded-[5px] text-[10px] font-medium ring-offset-background outline-none focus-visible:ring-2 focus-visible:ring-ring"
              style:background={hx}
              style:color={i < 6 ? "#000" : "#fff"}
              aria-label="{s.name} {tailwind.shades[i]} {hx}"
              onpointerenter={(e) => show(e, s, i)}
              onclick={() => copy(swatchValue(s, i, store.copyFormat))}
            >{#if contrast}{tailwind.shades[i]}{#if labelContrast(parseInt(hx.slice(1), 16), i) < Number(threshold)}<svg class="absolute top-[1px] right-[2px] size-[1.12em]" viewBox="0 0 24 24" stroke="none" fill="currentColor" stroke-width="0"  aria-hidden="true"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/></svg>{/if}{/if}</button>
          {/each}
        </div>
      </div>
    {/each}
  </div>
</section>

<svelte:window onscrollcapture={hide} />

<div
  class="pointer-events-none fixed top-0 left-0 z-50 w-max min-w-28 rounded-md bg-foreground px-2.5 py-1.5 text-xs text-background shadow-md {glide ? 'transition-[transform,opacity] duration-150 ease-out' : 'transition-opacity duration-150'} {visible ? 'opacity-100' : 'opacity-0'}"
  style:transform={tip ? `translate3d(${tip.x}px, ${tip.y}px, 0) translate(-50%, -100%)` : undefined}
>
  {#if tip}
    <div class="flex items-baseline justify-between gap-4">
      <span class="font-medium">{tip.scale.name}</span>
      <span class="tnum font-semibold">{tailwind.shades[tip.i]}</span>
    </div>
    <div class="tnum mt-0.5 opacity-80">{swatchValue(tip.scale, tip.i, store.copyFormat)}</div>
  {/if}
</div>
