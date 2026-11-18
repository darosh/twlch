<script lang="ts">
  import { tailwind } from "twlch";
  import { untrack } from "svelte";
  import * as Select from "$lib/components/ui/select";
  import { Switch } from "$lib/components/ui/switch";
  import { Label } from "$lib/components/ui/label";
  import { CurvePlot } from "$lib/plot.ts";
  import type { PlotOptions } from "$lib/plot.ts";
  import { Plot3D } from "$lib/plot3d.ts";
  import { hueGaps, SPACES } from "$lib/spaces.ts";
  import { store } from "$lib/store.svelte.ts";

  type Plot = { update(o: Partial<PlotOptions>): void; destroy(): Promise<void> };
  let { kind, title, blurb }: { kind: "2d" | "3d"; title: string; blurb: string } = $props();

  let host = $state<HTMLDivElement>();
  let plot = $state.raw<Plot>();

  const opts = () => ({
    families: store.plotFamilies,
    space: store.spaceInfo,
    colors: store.colors,
    hover: store.hover,
    smooth: store.smooth,
    guides: store.guides,
  });

  $effect(() => {
    if (!host) return;
    const el = host;
    const Ctor = kind === "2d" ? CurvePlot : Plot3D;
    const inst = untrack(
      () => new Ctor(el, { ...opts(), shades: tailwind.shades, onHover: (n) => (store.hover = n) }),
    );
    plot = inst;
    return () => {
      plot = undefined;
      void inst.destroy();
    };
  });
  $effect(() => {
    plot?.update(opts());
  });

  // How evenly the Tailwind families sit around the hue wheel in this space (lower CV = more even).
  const gaps = $derived.by(() => {
    if (kind !== "2d" || store.dataset !== "chromatic") return null;
    const own = store.plotFamilies.filter((_, i) => store.scales[i].kind === "tailwind");
    const all = tailwind.shades.map((_, i) => hueGaps(own, i));
    return { mean: all.reduce((a, g) => a + g.cv, 0) / all.length, s500: all[5], s950: all[10] };
  });
</script>

<section id={kind === "2d" ? "curves" : "model"} class="flex flex-col gap-3 scroll-mt-16">
  <div class="mb-2 flex flex-wrap items-end justify-between gap-3">
    <div>
      <h2 class="display text-2xl mb-4">{title}</h2>
      <p class="text-sm text-muted-foreground">{blurb}</p>
    </div>
    <div class="flex flex-wrap items-center gap-4">
      <div class="flex items-center gap-2">
        <Label class="text-xs text-muted-foreground">space</Label>
        <Select.Root type="single" bind:value={store.space}>
          <Select.Trigger size="sm" class="w-32">{store.spaceInfo.label}</Select.Trigger>
          <Select.Content>
            <Select.Group>
              {#each Object.values(SPACES) as sp}
                <Select.Item value={sp.id} label={sp.label}>{sp.label}</Select.Item>
              {/each}
            </Select.Group>
          </Select.Content>
        </Select.Root>
      </div>
      <div class="flex items-center gap-2">
        <Switch id="smooth-{kind}" bind:checked={store.smooth} />
        <Label for="smooth-{kind}" class="text-xs">smooth</Label>
      </div>
      {#if kind === "3d"}
        <div class="flex items-center gap-2">
          <Switch id="guides" bind:checked={store.guides} />
          <Label for="guides" class="text-xs">guides</Label>
        </div>
      {/if}
    </div>
  </div>
  {#if gaps}
    <p class="text-xs text-muted-foreground" title="Coefficient of variation of the hue gaps between neighbouring Tailwind families">
      hue spacing (gap CV, lower = more even) · mean <b class="text-foreground">{gaps.mean.toFixed(2)}</b> · @500 {gaps.s500.cv.toFixed(2)}
      (gaps {gaps.s500.min.toFixed(0)}–{gaps.s500.max.toFixed(0)}°) · @950 {gaps.s950.cv.toFixed(2)} (gaps {gaps.s950.min.toFixed(0)}–{gaps.s950.max.toFixed(0)}°)
    </p>
  {/if}
  <div
    bind:this={host}
    class="relative overflow-hidden rounded-xl border bg-[#0f1115] {kind === '2d' ? 'h-[560px]' : 'h-[600px]'}"
  ></div>
  {#if kind === "3d"}
    <p class="text-xs text-muted-foreground">Drag to orbit · hold <kbd class="rounded border px-1 font-mono text-[11px]">Shift</kbd> and scroll to zoom · right-drag to pan</p>
  {/if}
</section>
