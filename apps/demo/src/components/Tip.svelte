<script lang="ts">
  import type { Snippet } from "svelte";
  import * as Tooltip from "$lib/components/ui/tooltip";

  /** Tooltip around any trigger: the child gets the trigger props to spread onto its element. */
  let { label, children }: { label: string; children: Snippet<[Record<string, unknown>]> } = $props();
</script>

<Tooltip.Root>
  <Tooltip.Trigger>
    {#snippet child({ props })}
      {@render children(props)}
    {/snippet}
  </Tooltip.Trigger>
  <Tooltip.Content>{label}</Tooltip.Content>
</Tooltip.Root>
