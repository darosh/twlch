<script lang="ts">
  import { tailwind } from "@darosh/twlch";
  import * as ToggleGroup from "$lib/components/ui/toggle-group";
  import { copy } from "$lib/copy.ts";
  import { store, swatchValue } from "$lib/store.svelte.ts";
  import type { Scale } from "$lib/store.svelte.ts";

  // One tooltip for the whole grid: it glides between swatches and only fades out when the
  // pointer leaves the grid, so crossing the gaps never flashes it.
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
  <div class="mb-2 flex flex-wrap items-end justify-between gap-3">
    <div>
      <h2 class="display text-2xl mb-4">Swatches</h2>
      <p class="text-sm text-muted-foreground">Sorted by hue. Click a swatch to copy its value, a name to copy the whole scale, one color per line.</p>
    </div>
    <ToggleGroup.Root type="single" variant="outline" size="sm" bind:value={store.copyFormat} aria-label="Copy format">
      <ToggleGroup.Item value="oklch">oklch</ToggleGroup.Item>
      <ToggleGroup.Item value="hex">hex</ToggleGroup.Item>
    </ToggleGroup.Root>
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
    {#each store.scales as s (s.id)}
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
              class="aspect-square w-full rounded-[5px] ring-offset-background outline-none focus-visible:ring-2 focus-visible:ring-ring"
              style:background={hx}
              aria-label="{s.name} {tailwind.shades[i]} {hx}"
              onpointerenter={(e) => show(e, s, i)}
              onclick={() => copy(swatchValue(s, i, store.copyFormat))}
            ></button>
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
