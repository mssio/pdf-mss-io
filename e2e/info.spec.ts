import { expect, test, type Page } from "@playwright/test";

import { chooseFiles } from "./helpers";

async function inspect(page: Page, name: string) {
  await page.goto("/info");
  await chooseFiles(page, name);
  await page.getByRole("button", { name: "Inspect", exact: true }).click();
}

const row = (page: Page, label: string) => page.locator("dl > div").filter({ has: page.locator("dt", { hasText: label }) }).locator("dd");

test("plain PDF details", async ({ page }) => {
  await inspect(page, "plain.pdf");
  await expect(page.getByText("Plain sample").first()).toBeVisible();
  await expect(row(page, "Author")).toHaveText("Test Author");
  await expect(row(page, "Created")).not.toBeEmpty();
  await expect(row(page, "Pages")).toHaveText("5");
  await expect(row(page, "PDF version")).toHaveText("1.7");
  await expect(row(page, "Page size")).toContainText("Letter");
  await expect(row(page, "Encryption")).toHaveText("Not encrypted");
  await expect(row(page, "Fast web view")).toHaveText("No");
  await expect(row(page, "Attachments")).toHaveText("None");
  await expect(page.getByText(/^Finished in (under a second|\d+:\d\d)\.$/)).toBeVisible();
  await page.getByRole("button", { name: "Inspect another file" }).click();
  await expect(page.getByText("Drag and drop a PDF here")).toBeVisible();
});

test("restriction-only PDF shows its restrictions", async ({ page }) => {
  await inspect(page, "restricted.pdf");
  await expect(row(page, "Encryption")).toContainText("Restrictions only (opens without a password)");
  await expect(row(page, "Encryption")).toContainText("AES-256");
  await expect(row(page, "Not allowed")).toContainText("Printing");
});

test("linearized PDF shows the badge", async ({ page }) => {
  await inspect(page, "linearized.pdf");
  await expect(row(page, "Fast web view")).toHaveText("Linearized");
});

test("password-protected input is sent to Decrypt", async ({ page }) => {
  await inspect(page, "protected.pdf");
  await expect(page.getByText("This PDF is password-protected. Remove its password with Decrypt first.")).toBeVisible();
});
