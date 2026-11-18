<script lang="ts">
  export type Row = { label: string; colors: { hex: string; title: string }[] };
  let { rows }: { rows: Row[] } = $props();
</script>

<!-- Half-size swatches (18px) showing what the code above returns. -->
<div class="mt-1 flex flex-col gap-1.5 px-1">
  {#each rows as row}
    <div class="flex items-center gap-3">
      <span class="w-47 shrink-0 truncate font-mono text-[11px] text-muted-foreground" title={row.label}>{row.label}</span>
      <div class="flex flex-wrap gap-0.5">
        {#each row.colors as c}
          <i class="block size-[18px] rounded-[3px]" style:background={c.hex} title={c.title}></i>
        {/each}
      </div>
    </div>
  {/each}
</div>
