import { expect, test } from "@playwright/test";

import { chooseFiles, download, inspectPdf, tabTo } from "./helpers";

test.beforeEach(async ({ page }) => {
  await page.goto("/merge");
});

const rows = (page: import("@playwright/test").Page) => page.locator("ol > li");

test("files append, reorder and remove; merge keeps the chosen order", async ({ page }) => {
  await chooseFiles(page, "plain.pdf");
  await expect(page.getByRole("button", { name: "Merge", exact: true })).toBeDisabled();
  await chooseFiles(page, "two-pages.pdf");
  await expect(rows(page)).toHaveCount(2);
  await expect(page.getByRole("button", { name: "Move plain.pdf up" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Move two-pages.pdf down" })).toBeDisabled();

  await page.getByRole("button", { name: "Move two-pages.pdf up" }).click();
  await expect(rows(page).first()).toContainText("two-pages.pdf");
  await page.getByRole("button", { name: "Merge", exact: true }).click();
  await expect(page.getByText("2 files, 7 pages.")).toBeVisible();
  const file = await download(page, "Download merged PDF");
  expect(file.filename).toBe("merged.pdf");
  expect(await inspectPdf(file.path)).toMatchObject({ pageCount: 7, encrypted: false, firstPageSize: "A4" });
});

test("restricted inputs get a note that restrictions are dropped", async ({ page }) => {
  await chooseFiles(page, "plain.pdf", "restricted.pdf");
  await page.getByRole("button", { name: "Merge", exact: true }).click();
  await expect(page.getByText("Restrictions from the original files aren't kept in the merged PDF.")).toBeVisible();
});

test("problem files are named, and the error clears when the file is removed", async ({ page }) => {
  await chooseFiles(page, "plain.pdf", "protected.pdf");
  await page.getByRole("button", { name: "Merge", exact: true }).click();
  await expect(page.getByText(/protected\.pdf.*is password-protected.*Remove its password with Decrypt first/)).toBeVisible();
  await expect(page.getByRole("link", { name: "Go to Decrypt" })).toBeVisible();
  await page.getByRole("button", { name: "Remove protected.pdf" }).click();
  await expect(page.getByText(/is password-protected/)).toHaveCount(0);

  await chooseFiles(page, "not-a-pdf.pdf");
  await page.getByRole("button", { name: "Merge", exact: true }).click();
  await expect(page.getByText(/not-a-pdf\.pdf.*isn't a readable PDF/)).toBeVisible();
  await page.getByRole("button", { name: "Remove not-a-pdf.pdf" }).click();

  await chooseFiles(page, "empty.pdf");
  await page.getByRole("button", { name: "Merge", exact: true }).click();
  await expect(page.getByText(/empty\.pdf.*is empty/)).toBeVisible();
});

test("keyboard: Tab reaches the drop zone and every row button", async ({ page }) => {
  const zone = page.locator('div[role="button"]', { hasText: "Drag and drop PDFs here" });
  await tabTo(page, zone);
  const chooser = page.waitForEvent("filechooser");
  await page.keyboard.press("Enter");
  await (await chooser).setFiles([]);
  await chooseFiles(page, "plain.pdf", "two-pages.pdf");
  for (const name of ["Move plain.pdf down", "Remove plain.pdf", "Move two-pages.pdf up", "Remove two-pages.pdf"]) {
    await tabTo(page, page.getByRole("button", { name }));
  }
});
