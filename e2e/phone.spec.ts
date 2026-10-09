import { expect, test } from "@playwright/test";

import { chooseFiles } from "./helpers";

test.describe("on a phone", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test("files over the phone limit are refused with a pointer to a computer", async ({ page }) => {
    await page.goto("/decrypt");
    await chooseFiles(page, "oversize.pdf");
    await expect(
      page.getByText(
        "On phones, files must be 200 MB or less in total (you selected 260 MB). Use a computer for bigger files.",
      ),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "Decrypt", exact: true })).toBeDisabled();
  });
});

test("a computer gets the computer wording for the same file", async ({ page }) => {
  // Pin a desktop-sized memory so a low-memory test machine can't flip this into the phone limit.
  await page.addInitScript(() => Object.defineProperty(Navigator.prototype, "deviceMemory", { get: () => 8 }));
  await page.goto("/decrypt");
  await chooseFiles(page, "oversize.pdf");
  await expect(page.getByText("Files must be 250 MB or less in total (you selected 260 MB).")).toBeVisible();
  await expect(page.getByText(/On phones/)).toHaveCount(0);
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

test("a running job writes the note and removes it when it finishes", async ({ page }) => {
  await page.addInitScript(() => {
    const log: string[] = [];
    (window as unknown as { noteLog: string[] }).noteLog = log;
    const { setItem, removeItem } = Storage.prototype;
    Storage.prototype.setItem = function (key: string, value: string) {
      if (key === "pdf-mss-io-job-running") log.push("set");
      return setItem.call(this, key, value);
    };
    Storage.prototype.removeItem = function (key: string) {
      if (key === "pdf-mss-io-job-running") log.push("remove");
      return removeItem.call(this, key);
    };
  });
  await page.goto("/decrypt");
  await expect(page.locator("main h1")).toBeVisible();
  await page.evaluate(() => ((window as unknown as { noteLog: string[] }).noteLog.length = 0)); // ignore start-up clearing
  await chooseFiles(page, "restricted.pdf");
  await page.getByRole("button", { name: "Decrypt", exact: true }).click();
  await expect(page.getByText("Your PDF is ready")).toBeVisible();
  expect(await page.evaluate(() => (window as unknown as { noteLog: string[] }).noteLog)).toEqual(["set", "remove"]);
  expect(await page.evaluate(() => sessionStorage.getItem("pdf-mss-io-job-running"))).toBeNull();
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
