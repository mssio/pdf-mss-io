import { expect, test, type Page } from "@playwright/test";

import { chooseFiles, download } from "./helpers";
import { freePort, startPreview, stopPreview } from "./preview-server";

// This spec needs the real service worker, so it opts back in (the config blocks it elsewhere).
test.use({ serviceWorkers: "allow" });

async function decryptProtected(page: Page): Promise<string> {
  await chooseFiles(page, "protected.pdf");
  await page.getByLabel("Password", { exact: true }).fill("open-me");
  await page.getByRole("button", { name: "Decrypt", exact: true }).click();
  return (await download(page, "Download decrypted PDF")).filename;
}

test("after the first visit the app works with the server gone", async ({ page }) => {
  const port = await freePort();
  const origin = `http://localhost:${port}`;
  const server = await startPreview(port);
  try {
    await page.goto(`${origin}/decrypt`);
    await page.evaluate(() => navigator.serviceWorker.ready);
    await page.waitForFunction(async () => {
      for (const name of await caches.keys()) {
        const requests = await (await caches.open(name)).keys();
        if (requests.some((request) => /qpdf-.*\.wasm$/.test(request.url))) return true;
      }
      return false;
    });
    await page.reload(); // the active worker now controls the page
  } finally {
    await stopPreview(server, port);
  }

  await page.goto(`${origin}/info`);
  await expect(page.getByRole("heading", { name: "PDF info" })).toBeVisible();
  await page.goto(`${origin}/decrypt`);
  await expect(page.getByRole("heading", { name: "Decrypt PDF" })).toBeVisible();
  expect(await decryptProtected(page)).toBe("protected-d.pdf");
});
