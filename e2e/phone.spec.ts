import { expect, test } from "@playwright/test";

import { chooseFiles } from "./helpers";

test.describe("on a phone", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test("files over the phone limit are refused with a pointer to a computer", async ({ page }) => {
    await page.goto("/decrypt");
    await chooseFiles(page, "phone-oversize.pdf");
    await expect(
      page.getByText(
        "On phones, files must be 100 MB or less in total (you selected 120 MB). Use a computer for bigger files.",
      ),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "Decrypt", exact: true })).toBeDisabled();
  });
});

test("a computer accepts the same file", async ({ page }) => {
  await page.goto("/decrypt");
  await chooseFiles(page, "phone-oversize.pdf");
  await expect(page.getByText(/files must be .* or less in total/)).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Decrypt", exact: true })).toBeEnabled();
});

const CRASH_NOTICE = /The page reloaded while a file was being processed/;

test("a job cut off by a reload is explained once after the reload", async ({ page }) => {
  await page.goto("/encrypt");
  // Wait until the app has started: on start-up it clears any old note, which would race the next line.
  await expect(page.locator("main h1")).toBeVisible();
  await page.evaluate(() => sessionStorage.setItem("pdf-mss-io-job-running", String(Date.now())));
  await page.reload();
  await expect(page.getByText(CRASH_NOTICE)).toBeVisible();
  await page.getByRole("button", { name: "Dismiss" }).click();
  await expect(page.getByText(CRASH_NOTICE)).toHaveCount(0);
  await page.reload();
  await expect(page.getByText(CRASH_NOTICE)).toHaveCount(0);
});

test("a job that finishes leaves no notice", async ({ page }) => {
  await page.goto("/decrypt");
  await chooseFiles(page, "restricted.pdf");
  await page.getByRole("button", { name: "Decrypt", exact: true }).click();
  await expect(page.getByText("Your PDF is ready")).toBeVisible();
  await page.reload();
  await expect(page.locator("main h1")).toBeVisible();
  await expect(page.getByText(CRASH_NOTICE)).toHaveCount(0);
});
