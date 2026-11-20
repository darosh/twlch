<script lang="ts">
  import { twlchAnchors } from "@darosh/twlch";
  import { toast } from "svelte-sonner";
  import { Button } from "$lib/components/ui/button";
  import * as Dialog from "$lib/components/ui/dialog";
  import * as ToggleGroup from "$lib/components/ui/toggle-group";
  import { INTERPOLATIONS } from "$lib/interpolation.ts";
  import { libDataset, store } from "$lib/store.svelte.ts";
  import type { Interpolation } from "@darosh/twlch";

  let { open = $bindable(false) }: { open: boolean } = $props();
  let n = $state("1");
  let interpolation = $state<Interpolation>("smooth");

  const pairs = $derived(twlchAnchors(libDataset(store.dataset).dataset, interpolation, libDataset(store.dataset).generator).length);
  const total = $derived(pairs * Number(n));

  function apply() {
    const made = store.bulkAdd(Number(n), interpolation);
    toast.success(made ? `Added ${made} scales` : "Removed generated scales");
    open = false;
  }
</script>

<Dialog.Root bind:open>
  <Dialog.Content class="sm:max-w-md">
    <Dialog.Header>
      <Dialog.Title>Bulk interpolation</Dialog.Title>
      <Dialog.Description>
        Interpolate new scales around the hue wheel, evenly between each pair of neighbouring {store.dataset} Tailwind scales. Running this again replaces the previous batch.
      </Dialog.Description>
    </Dialog.Header>
    <div class="flex flex-col gap-3">
      <span class="text-sm">Scales between each pair</span>
      <ToggleGroup.Root type="single" variant="outline" bind:value={() => n, (v) => v && (n = v)} class="w-full">
        {#each ["0", "1", "2", "3"] as v}
          <ToggleGroup.Item value={v} class="flex-1">{v}</ToggleGroup.Item>
        {/each}
      </ToggleGroup.Root>
      <span class="text-sm">Interpolation across hue</span>
      <ToggleGroup.Root type="single" variant="outline" class="w-full" bind:value={() => interpolation, (v) => v && (interpolation = v as Interpolation)}>
        {#each INTERPOLATIONS as it}
          <ToggleGroup.Item value={it.value} class="flex-1">{it.label}</ToggleGroup.Item>
        {/each}
      </ToggleGroup.Root>
      <p class="text-sm text-muted-foreground">
        {#if total}{pairs} pairs × {n} = <b class="text-foreground">{total}</b> new scales ({pairs + total} in total){:else}Removes previously generated scales.{/if}
      </p>
    </div>
    <Dialog.Footer>
      <Button variant="ghost" onclick={() => (open = false)}>Cancel</Button>
      <Button onclick={apply}>{total ? `Add ${total}` : "Apply"}</Button>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>
