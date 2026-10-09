import { expect, test, type Page } from "@playwright/test";

import { chooseFiles, download, inspectPdf, type RecordedProgress, recordedProgress, recordProgress, spaceOutProgress } from "./helpers";

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
  await expect(page.getByText(/^(Loading the PDF engine…|Compressing…|Finishing…) \d+:\d\d$/)).toBeVisible();
});

/** The bar showed, its values only rose, at least one sat between 1 and 99, and it was never announced. */
function expectRisingBar({ values, insideLiveRegion }: RecordedProgress) {
  expect(values.length).toBeGreaterThan(0);
  expect(values.every((percent, i) => i === 0 || percent > values[i - 1])).toBe(true);
  expect(values.every((percent) => percent >= 0 && percent <= 99)).toBe(true);
  expect(values.some((percent) => percent >= 1 && percent <= 99)).toBe(true);
  expect(insideLiveRegion).toBe(false);
}

test("compressing shows a rising progress bar, then the result", async ({ page }) => {
  await recordProgress(page);
  await page.goto("/compress");
  await chooseFiles(page, "twenty-mb.pdf");
  await page.getByRole("button", { name: "Compress", exact: true }).click();
  await expect(page.getByText("Your PDF is smaller")).toBeVisible();
  expectRisingBar(await recordedProgress(page));
  await expect(page.getByRole("progressbar")).toHaveCount(0);
  const file = await download(page, "Download compressed PDF");
  expect(await inspectPdf(file.path)).toMatchObject({ pageCount: 400, encrypted: false });
});

test("encrypting shows a rising progress bar, then the result", async ({ page }) => {
  await recordProgress(page);
  await page.goto("/encrypt");
  await chooseFiles(page, "twenty-mb.pdf");
  await page.getByLabel("Password to open", { exact: true }).fill("secret");
  await page.getByLabel("Confirm password", { exact: true }).fill("secret");
  await page.getByRole("button", { name: "Encrypt", exact: true }).click();
  await expect(page.getByText("Your PDF is protected")).toBeVisible();
  expectRisingBar(await recordedProgress(page));
  const file = await download(page, "Download protected PDF");
  expect(await inspectPdf(file.path, "secret")).toMatchObject({ pageCount: 400, encrypted: true });
});

test("the elapsed time keeps ticking while progress arrives several times a second", async ({ page }) => {
  await spaceOutProgress(page, { gapMs: 50 }); // 100 percents over ~5 s
  await page.goto("/compress");
  await chooseFiles(page, "twenty-mb.pdf");
  await page.getByRole("button", { name: "Compress", exact: true }).click();
  await expect(page.getByRole("progressbar")).toBeVisible();
  await expect(page.getByText(/^Compressing… 0:0[2-9]$/)).toBeVisible({ timeout: 4_000 });
  await expect(page.getByText("Your PDF is smaller")).toBeVisible();
});

/** Starts a Compress whose progress lasts ~5 s and returns the bar's fill once it shows. */
async function compressWithVisibleBar(page: Page) {
  await spaceOutProgress(page, { gapMs: 50 });
  await page.goto("/compress");
  await chooseFiles(page, "twenty-mb.pdf");
  await page.getByRole("button", { name: "Compress", exact: true }).click();
  const fill = page.locator('[data-slot="progress-indicator"]');
  await expect(fill).toBeVisible();
  return fill;
}

test("the bar glides to each new value", async ({ page }) => {
  const fill = await compressWithVisibleBar(page);
  const transition = await fill.evaluate((element) => {
    const style = getComputedStyle(element);
    return { property: style.transitionProperty, seconds: parseFloat(style.transitionDuration) };
  });
  expect(transition.property).toContain("transform");
  expect(transition.seconds).toBeGreaterThanOrEqual(0.5);
});

test.describe("with Reduce Motion on", () => {
  test.use({ reducedMotion: "reduce" });

  test("the bar doesn't animate", async ({ page }) => {
    const fill = await compressWithVisibleBar(page);
    expect(await fill.evaluate((element) => getComputedStyle(element).transitionProperty)).toBe("none");
  });
});

test("a bar whose first progress arrives in a burst slides in from 0", async ({ page }) => {
  await recordProgress(page);
  await spaceOutProgress(page, { gapMs: 20, burstBelow: 36 }); // 0–35% land in one frame, as on the iPhone
  await page.goto("/compress");
  await chooseFiles(page, "twenty-mb.pdf");
  await page.getByRole("button", { name: "Compress", exact: true }).click();
  await expect(page.getByText("Your PDF is smaller")).toBeVisible();
  const { values } = await recordedProgress(page);
  expect(values[0]).toBe(0);
  expect(values[1]).toBeGreaterThanOrEqual(35);
});
