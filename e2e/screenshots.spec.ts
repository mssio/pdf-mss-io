import { expect, test } from "@playwright/test";

import { TOOL_PATHS } from "./helpers";

// Saves screenshots for the owner's visual review (docs/todo.md); asserts only that pages render.
for (const theme of ["light", "dark"] as const) {
  for (const width of [375, 1280]) {
    test(`screenshots ${theme} ${width}px`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: theme });
      await page.setViewportSize({ width, height: width === 375 ? 812 : 800 });
      for (const path of ["/", ...TOOL_PATHS]) {
        await page.goto(path);
        await expect(page.locator("main h1")).toBeVisible();
        const name = path === "/" ? "home" : path.slice(1);
        await page.screenshot({ path: `test-results/screenshots/${name}-${theme}-${width}.png`, fullPage: true });
      }
    });
  }
}
