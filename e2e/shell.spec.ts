import { expect, test } from "@playwright/test";

import { TOOL_PATHS } from "./helpers";

test("header, footer and home grid", async ({ page }) => {
  await page.goto("/");
  const header = page.locator("header");
  await expect(header.getByRole("link", { name: "PDF Toolbox" })).toBeVisible();
  await expect(header.locator('img[src="/favicon.svg"]')).toBeVisible();
  await expect(header.getByRole("link", { name: "Home" })).toBeVisible();
  await expect(header.getByRole("button", { name: /Switch to (dark|light) mode/ })).toBeVisible();
  await expect(page.locator("footer")).toHaveText("PDFs are processed locally in your browser. Nothing is uploaded.");
  await expect(page.getByRole("link", { name: "Open tool" })).toHaveCount(6);
});

test("theme toggle persists across reloads and is applied before the app script runs", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "light" });
  await page.goto("/");
  await page.getByRole("button", { name: "Switch to dark mode" }).click();
  await expect(page.locator("html")).toHaveClass(/dark/);
  // Block the app bundle: only the inline script in index.html can set the class now (no flash).
  await page.route("**/assets/index-*.js", (route) => route.abort());
  await page.reload();
  await expect(page.locator("html")).toHaveClass(/dark/);
});

test("follows the system theme when nothing is saved", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto("/");
  await expect(page.locator("html")).toHaveClass(/dark/);
  await page.emulateMedia({ colorScheme: "light" });
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await expect(page.locator("html")).not.toHaveClass(/dark/);
});

test("every tool URL loads directly", async ({ page }) => {
  for (const path of TOOL_PATHS) {
    await page.goto(path);
    await expect(page.locator("main h1")).toBeVisible();
  }
});

test("the home page downloads no wasm", async ({ page }) => {
  const requests: string[] = [];
  page.on("request", (request) => requests.push(request.url()));
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  expect(requests.filter((url) => url.endsWith(".wasm"))).toEqual([]);
});

test("nothing overflows sideways at 375 px", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  for (const path of ["/", ...TOOL_PATHS]) {
    await page.goto(path);
    await expect(page.locator("main h1")).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow, `${path} overflows by ${overflow}px`).toBeLessThanOrEqual(0);
  }
});

test("a page that fails to load shows the error screen inside the shell", async ({ page }) => {
  await page.route("**/assets/DecryptPage-*.js", (route) => route.abort());
  await page.goto("/");
  await page.getByRole("link", { name: "Open tool" }).first().click();
  await expect(page.getByText("Something went wrong")).toBeVisible();
  await expect(page.getByRole("button", { name: "Reload" })).toBeVisible();
  await expect(page.locator("header").getByRole("link", { name: "PDF Toolbox" })).toBeVisible();
  await page.getByRole("link", { name: "Back to home" }).click();
  await expect(page).toHaveURL("/");
});

test("an unknown address shows Page not found inside the shell", async ({ page }) => {
  await page.goto("/no-such-tool");
  await expect(page.getByText("Page not found")).toBeVisible();
  await expect(page.locator("header").getByRole("link", { name: "PDF Toolbox" })).toBeVisible();
  await expect(page.locator("footer")).toBeVisible();
  await page.getByRole("link", { name: "Back to home" }).click();
  await expect(page).toHaveURL("/");
  await expect(page.getByRole("link", { name: "Open tool" })).toHaveCount(6);
});
