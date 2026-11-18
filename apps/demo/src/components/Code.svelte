<script lang="ts">
  import CopyIcon from "@lucide/svelte/icons/copy";
  import { Button } from "$lib/components/ui/button";
  import { copy } from "$lib/copy.ts";

  let { code, lang = "ts" }: { code: string; lang?: string } = $props();
</script>

<div class="group relative rounded-xl border bg-muted/40">
  <Button variant="ghost" size="icon-xs" class="absolute top-2 right-2 opacity-0 group-hover:opacity-100" aria-label="Copy code" onclick={() => copy(code, "Copied code")}>
    <CopyIcon />
  </Button>
  <pre class="overflow-x-auto p-4 text-[13px] leading-relaxed" data-lang={lang}><code class="font-mono">{code}</code></pre>
</div>
