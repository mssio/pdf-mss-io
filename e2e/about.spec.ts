import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";

const { version } = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as {
  version: string;
};

const IJG = "This software is based in part on the work of the Independent JPEG Group.";

test("footer About link opens the About page", async ({ page }) => {
  await page.goto("/");
  await page.locator("footer").getByRole("link", { name: "About", exact: true }).click();
  await expect(page).toHaveURL(/\/about$/);
  await expect(page.getByRole("heading", { level: 1, name: "About PDF Toolbox" })).toBeVisible();
  await expect(
    page.getByText(
      "PDF Toolbox runs entirely in your browser. Your files and passwords never leave your device. The code is open source (MIT), so anyone can check.",
    ),
  ).toBeVisible();
});

test("repo links open GitHub in a new tab", async ({ page }) => {
  await page.goto("/about");
  const links = [
    [/^PDF Toolbox/, "https://github.com/mssio/pdf-mss-io"],
    [/^qpdf-wasm/, "https://github.com/mssio/qpdf-wasm"],
  ] as const;
  for (const [name, href] of links) {
    const link = page.locator("main").getByRole("link", { name });
    await expect(link).toHaveAttribute("href", href);
    await expect(link).toHaveAttribute("target", "_blank");
    await expect(link).toHaveAttribute("rel", "noopener noreferrer");
    await expect(link).toHaveAccessibleName(/opens in a new tab/);
  }
  await expect(page.locator("main").getByText(`Version ${version}`)).toBeVisible();
});

test("both repos show their own license text", async ({ page }) => {
  await page.goto("/about");
  const source = page.locator('main [data-slot="card"]').filter({ has: page.getByRole("heading", { name: "Source code" }) });
  await source.getByText("License for PDF Toolbox").click();
  await expect(source.locator("pre").first()).toContainText("MIT License");
  await source.getByText("License for qpdf-wasm").click();
  await expect(source.locator("pre").nth(1)).toContainText("Apache License");
});

test("qpdf's source line keeps which tag was built", async ({ page }) => {
  await page.goto("/about");
  await expect(page.getByText("(tag v12.4.2), compiled unmodified.")).toBeVisible();
});

test("credits list the engine's libraries", async ({ page }) => {
  await page.goto("/about");
  await expect(page.getByRole("heading", { level: 2, name: "Credits" })).toBeVisible();
  await expect(page.getByRole("heading", { level: 3, name: "qpdf 12.4.2" })).toBeVisible();
  await expect(page.getByRole("heading", { level: 3, name: /^libjpeg/ })).toBeVisible();
  await expect(page.getByText(IJG, { exact: true })).toBeVisible();
  const details = page.locator("main details");
  expect(await details.count()).toBeGreaterThan(5);
  for (const item of await details.all()) await expect(item).not.toHaveAttribute("open");
});

test("each license toggle names its library for screen readers", async ({ page }) => {
  await page.goto("/about");
  const credits = page.locator('main [data-slot="card"]').filter({ has: page.getByRole("heading", { name: "Credits" }) });
  await expect(credits.locator("summary").first()).toHaveAccessibleName("LICENSE.txt for qpdf 12.4.2");
  await expect(credits.locator("summary").nth(2)).toHaveAccessibleName(/^License for zlib/);
});

test("keyboard opens a license", async ({ page }) => {
  await page.goto("/about");
  const first = page.locator("main details").first();
  await first.locator("summary").focus();
  await page.keyboard.press("Enter");
  await expect(first).toHaveAttribute("open", "");
  await expect(first.locator("pre")).toBeVisible();
});

test("no sideways scroll at 320 px with every license open", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await page.goto("/about");
  await expect(page.locator("main summary").first()).toBeVisible();
  for (const summary of await page.locator("main summary").all()) await summary.click();
  await expect(page.locator("main details:not([open])")).toHaveCount(0);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});
