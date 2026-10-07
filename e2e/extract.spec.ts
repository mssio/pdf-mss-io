import { expect, test } from "@playwright/test";

import { chooseFiles, download, inspectPdf } from "./helpers";

test.beforeEach(async ({ page }) => {
  await page.goto("/extract");
});

test("shows the page count and extracts loosely typed ranges", async ({ page }) => {
  const extract = page.getByRole("button", { name: "Extract", exact: true });
  await expect(extract).toBeDisabled();
  await chooseFiles(page, "plain.pdf");
  await expect(page.getByText("This PDF has 5 pages.")).toBeVisible();
  await page.getByLabel("Pages").fill(" 1 - 2 , Z ");
  await extract.click();
  await expect(page.getByText("Extracted 3 pages in your browser.")).toBeVisible();
  const file = await download(page, "Download extracted pages");
  expect(file.filename).toBe("plain-pages.pdf");
  expect(await inspectPdf(file.path)).toMatchObject({ pageCount: 3 });
});

test("invalid and out-of-range pages", async ({ page }) => {
  await chooseFiles(page, "plain.pdf");
  await expect(page.getByText("This PDF has 5 pages.")).toBeVisible();
  await page.getByLabel("Pages").fill("abc");
  await page.getByRole("button", { name: "Extract", exact: true }).click();
  await expect(page.getByText("Enter pages like 1-3,7 or 5-z.")).toBeVisible();
  await page.getByLabel("Pages").fill("9");
  await page.getByRole("button", { name: "Extract", exact: true }).click();
  await expect(page.getByText("Could not process this PDF.")).toBeVisible();
  await expect(page.getByText(/out of range/)).toBeVisible();
});

test("password-protected input is sent to Decrypt and Extract stays disabled", async ({ page }) => {
  await chooseFiles(page, "protected.pdf");
  await expect(page.getByText("This PDF is password-protected. Remove its password with Decrypt first.")).toBeVisible();
  await expect(page.getByRole("link", { name: "Go to Decrypt" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Extract", exact: true })).toBeDisabled();
});
