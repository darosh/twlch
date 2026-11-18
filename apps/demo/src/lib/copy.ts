import { toast } from "svelte-sonner";

export async function copy(text: string, label?: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(label ?? `Copied ${text}`);
  } catch {
    toast.error("Couldn't access the clipboard");
  }
}
