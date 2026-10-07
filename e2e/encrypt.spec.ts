import { expect, test } from "@playwright/test";

import { chooseFiles, download, inspectPdf } from "./helpers";

test.beforeEach(async ({ page }) => {
  await page.goto("/encrypt");
});

async function fillPasswords(page: import("@playwright/test").Page, password: string, confirm: string) {
  await page.getByLabel("Password to open", { exact: true }).fill(password);
  await page.getByLabel("Confirm password", { exact: true }).fill(confirm);
}

test("password validation", async ({ page }) => {
  await chooseFiles(page, "plain.pdf");
  await page.getByRole("button", { name: "Encrypt", exact: true }).click();
  await expect(page.getByText("Password is required.")).toBeVisible();
  await fillPasswords(page, "a", "b");
  await page.getByRole("button", { name: "Encrypt", exact: true }).click();
  await expect(page.getByText("Passwords don't match.")).toBeVisible();
});

test("protects with the password and the chosen permissions", async ({ page }) => {
  await chooseFiles(page, "plain.pdf");
  await fillPasswords(page, "secret", "secret");
  await page.getByLabel("Allow printing").click();
  await page.getByRole("button", { name: "Encrypt", exact: true }).click();
  await expect(page.getByText("Your PDF is protected")).toBeVisible();
  const file = await download(page, "Download protected PDF");
  expect(file.filename).toBe("plain-protected.pdf");
  await expect(inspectPdf(file.path)).rejects.toMatchObject({ code: "INVALID_PASSWORD" });
  const inspection = await inspectPdf(file.path, "secret");
  expect(inspection).toMatchObject({ encrypted: true, pageCount: 5 });
  expect(inspection.capabilities).toMatchObject({ printhigh: false, extract: true, modifyother: true });
});

test("password-protected input is sent to Decrypt", async ({ page }) => {
  await chooseFiles(page, "protected.pdf");
  await fillPasswords(page, "x", "x");
  await page.getByRole("button", { name: "Encrypt", exact: true }).click();
  await expect(page.getByText("This PDF is password-protected. Remove its password with Decrypt first.")).toBeVisible();
  await page.getByRole("link", { name: "Go to Decrypt" }).click();
  await expect(page).toHaveURL("/decrypt");
});

test("restriction-only input is accepted", async ({ page }) => {
  await chooseFiles(page, "restricted.pdf");
  await fillPasswords(page, "x", "x");
  await page.getByRole("button", { name: "Encrypt", exact: true }).click();
  await expect(page.getByText("Your PDF is protected")).toBeVisible();
});
