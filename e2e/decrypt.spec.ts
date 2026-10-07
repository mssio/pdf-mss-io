import { expect, test } from "@playwright/test";

import { chooseFiles, download, inspectPdf } from "./helpers";

test.beforeEach(async ({ page }) => {
  await page.goto("/decrypt");
});

test("wrong password, then the right one, decrypts the same file", async ({ page }) => {
  await chooseFiles(page, "protected.pdf");
  await page.getByLabel("Password", { exact: true }).fill("wrong");
  await page.getByRole("button", { name: "Decrypt", exact: true }).click();
  await expect(page.getByText("Incorrect password. Check it and try again.")).toBeVisible();

  await page.getByLabel("Password", { exact: true }).fill("open-me");
  await page.getByRole("button", { name: "Decrypt", exact: true }).click();
  await expect(page.getByText("Your PDF is ready")).toBeVisible();
  await expect(page.getByText(/^Finished in (under a second|\d+:\d\d)\.$/)).toBeVisible();
  const file = await download(page, "Download decrypted PDF");
  expect(file.filename).toBe("protected-d.pdf");
  expect(await inspectPdf(file.path)).toMatchObject({ encrypted: false, pageCount: 3 });
});

test("an empty password removes owner restrictions", async ({ page }) => {
  await chooseFiles(page, "restricted.pdf");
  await page.getByRole("button", { name: "Decrypt", exact: true }).click();
  const file = await download(page, "Download decrypted PDF");
  expect(await inspectPdf(file.path)).toMatchObject({ encrypted: false });
});

test("non-PDF files are refused", async ({ page }) => {
  await page.locator('input[type="file"]').setInputFiles({ name: "notes.txt", mimeType: "text/plain", buffer: Buffer.from("hi") });
  await expect(page.getByText("File must be a PDF.")).toBeVisible();
});

test("decrypt another file and back to home", async ({ page }) => {
  await chooseFiles(page, "restricted.pdf");
  await page.getByRole("button", { name: "Decrypt", exact: true }).click();
  await page.getByRole("button", { name: "Decrypt another file" }).click();
  await expect(page.getByText("Drag and drop a PDF here")).toBeVisible();
  await expect(page.getByLabel("Password", { exact: true })).toHaveValue("");
  await chooseFiles(page, "restricted.pdf");
  await page.getByRole("button", { name: "Decrypt", exact: true }).click();
  await page.getByRole("link", { name: "Back to home" }).click();
  await expect(page).toHaveURL("/");
});

test("the wasm loads only when a job runs", async ({ page }) => {
  const wasm: string[] = [];
  page.on("request", (request) => {
    if (request.url().endsWith(".wasm")) wasm.push(request.url());
  });
  await page.reload();
  await page.waitForLoadState("networkidle");
  expect(wasm).toHaveLength(0);
  await chooseFiles(page, "restricted.pdf");
  await page.getByRole("button", { name: "Decrypt", exact: true }).click();
  await expect(page.getByText("Your PDF is ready")).toBeVisible();
  expect(wasm).toHaveLength(1);
});

test("files over 250 MB are refused before any work", async ({ page }) => {
  await chooseFiles(page, "oversize.pdf");
  await expect(page.getByText(/Files must be 250 MB or less in total \(you selected 260 MB\)\./)).toBeVisible();
  await expect(page.getByRole("button", { name: "Decrypt", exact: true })).toBeDisabled();
});
