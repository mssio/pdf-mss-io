import { expect, test, type Page } from "@playwright/test";

import { chooseFiles, download, inspectPdf } from "./helpers";

/** Makes the PDF engine hang: its worker script is requested but never answered. */
async function hangEngine(page: Page) {
  await page.route("**/assets/worker-*.js", () => {
    // never fulfilled
  });
}

test("shows the step and elapsed time while a job runs, plus a hint for large files", async ({ page }) => {
  await page.clock.install();
  await hangEngine(page);
  await page.goto("/decrypt");
  await chooseFiles(page, "sixty-mb.pdf");
  await page.getByRole("button", { name: "Decrypt", exact: true }).click();
  // The installed clock keeps flowing in real time, so allow one second of slack.
  await expect(page.getByText(/^Loading the PDF engine… 0:0[01]$/)).toBeVisible();
  await page.clock.fastForward(5_000);
  await expect(page.getByText(/^Loading the PDF engine… 0:0[56]$/)).toBeVisible();
  await expect(page.getByText("Large files can take a few minutes on phones.")).toBeVisible();
});

test("an engine that never loads times out with the load message, and the next job works", async ({ page }) => {
  await page.clock.install();
  await hangEngine(page);
  await page.goto("/decrypt");
  await chooseFiles(page, "restricted.pdf");
  await page.getByRole("button", { name: "Decrypt", exact: true }).click();
  await expect(page.getByText(/Loading the PDF engine…/)).toBeVisible();
  await expect(page.getByText("Large files can take a few minutes on phones.")).toHaveCount(0);

  await page.clock.fastForward(121_000); // past the 2-minute engine load limit
  await expect(page.getByText("Couldn't load the PDF engine. Check your connection and reload.")).toBeVisible();
  await expect(page.getByText(/Loading the PDF engine…/)).toHaveCount(0);

  await page.unrouteAll({ behavior: "ignoreErrors" });
  await page.getByRole("button", { name: "Decrypt", exact: true }).click();
  await expect(page.getByText("Your PDF is ready")).toBeVisible();
  const file = await download(page, "Download decrypted PDF");
  expect(await inspectPdf(file.path)).toMatchObject({ encrypted: false });
});

// A job that hangs after the engine loaded (JobTimeoutError) can't be provoked in a browser test;
// runWithTimeLimits' unit tests cover it with fake timers.
test("a running job shows a step and a timer", async ({ page }) => {
  await page.clock.install();
  const engineLoaded = page.waitForEvent("worker");
  await page.goto("/compress");
  await chooseFiles(page, "plain.pdf");
  await page.getByRole("button", { name: "Compress", exact: true }).click();
  await engineLoaded;
  await expect(page.getByText(/^(Loading the PDF engine…|Compressing…) \d+:\d\d$/)).toBeVisible();
});
