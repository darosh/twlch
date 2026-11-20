<script lang="ts">
  import { Toaster } from "$lib/components/ui/sonner";
  import * as Tooltip from "$lib/components/ui/tooltip";
  import Nav from "./components/Nav.svelte";
  import ScaleEditor from "./components/ScaleEditor.svelte";
  import ScaleList from "./components/ScaleList.svelte";
  import Swatches from "./components/Swatches.svelte";
  import PlotSection from "./components/PlotSection.svelte";
  import Usage from "./components/Usage.svelte";
  import { toast } from "svelte-sonner";
  import { theme } from "$lib/theme.svelte.ts";
  import { readHash } from "$lib/share.ts";

  readHash().then((ok) => {
    if (ok === false) toast.error("Couldn't read the shared link");
    else if (ok) toast.success("Loaded shared state");
  });
</script>

<Tooltip.Provider>
<div class="flex h-screen flex-col">
  <Nav />
  <div class="flex min-h-0 flex-1">
    <aside class="w-72 shrink-0 overflow-y-auto border-r bg-sidebar"><ScaleEditor /></aside>
    <main id="content" class="min-w-0 flex-1 overflow-y-auto">
      <div class="mx-auto flex max-w-5xl flex-col gap-16 p-8">
        <Swatches />
        <PlotSection kind="2d" title="Curves" blurb="Lightness, chroma and hue for every scale across the 11 shades." />
        <PlotSection kind="3d" title="3D" blurb="The same curves in the color space. Drag to orbit; guides join each shade across scales (or each point to the neutral axis)." />
        <Usage />
      </div>
    </main>
    <aside class="w-80 shrink-0 border-l bg-sidebar"><ScaleList /></aside>
  </div>
</div>
</Tooltip.Provider>
<Toaster theme={theme.value} />
