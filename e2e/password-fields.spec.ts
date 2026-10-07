import { expect, test } from "@playwright/test";

import { TOOL_PATHS } from "./helpers";

const IGNORE_ATTRIBUTES = {
  autocomplete: "off",
  "data-1p-ignore": "true",
  "data-lpignore": "true",
  "data-bwignore": "true",
  "data-form-type": "other",
};

test("no page has a real password input", async ({ page }) => {
  for (const path of ["/", ...TOOL_PATHS]) {
    await page.goto(path);
    await expect(page.locator("main h1")).toBeVisible();
    await expect(page.locator('input[type="password"]'), path).toHaveCount(0);
  }
});

for (const { path, labels } of [
  { path: "/decrypt", labels: ["Password"] },
  { path: "/encrypt", labels: ["Password to open", "Confirm password"] },
]) {
  test(`${path} password fields are masked and opt out of password managers`, async ({ page }) => {
    await page.goto(path);
    for (const label of labels) {
      const field = page.getByLabel(label, { exact: true });
      await expect(field).toHaveAttribute("type", "text");
      for (const [name, value] of Object.entries(IGNORE_ATTRIBUTES)) {
        await expect(field, `${label} ${name}`).toHaveAttribute(name, value);
      }
      const masking = await field.evaluate((element) => getComputedStyle(element).getPropertyValue("-webkit-text-security"));
      expect(masking).toBe("disc");
      await field.fill("secret");
      await expect(field).toHaveValue("secret");
    }
  });
}
