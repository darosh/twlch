<script lang="ts">
  import { mergeProps } from "bits-ui";
  import CopyIcon from "@lucide/svelte/icons/copy";
  import { Button } from "$lib/components/ui/button";
  import * as Popover from "$lib/components/ui/popover";
  import { copy } from "$lib/copy.ts";
  import { EXPORTERS } from "$lib/export.ts";
  import { store } from "$lib/store.svelte.ts";
  import type { Scale } from "$lib/store.svelte.ts";
  import Tip from "./Tip.svelte";

  let { scales, label, text = "" }: { scales: Scale[]; label: string; text?: string } = $props();
  let open = $state(false);

  function exportAs(fn: (typeof EXPORTERS)[number]["fn"], name: string) {
    open = false;
    const n = scales.length;
    copy(fn(scales, store.copyFormat), `Copied ${n === 1 ? scales[0].name : `${n} scales`} ${name.toLowerCase()}`);
  }
</script>

<Popover.Root bind:open>
  <Tip {label}>
    {#snippet children(tp)}
      <Popover.Trigger>
        {#snippet child({ props })}
          {#if text}
            <Button {...mergeProps(tp, props)} variant="secondary" class="flex-1" disabled={scales.length === 0}><CopyIcon data-icon="inline-start" /> {text}</Button>
          {:else}
            <Button {...mergeProps(tp, props)} variant="ghost" size="icon-sm" aria-label={label} disabled={scales.length === 0}><CopyIcon /></Button>
          {/if}
        {/snippet}
      </Popover.Trigger>
    {/snippet}
  </Tip>
  <Popover.Content align="end" class="w-56 gap-1 p-1">
    {#each EXPORTERS as e}
      <Button variant="ghost" class="justify-start" onclick={() => exportAs(e.fn, e.label)}>{e.label}</Button>
    {/each}
  </Popover.Content>
</Popover.Root>
