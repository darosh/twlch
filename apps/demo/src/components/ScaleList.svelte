<script lang="ts">
  import PlusIcon from "@lucide/svelte/icons/plus";
  import RotateCcwIcon from "@lucide/svelte/icons/rotate-ccw";
  import TrashIcon from "@lucide/svelte/icons/trash-2";
  import { Button } from "$lib/components/ui/button";
  import * as Popover from "$lib/components/ui/popover";
  import * as ToggleGroup from "$lib/components/ui/toggle-group";
  import { Separator } from "$lib/components/ui/separator";
  import { DATASETS, FILTERS, store } from "$lib/store.svelte.ts";
  import CheckIcon from "@lucide/svelte/icons/check";
  import CopyIcon from "@lucide/svelte/icons/copy";
  import FilterIcon from "@lucide/svelte/icons/filter";
  import ShareIcon from "@lucide/svelte/icons/share-2";
  import { copy } from "$lib/copy.ts";
  import { asCss, asJson, asText } from "$lib/export.ts";
  import { shareUrl } from "$lib/share.ts";
  import type { Dataset } from "$lib/store.svelte.ts";
  import BulkDialog from "./BulkDialog.svelte";

  let menu = $state(false);
  let bulk = $state(false);
  let filterMenu = $state(false);
  let copyMenu = $state(false);

  const exporters = [
    { label: "As text", fn: asText },
    { label: "As CSS variables (Tailwind)", fn: asCss },
    { label: "As JSON", fn: asJson },
  ];

  function exportAs(fn: typeof asText, label: string) {
    copyMenu = false;
    const n = store.visible.length;
    copy(fn(store.visible, store.copyFormat), `Copied ${n} scale${n === 1 ? "" : "s"} ${label.toLowerCase()}`);
  }

  async function share() {
    copy(await shareUrl(store.snapshot()), "Link copied");
  }
</script>

<div class="flex h-full flex-col">
  <div class="flex items-center justify-between gap-2 p-4 pb-3">
    <h2 class="display text-lg">Scales</h2>
    <div class="flex items-center gap-1.5">
      <Popover.Root bind:open={filterMenu}>
        <Popover.Trigger>
          {#snippet child({ props })}
            <Button {...props} variant="ghost" size="icon-sm" class="relative" aria-label="Filter scales" title="Filter: {store.filter}">
              <FilterIcon />
              {#if store.filter !== "all"}<i class="absolute right-0.5 top-0.5 size-1.5 rounded-full bg-primary"></i>{/if}
            </Button>
          {/snippet}
        </Popover.Trigger>
        <Popover.Content align="end" class="w-40 gap-1 p-1">
          {#each FILTERS as f}
            <Button
              variant="ghost"
              class="justify-between capitalize"
              onclick={() => {
                store.filter = f;
                filterMenu = false;
              }}>{f}{#if store.filter === f}<CheckIcon />{/if}</Button
            >
          {/each}
        </Popover.Content>
      </Popover.Root>
      <Popover.Root bind:open={copyMenu}>
        <Popover.Trigger>
          {#snippet child({ props })}
            <Button {...props} variant="ghost" size="icon-sm" aria-label="Copy scales" title="Copy shown scales" disabled={store.visible.length === 0}>
              <CopyIcon />
            </Button>
          {/snippet}
        </Popover.Trigger>
        <Popover.Content align="end" class="w-56 gap-1 p-1">
          {#each exporters as e}
            <Button variant="ghost" class="justify-start" onclick={() => exportAs(e.fn, e.label)}>{e.label}</Button>
          {/each}
        </Popover.Content>
      </Popover.Root>
      <Button variant="ghost" size="icon-sm" aria-label="Share link" title="Copy a link to this state" onclick={share}>
        <ShareIcon />
      </Button>
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label="Clear added scales"
        title="Remove the scales you added to this dataset"
        disabled={store.mine.length === 0}
        onclick={() => store.clearCustom()}
      >
        <RotateCcwIcon />
      </Button>
      <Popover.Root bind:open={menu}>
        <Popover.Trigger>
          {#snippet child({ props })}
            <Button {...props} size="icon-sm" aria-label="Add scale"><PlusIcon /></Button>
          {/snippet}
        </Popover.Trigger>
        <Popover.Content align="end" class="w-56 gap-1 p-1">
          <Button
            variant="ghost"
            class="justify-start"
            onclick={() => {
              store.addColor();
              menu = false;
            }}>From a color</Button
          >
          <Button
            variant="ghost"
            class="justify-start"
            onclick={() => {
              menu = false;
              bulk = true;
            }}>Bulk interpolation</Button
          >
        </Popover.Content>
      </Popover.Root>
    </div>
  </div>

  <div class="flex flex-col gap-1.5 px-4 pb-3">
<!--    <Label class="text-xs text-muted-foreground">dataset</Label>-->
    <ToggleGroup.Root type="single" variant="outline" size="sm" class="w-full" bind:value={() => store.dataset, (v) => v && (store.dataset = v as Dataset)}>
      {#each DATASETS as d}
        <ToggleGroup.Item value={d} class="flex-0.1">{d}</ToggleGroup.Item>
      {/each}
    </ToggleGroup.Root>
  </div>
  <Separator />

  <ul class="flex min-h-0 flex-1 flex-col overflow-y-auto p-2">
    {#each store.visible as s (s.id)}
      <li
        class="rounded-sm px-2 pb-2 hover:bg-muted {store.selectedId === s.id ? 'bg-muted' : ''} {store.hover && store.hover !== s.name ? 'opacity-50' : ''}"
        onpointerenter={() => (store.hover = s.name)}
        onpointerleave={() => (store.hover = null)}
      >
        <div class="flex h-6 items-center justify-between gap-2">
          <button
            class="min-w-0 flex-1 truncate text-left text-sm {s.kind !== 'tailwind' ? 'font-semibold' : ''}"
            onclick={() => (store.selectedId = store.selectedId === s.id ? null : s.id)}
          >
            {s.name}
          </button>
          {#if s.kind !== "tailwind"}
            <Button variant="ghost" size="icon-xs" aria-label="Remove {s.name}" onclick={() => store.remove(s.id)}>
              <TrashIcon />
            </Button>
          {/if}
        </div>
        <button
          class="flex h-2 w-full overflow-hidden rounded-sm"
          aria-label="Select {s.name}"
          onclick={() => (store.selectedId = store.selectedId === s.id ? null : s.id)}
        >
          {#each s.hex as hx}<i class="flex-1" style:background={hx}></i>{/each}
        </button>
      </li>
    {/each}
  </ul>
</div>

<BulkDialog bind:open={bulk} />
