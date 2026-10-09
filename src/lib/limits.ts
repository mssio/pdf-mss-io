import { formatBytes } from "@/lib/format";

/** Hard limit for the combined size of a tool's inputs on a computer. qpdf runs out of wasm memory above this. */
export const MAX_TOTAL_BYTES = 250 * 1024 * 1024;
/**
 * Hard limit on phones. Owner's iPhone test (2026-10-09, 1.1.0): Encrypt and Decrypt of a 245 MB PDF
 * crashed the page ("A problem repeatedly occurred"), 200 MB worked; Compress managed 245 MB. One limit
 * covers every tool, so it fits the weakest. Failures below it depend on free memory and are handled by
 * the crash notice and the job time limit (see jobTimeoutMs).
 */
export const PHONE_MAX_BYTES = 200 * 1024 * 1024;

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

const PHONE_QUERIES = [
  "(pointer: coarse) and (max-width: 820px)", // phone (or small tablet) held upright
  "(pointer: coarse) and (max-height: 500px)", // phone held sideways: wide, but short
];

/** A small touch screen in either orientation, or a device that reports little memory (Chromium's deviceMemory). */
export function isLikelyPhone(): boolean {
  if (typeof navigator === "undefined") return false;
  const smallTouchScreen =
    typeof matchMedia === "function" && PHONE_QUERIES.some((query) => matchMedia(query).matches);
  const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
  return smallTouchScreen || (typeof memory === "number" && memory <= 4);
}
