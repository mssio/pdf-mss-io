import { readFile } from "node:fs/promises";
import { createQpdf, type Qpdf } from "@mssio/qpdf-wasm";
import { expect, type Locator, type Page } from "@playwright/test";

import { parseQpdfJson, QPDF_JSON_ARGS } from "@/lib/pdf-info";

import { fixture } from "./paths";

export const TOOL_PATHS = ["/decrypt", "/encrypt", "/merge", "/extract", "/compress", "/info"];

/** Picks fixture files through the page's (visually hidden) file input. */
export async function chooseFiles(page: Page, ...names: string[]): Promise<void> {
  await page.locator('input[type="file"]').setInputFiles(names.map(fixture));
}

/** Clicks a download link and returns the saved file's path and suggested name. */
export async function download(page: Page, linkName: string): Promise<{ path: string; filename: string }> {
  const [file] = await Promise.all([page.waitForEvent("download"), page.getByRole("link", { name: linkName }).click()]);
  return { path: await file.path(), filename: file.suggestedFilename() };
}

let qpdfInstance: Promise<Qpdf> | null = null;

export type PdfInspection = {
  encrypted: boolean;
  pageCount: number;
  capabilities: Record<string, boolean>;
  firstPageSize: string | null;
};

/** Re-reads a PDF with the real qpdf in Node so tests verify what users actually download. */
export async function inspectPdf(path: string, password?: string): Promise<PdfInspection> {
  const qpdf = await (qpdfInstance ??= createQpdf());
  const bytes = new Uint8Array(await readFile(path));
  const passwordArgs = password ? [`--password=${password}`] : [];
  const info = await qpdf.info(bytes.slice(), password ? { password } : {});
  const json = await qpdf.run([...passwordArgs, ...QPDF_JSON_ARGS, "in.pdf"], { files: { "in.pdf": bytes.slice() } });
  const parsed = JSON.parse(json.stdout);
  return {
    encrypted: info.encrypted,
    pageCount: info.pageCount,
    capabilities: parsed.encrypt?.capabilities ?? {},
    firstPageSize: parseQpdfJson(parsed).firstPageSize?.name ?? null,
  };
}

/** Presses Tab until `target` has focus; fails if it isn't reached within `maxTabs` presses. */
export async function tabTo(page: Page, target: Locator, maxTabs = 40): Promise<void> {
  for (let i = 0; i < maxTabs; i++) {
    await page.keyboard.press("Tab");
    if (await target.evaluate((element) => element === document.activeElement)) return;
  }
  await expect(target, `not reachable with ${maxTabs} Tab presses`).toBeFocused();
}

export type RecordedProgress = { values: number[]; insideLiveRegion: boolean };

/**
 * Records every value the job progress bar shows (deduplicated, in order) and whether the bar ever sat
 * inside an aria-live region. Call before page.goto; read with recordedProgress(). Recording avoids
 * racing a bar that may only be visible for a fraction of a second.
 */
export async function recordProgress(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const record = { values: [] as number[], insideLiveRegion: false };
    Object.assign(window, { __progress: record });
    new MutationObserver(() => {
      const bar = document.querySelector('[role="progressbar"]');
      const value = bar?.getAttribute("aria-valuenow");
      if (!bar || value == null) return;
      if (bar.closest("[aria-live]")) record.insideLiveRegion = true;
      if (Number(value) !== record.values.at(-1)) record.values.push(Number(value));
    }).observe(document, { subtree: true, childList: true, attributes: true, attributeFilter: ["aria-valuenow"] });
  });
}

export async function recordedProgress(page: Page): Promise<RecordedProgress> {
  return page.evaluate(() => (window as unknown as { __progress: RecordedProgress }).__progress);
}
