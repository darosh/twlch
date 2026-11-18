<script lang="ts">
  import { tailwind } from "@darosh/twlch";
  import Color from "colorjs.io";
  import CopyIcon from "@lucide/svelte/icons/copy";
  import TrashIcon from "@lucide/svelte/icons/trash-2";
  import { Button } from "$lib/components/ui/button";
  import * as Field from "$lib/components/ui/field";
  import { Input } from "$lib/components/ui/input";
  import * as Select from "$lib/components/ui/select";
  import { Slider } from "$lib/components/ui/slider";
  import * as ToggleGroup from "$lib/components/ui/toggle-group";
  import { copy } from "$lib/copy.ts";
  import { INTERPOLATIONS, interpolationLabel } from "$lib/interpolation.ts";
  import type { Interpolation } from "@darosh/twlch";
  import { isValidColor, store, swatchValue } from "$lib/store.svelte.ts";

  const def = $derived(store.selectedDef);
  const scale = $derived(store.selected);

  // The hex field may hold half-typed text; only valid colours reach the store.
  let hexText = $state("");
  let lastId = "";
  $effect(() => {
    if (def?.kind === "color" && (def.id !== lastId || isValidColor(hexText) === false)) {
      if (def.id !== lastId) hexText = def.color;
      lastId = def.id;
    }
    if (!def) lastId = "";
  });

  function setColor(v: string) {
    hexText = v;
    if (def?.kind === "color" && isValidColor(v)) store.update(def.id, { color: v });
  }
  // <input type="color"> only takes #rrggbb, so convert any CSS colour (oklch(), hsl()…).
  function toHex(c: string): string {
    try {
      return new Color(c).to("srgb").toGamut({ space: "srgb" }).toString({ format: "hex", collapse: false });
    } catch {
      return "#000000";
    }
  }
  const shadeLabel = (shade: number | null) => (shade === null ? "auto" : String(shade));
</script>

<div class="flex flex-col gap-4 p-4">
  <h2 class="display text-lg">Edit</h2>

  {#if !scale}
    <p class="text-sm text-muted-foreground">
      Select a scale on the right to inspect it, or press <b class="text-foreground">+</b> to generate one from a color. Scales you add are editable and update everywhere live.
    </p>
  {:else if !def}
    <div class="flex flex-col gap-3">
      <div>
        <div class="font-semibold">{scale.name}</div>
        <div class="text-xs text-muted-foreground">Tailwind {tailwind.tailwind} · hue {scale.hue.toFixed(0)}°</div>
      </div>
      <div class="flex flex-col gap-0.5">
        {#each scale.hex as hx, i}
          <button class="tnum flex items-center gap-2 rounded px-1 py-0.5 text-left text-xs hover:bg-muted" onclick={() => copy(swatchValue(scale, i, store.copyFormat))}>
            <i class="size-4 rounded-sm" style:background={hx}></i>
            <span class="w-8 text-muted-foreground">{tailwind.shades[i]}</span>
            <span>{swatchValue(scale, i, store.copyFormat)}</span>
          </button>
        {/each}
      </div>
      <Button variant="secondary" onclick={() => store.duplicate(scale)}>
        <CopyIcon data-icon="inline-start" /> Duplicate as editable
      </Button>
    </div>
  {:else}
    <Field.FieldGroup>
      <Field.Field>
        <Field.FieldLabel for="name">Name</Field.FieldLabel>
        <Input id="name" value={def.name} oninput={(e) => store.update(def.id, { name: e.currentTarget.value })} />
        <Field.FieldDescription>
          {def.autoName ? "Named after the nearest color name." : "Custom name."}
          {#if !def.autoName}
            <button class="underline" onclick={() => store.update(def.id, { autoName: true })}>Use nearest name</button>
          {/if}
        </Field.FieldDescription>
      </Field.Field>

      {#if def.kind === "color"}
        <Field.Field>
          <Field.FieldLabel for="color">Color</Field.FieldLabel>
          <div class="flex items-center gap-2">
            <input
              type="color"
              class="size-8 shrink-0 cursor-pointer rounded-md border bg-transparent p-0.5"
              value={toHex(def.color)}
              oninput={(e) => setColor(e.currentTarget.value)}
              aria-label="Pick color"
            />
            <Input id="color" value={hexText} oninput={(e) => setColor(e.currentTarget.value)} spellcheck={false} aria-invalid={!isValidColor(hexText)} />
          </div>
          <Field.FieldDescription>Any CSS color: hex, oklch(), hsl()…</Field.FieldDescription>
        </Field.Field>

        <Field.Field>
          <Field.FieldLabel>Fit</Field.FieldLabel>
          <ToggleGroup.Root type="single" variant="outline" size="sm" class="w-full" value={def.mode} onValueChange={(v) => v && store.update(def.id, { mode: v as "snap" | "match" })}>
            <ToggleGroup.Item value="snap" class="flex-1">snap</ToggleGroup.Item>
            <ToggleGroup.Item value="match" class="flex-1">match</ToggleGroup.Item>
          </ToggleGroup.Root>
          <Field.FieldDescription>snap uses the nearest scale as is; match bends it through your color.</Field.FieldDescription>
        </Field.Field>

        <Field.Field>
          <Field.FieldLabel>Color sits at shade</Field.FieldLabel>
          <Select.Root type="single" value={shadeLabel(def.shade)} onValueChange={(v) => store.update(def.id, { shade: v === "auto" ? null : Number(v) })}>
            <Select.Trigger size="sm" class="w-full">{shadeLabel(def.shade)}</Select.Trigger>
            <Select.Content>
              <Select.Group>
                {#each ["auto", ...tailwind.shades.map(String)] as v}
                  <Select.Item value={v} label={v}>{v}</Select.Item>
                {/each}
              </Select.Group>
            </Select.Content>
          </Select.Root>
        </Field.Field>
      {:else}
        <Field.Field>
          <div class="flex items-baseline justify-between">
            <Field.FieldLabel>Hue</Field.FieldLabel>
            <span class="tnum text-xs text-muted-foreground">{def.hue.toFixed(1)}°</span>
          </div>
          <Slider type="single" min={0} max={360} step={0.5} value={def.hue} onValueChange={(v) => store.update(def.id, { hue: v })} />
          <Field.FieldDescription>Position on the wheel (the shade-500 hue).</Field.FieldDescription>
        </Field.Field>
      {/if}

      <Field.Field>
        <Field.FieldLabel>Interpolation across hue</Field.FieldLabel>
        <Select.Root type="single" value={def.interpolation} onValueChange={(v) => store.update(def.id, { interpolation: v as Interpolation })}>
          <Select.Trigger size="sm" class="w-full">{interpolationLabel(def.interpolation)}</Select.Trigger>
          <Select.Content>
            <Select.Group>
              {#each INTERPOLATIONS as it}
                <Select.Item value={it.value} label={it.label}>{it.label}</Select.Item>
              {/each}
            </Select.Group>
          </Select.Content>
        </Select.Root>
        <Field.FieldDescription>How neighbouring Tailwind scales are blended around the wheel.</Field.FieldDescription>
      </Field.Field>

      <Field.Field>
        <div class="flex items-baseline justify-between">
          <Field.FieldLabel>Chroma δ</Field.FieldLabel>
          <button class="tnum text-xs text-muted-foreground hover:text-foreground" onclick={() => store.update(def.id, { delta: 0 })} title="Reset">
            {def.delta >= 0 ? "+" : ""}{(def.delta * 100).toFixed(0)}%
          </button>
        </div>
        <Slider type="single" min={-0.6} max={0.6} step={0.01} value={def.delta} onValueChange={(v) => store.update(def.id, { delta: v })} />
        <Field.FieldDescription>Chroma relative to the matched curve. 0 is an exact match.</Field.FieldDescription>
      </Field.Field>
    </Field.FieldGroup>

    {#if scale.result}
      <dl class="tnum grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 rounded-lg border p-3 text-xs">
        <dt class="text-muted-foreground">hue</dt><dd>{scale.result.hue.toFixed(1)}°</dd>
        {#if def.kind === "color"}
          <dt class="text-muted-foreground">anchored at shade</dt><dd>{scale.result.anchorShade}</dd>
          <dt class="text-muted-foreground">fit distance</dt><dd>{scale.result.error.toFixed(2)} ΔE</dd>
          <dt class="text-muted-foreground">match δ</dt><dd>{(scale.result.matchDelta * 100).toFixed(0)}%</dd>
        {/if}
      </dl>
    {/if}

    <div class="flex gap-2">
      <Button variant="secondary" class="flex-1" onclick={() => copy(scale.hex.map((_, i) => swatchValue(scale, i, store.copyFormat)).join("\n"), `Copied ${scale.name}`)}>
        <CopyIcon data-icon="inline-start" /> Copy scale
      </Button>
      <Button variant="destructive" size="icon" aria-label="Delete scale" onclick={() => store.remove(def.id)}><TrashIcon /></Button>
    </div>
  {/if}
</div>
