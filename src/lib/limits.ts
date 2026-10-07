import { formatBytes } from "@/lib/format";

/** Hard limit for the combined size of a tool's inputs on a computer. qpdf runs out of wasm memory above this. */
export const MAX_TOTAL_BYTES = 250 * 1024 * 1024;
/**
 * Hard limit on phones. iOS kills (and reloads) the page instead of letting qpdf fail cleanly: an iPhone 17
 * handled 100 MB and reloaded at ~245 MB.
 */
export const PHONE_MAX_BYTES = 100 * 1024 * 1024;

export type SizeCheck = { ok: true } | { ok: false; message: string };

export function totalBytes(files: readonly Blob[]): number {
  return files.reduce((sum, file) => sum + file.size, 0);
}

export function checkSize(total: number, likelyPhone: boolean): SizeCheck {
  if (likelyPhone && total > PHONE_MAX_BYTES) {
    return {
      ok: false,
      message: `On phones, files must be ${formatBytes(PHONE_MAX_BYTES)} or less in total (you selected ${formatBytes(total)}). Use a computer for bigger files.`,
    };
  }
  if (total > MAX_TOTAL_BYTES) {
    return {
      ok: false,
      message: `Files must be ${formatBytes(MAX_TOTAL_BYTES)} or less in total (you selected ${formatBytes(total)}).`,
    };
  }
  return { ok: true };
}

/** A small touch screen, or a device that reports little memory (Chromium's deviceMemory). */
export function isLikelyPhone(): boolean {
  if (typeof navigator === "undefined") return false;
  const coarseNarrow =
    typeof matchMedia === "function" && matchMedia("(pointer: coarse) and (max-width: 820px)").matches;
  const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
  return coarseNarrow || (typeof memory === "number" && memory <= 4);
}
