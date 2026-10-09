import type { PdfInfo, Qpdf, QpdfErrorCode } from "@mssio/qpdf-wasm";

let pending: Promise<Qpdf> | null = null;

/**
 * The app's single qpdf instance. The package and its wasm load on first use only;
 * a failed load is not cached, so the next call retries.
 */
export function getQpdf(): Promise<Qpdf> {
  if (!pending) {
    const loading: Promise<Qpdf> = import("@mssio/qpdf-wasm")
      .then((module) => module.createQpdf())
      .catch((error: unknown) => {
        if (pending === loading) pending = null; // a dropped engine failing late must not forget a newer one
        throw error;
      });
    pending = loading;
  }
  return pending;
}

/**
 * Drops the current engine so the next getQpdf() starts a fresh one. Used when a job never answers
 * (a frozen or killed worker): never waits for the old engine, terminates it if it ever loads.
 */
export function resetQpdf(): void {
  const current = pending;
  pending = null;
  current?.then(
    (qpdf) => qpdf.terminate(),
    () => {},
  );
}

/** A job ran past jobTimeoutMs(); the engine is assumed stuck. */
export class JobTimeoutError extends Error {
  constructor() {
    super("The PDF engine didn't answer in time");
    this.name = "JobTimeoutError";
  }
}

/** Time allowed for the engine to load (first visit: ~2.6 MB over the network). */
export const ENGINE_LOAD_TIMEOUT_MS = 120_000;

/**
 * Longest gap allowed between two progress calls while qpdf writes (0–99%). One percent can take
 * seconds on a phone; the package suggests 30 s. Before the first call and after 100%, jobTimeoutMs applies.
 */
export const STALL_TIMEOUT_MS = 30_000;

/**
 * After a job over this size, the engine's worker is replaced (resetQpdf) before the page builds the
 * download, so the finished job's memory is freed at once instead of whenever the browser collects it.
 */
export const RELEASE_ENGINE_AFTER_BYTES = 50 * 1024 * 1024;

export function shouldReleaseEngine(sizeBytes: number): boolean {
  return sizeBytes > RELEASE_ENGINE_AFTER_BYTES;
}

/**
 * Generous time allowed for one job once the engine is loaded: 2 minutes plus 2 minutes per started
 * 25 MB of input (245 MB → 22 minutes). Sized well above an iPhone 17's real timings so slower or
 * throttled phones aren't cut off; it only catches a worker that never answers.
 */
export function jobTimeoutMs(totalBytes: number): number {
  return 120_000 + Math.ceil(totalBytes / (25 * 1024 * 1024)) * 120_000;
}

/** Thrown when a tool other than Decrypt gets a PDF that needs a password to open. */
export class PasswordProtectedError extends Error {
  readonly fileName: string;

  constructor(fileName: string) {
    super(`${fileName} needs a password to open`);
    this.name = "PasswordProtectedError";
    this.fileName = fileName;
  }
}

/** Thrown when an input isn't a readable PDF, so Merge can name the file. */
export class UnreadablePdfError extends Error {
  readonly fileName: string;

  constructor(fileName: string) {
    super(`${fileName} isn't a readable PDF`);
    this.name = "UnreadablePdfError";
    this.fileName = fileName;
  }
}

/** qpdf "succeeded" but returned no usable PDF (seen when the wasm runs out of memory on large inputs). */
export class TruncatedOutputError extends Error {
  constructor() {
    super("qpdf returned an empty or truncated PDF");
    this.name = "TruncatedOutputError";
  }
}

function qpdfCode(error: unknown): QpdfErrorCode | null {
  if (error instanceof Error && "code" in error && typeof error.code === "string") {
    return error.code as QpdfErrorCode;
  }
  return null;
}

/**
 * Every tool except Decrypt calls this first. Rejects PDFs that need a password to open;
 * restriction-only PDFs (owner password only) pass. Returns qpdf's info for the file.
 */
export async function ensureNoOpenPassword(qpdf: Qpdf, file: File): Promise<PdfInfo> {
  try {
    return await qpdf.info(file);
  } catch (error) {
    const code = qpdfCode(error);
    if (code === "INVALID_PASSWORD") throw new PasswordProtectedError(file.name);
    if (code === "INVALID_PDF") throw new UnreadablePdfError(file.name);
    throw error;
  }
}

const PDF_HEADER = [0x25, 0x50, 0x44, 0x46, 0x2d]; // "%PDF-"

/** Guards every download: qpdf output must be a real PDF, not an empty or truncated buffer. */
export function assertOutput(output: Uint8Array): void {
  if (output.length < 64 || PDF_HEADER.some((byte, index) => output[index] !== byte)) {
    throw new TruncatedOutputError();
  }
}

/** qpdf repairs are routine; keep them out of the UI but visible to developers. */
export function logWarnings(warnings: string[]): void {
  if (warnings.length > 0) console.warn("qpdf warnings:", warnings);
}

export type JobPhase = "load" | "run";
export type ErrorDescription = { message: string; detail?: string; decryptFirst?: boolean };

export const OUT_OF_MEMORY_MESSAGE =
  "Not enough memory to process this on this device. Try a smaller file or a computer.";
const OUT_OF_MEMORY = /bad_alloc|out of memory|aborted|qpdf crashed/i;

/** Maps anything a qpdf job threw to the message the user sees. */
export function describeQpdfError(
  error: unknown,
  phase: JobPhase,
  options: { nameFiles?: boolean } = {},
): ErrorDescription {
  if (error instanceof JobTimeoutError) {
    return {
      message:
        "This file took too long to process on this device. It may be too big for its memory. Try a smaller file or a computer.",
    };
  }
  if (phase === "load") return { message: "Couldn't load the PDF engine. Check your connection and reload." };
  if (error instanceof PasswordProtectedError) {
    const subject = options.nameFiles ? `“${error.fileName}”` : "This PDF";
    return { message: `${subject} is password-protected. Remove its password with Decrypt first.`, decryptFirst: true };
  }
  if (error instanceof UnreadablePdfError) {
    return {
      message: options.nameFiles ? `“${error.fileName}” isn't a readable PDF.` : "This file isn't a readable PDF.",
    };
  }
  if (error instanceof TruncatedOutputError) return { message: OUT_OF_MEMORY_MESSAGE };
  const code = qpdfCode(error);
  if (code === "INVALID_PASSWORD") return { message: "Incorrect password. Check it and try again." };
  if (code === "INVALID_PDF") return { message: "This file isn't a readable PDF." };
  const detail = error instanceof Error ? error.message : String(error);
  if (OUT_OF_MEMORY.test(detail)) return { message: OUT_OF_MEMORY_MESSAGE };
  return { message: "Could not process this PDF.", detail };
}
