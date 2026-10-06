import { formatBytes } from "@/lib/format";

/** Hard limit for the combined size of a tool's inputs. qpdf runs out of wasm memory well above this. */
export const MAX_TOTAL_BYTES = 250 * 1024 * 1024;
/** Above this, phones get a non-blocking warning. */
export const PHONE_WARN_BYTES = 100 * 1024 * 1024;

export type SizeCheck = { ok: true; phoneWarning: boolean } | { ok: false; message: string };

export function totalBytes(files: readonly Blob[]): number {
  return files.reduce((sum, file) => sum + file.size, 0);
}

export function checkSize(total: number, likelyPhone: boolean): SizeCheck {
  if (total > MAX_TOTAL_BYTES) {
    return {
      ok: false,
      message: `Files must be ${formatBytes(MAX_TOTAL_BYTES)} or less in total (you selected ${formatBytes(total)}).`,
    };
  }
  return { ok: true, phoneWarning: likelyPhone && total > PHONE_WARN_BYTES };
}

/** Best guess that this device has little memory: Chromium's deviceMemory, else a small touch screen. */
export function isLikelyPhone(): boolean {
  if (typeof navigator === "undefined") return false;
  const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
  if (typeof memory === "number") return memory <= 4;
  return typeof matchMedia === "function" && matchMedia("(pointer: coarse) and (max-width: 820px)").matches;
}
