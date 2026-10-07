import { readFile, stat } from "node:fs/promises";
import { expect, test } from "@playwright/test";

import { chooseFiles, download, inspectPdf } from "./helpers";
import { fixture } from "./paths";

test("compresses, and a second pass reports no smaller version", async ({ page }) => {
  await page.goto("/compress");
  await chooseFiles(page, "plain.pdf");
  await page.getByRole("button", { name: "Compress", exact: true }).click();
  await expect(page.getByText("Your PDF is smaller")).toBeVisible();
  await expect(page.getByText(/ → .*(−\d+%|less than 1% smaller)/)).toBeVisible();
  const file = await download(page, "Download compressed PDF");
  expect(file.filename).toBe("plain-compressed.pdf");
  expect((await stat(file.path)).size).toBeLessThan((await stat(fixture("plain.pdf"))).size);
  expect(await inspectPdf(file.path)).toMatchObject({ pageCount: 5, encrypted: false });

  await page.getByRole("button", { name: "Compress another file" }).click();
  // Playwright saves downloads under a random name, so re-upload under the real one.
  await page
    .locator('input[type="file"]')
    .setInputFiles({ name: file.filename, mimeType: "application/pdf", buffer: await readFile(file.path) });
  await page.getByRole("button", { name: "Compress", exact: true }).click();
  await expect(page.getByText("No smaller version")).toBeVisible();
  await expect(page.getByText(/^Finished in (under a second|\d+:\d\d)\.$/)).toBeVisible();
  await expect(page.getByText(/already as small as qpdf can make it/)).toBeVisible();
  await expect(page.getByRole("link", { name: "Download compressed PDF" })).toHaveCount(0);
});

test("password-protected input is sent to Decrypt", async ({ page }) => {
  await page.goto("/compress");
  await chooseFiles(page, "protected.pdf");
  await page.getByRole("button", { name: "Compress", exact: true }).click();
  await expect(page.getByText("This PDF is password-protected. Remove its password with Decrypt first.")).toBeVisible();
  await expect(page.getByRole("link", { name: "Go to Decrypt" })).toBeVisible();
});
