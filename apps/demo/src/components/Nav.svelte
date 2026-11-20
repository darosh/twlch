<script lang="ts">
  import MoonIcon from "@lucide/svelte/icons/moon";
  import SunIcon from "@lucide/svelte/icons/sun";
  import Tip from "./Tip.svelte";
  import { theme } from "$lib/theme.svelte.ts";

  const links = [
    { id: "swatches", label: "Swatches" },
    { id: "curves", label: "Curves" },
    { id: "model", label: "3D" },
    { id: "usage", label: "Usage" },
  ];
  const go = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
</script>

<header class="flex h-14 shrink-0 items-center gap-6 border-b px-4">
  <button class="display text-2xl leading-none" onclick={() => document.getElementById("content")?.scrollTo({ top: 0, behavior: "smooth" })}>twlch</button>
  <span class="hidden text-sm text-muted-foreground md:inline">Tailwind scales interpolation</span>
  <nav class="ml-auto flex items-center gap-1">
    {#each links as l}
      <button class="rounded-md px-2.5 py-1 text-sm text-muted-foreground hover:bg-muted hover:text-foreground" onclick={() => go(l.id)}>{l.label}</button>
    {/each}
    <Tip label="Switch to {theme.value === 'dark' ? 'light' : 'dark'} theme">
      {#snippet children(tp)}
        <button
          {...tp}
          class="ml-1 rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
          onclick={() => theme.toggle()}
          aria-label="Switch to {theme.value === 'dark' ? 'light' : 'dark'} theme"
        >
          {#if theme.value === "dark"}<SunIcon class="size-5" />{:else}<MoonIcon class="size-5" />{/if}
        </button>
      {/snippet}
    </Tip>
    <Tip label="twlch on GitHub">
    {#snippet children(tp)}
    <a
      {...tp}
      class="ml-1 rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
      href="https://github.com/darosh/twlch"
      target="_blank"
      rel="noopener"
      aria-label="twlch on GitHub"
    >
      <svg class="size-5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M12 .5a11.5 11.5 0 0 0-3.64 22.41c.58.1.79-.25.79-.56v-2c-3.2.7-3.88-1.37-3.88-1.37-.52-1.33-1.28-1.69-1.28-1.69-1.04-.71.08-.7.08-.7 1.15.08 1.76 1.19 1.76 1.19 1.03 1.76 2.7 1.25 3.36.96.1-.75.4-1.25.73-1.54-2.55-.29-5.24-1.28-5.24-5.69 0-1.26.45-2.28 1.19-3.09-.12-.29-.52-1.46.11-3.05 0 0 .97-.31 3.17 1.18a11 11 0 0 1 5.78 0c2.2-1.49 3.17-1.18 3.17-1.18.63 1.59.23 2.76.11 3.05.74.81 1.19 1.83 1.19 3.09 0 4.42-2.7 5.4-5.26 5.68.41.36.78 1.06.78 2.14v3.17c0 .31.21.67.8.56A11.5 11.5 0 0 0 12 .5Z" />
      </svg>
    </a>
    {/snippet}
    </Tip>
  </nav>
</header>
