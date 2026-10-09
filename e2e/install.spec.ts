import { devices, expect, test, type Page } from "@playwright/test";

import { chooseFiles, spaceOutProgress } from "./helpers";

const banner = (page: Page) => page.getByRole("region", { name: "Install PDF Toolbox" });

/** Dispatches a fake beforeinstallprompt whose prompt() is counted in window.__prompted. */
async function offerInstall(page: Page) {
  await page.evaluate(() => {
    const event = Object.assign(new Event("beforeinstallprompt", { cancelable: true }), {
      prompt: async () => {
        (window as unknown as { __prompted: number }).__prompted =
          ((window as unknown as { __prompted?: number }).__prompted ?? 0) + 1;
      },
    });
    window.dispatchEvent(event);
  });
}

test.describe("on an iPhone", () => {
  const { userAgent, viewport, deviceScaleFactor, isMobile, hasTouch } = devices["iPhone 15"];
  test.use({ userAgent, viewport, deviceScaleFactor, isMobile, hasTouch });

  test("How walks through five step pages with full screenshots", async ({ page }) => {
    await page.goto("/");
    await expect(banner(page)).toContainText("Add PDF Toolbox to your Home Screen");
    await banner(page).getByRole("link", { name: "How" }).click();
    await expect(page.getByRole("heading", { name: "Add PDF Toolbox to your Home Screen" })).toBeVisible();
    await expect(banner(page)).toHaveCount(0);
    for (let step = 1; step <= 5; step++) {
      await expect(page.getByText(`Step ${step} of 5`)).toBeVisible();
      const shot = page.locator("main img");
      await expect(shot).toHaveJSProperty("complete", true);
      expect(await shot.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0);
      await expect(shot).toBeInViewport({ ratio: 1 }); // the whole phone fits on screen
      await expect(page.getByRole("link", { name: `Step ${step}` })).toHaveAttribute("aria-current", "step");
      if (step < 5) await page.getByRole("link", { name: "Next" }).click();
    }
    await page.getByRole("link", { name: "Back" }).click();
    await expect(page.getByText("Step 4 of 5")).toBeVisible();
    await page.goBack();
    await expect(page.getByText("Step 5 of 5")).toBeVisible();
    await page.getByRole("link", { name: "Done" }).click();
    await expect(page).toHaveURL(/\/$/);
    await page.goto("/install/9");
    await expect(page.getByText("Step 1 of 5")).toBeVisible();
    await expect(page.getByRole("link", { name: "Back" })).toHaveCount(0);
  });

  test("Not now hides the banner, also after a reload", async ({ page }) => {
    await page.goto("/");
    await banner(page).getByRole("button", { name: "Not now" }).click();
    await expect(banner(page)).toHaveCount(0);
    await page.reload();
    await expect(page.locator("main h1")).toBeVisible();
    await expect(banner(page)).toHaveCount(0);
  });

  test("the installed app shows no banner", async ({ page }) => {
    await page.addInitScript(() => Object.defineProperty(Navigator.prototype, "standalone", { get: () => true }));
    await page.goto("/");
    await expect(page.locator("main h1")).toBeVisible();
    await expect(banner(page)).toHaveCount(0);
  });

  test("no banner while a job runs", async ({ page }) => {
    await spaceOutProgress(page, { gapMs: 50 });
    await page.goto("/compress");
    await expect(banner(page)).toBeVisible();
    await chooseFiles(page, "twenty-mb.pdf");
    await page.getByRole("button", { name: "Compress", exact: true }).click();
    await expect(page.getByRole("progressbar")).toBeVisible();
    await expect(banner(page)).toHaveCount(0);
  });
});

test.describe("on an Android phone", () => {
  test.use({ viewport: { width: 412, height: 915 }, hasTouch: true, isMobile: true });

  test("Install opens the browser's install dialog once", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("main h1")).toBeVisible();
    await expect(banner(page)).toHaveCount(0); // no install path until the browser offers one
    await offerInstall(page);
    await banner(page).getByRole("button", { name: "Install" }).click();
    expect(await page.evaluate(() => (window as unknown as { __prompted?: number }).__prompted)).toBe(1);
    await expect(banner(page)).toHaveCount(0);
  });
});

test("desktop never shows the banner, even when the browser offers to install", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("main h1")).toBeVisible();
  await offerInstall(page);
  await expect(banner(page)).toHaveCount(0);
});
