import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";

import { chooseFiles, spaceOutProgress } from "./helpers";
import { freePort, startPreview, stopPreview } from "./preview-server";

// Needs the real service worker, like offline.spec.ts.
test.use({ serviceWorkers: "allow" });

/** A copy of dist/ on its own port, so a test can "deploy" a new version into it. */
async function servedCopy() {
  const dir = await mkdtemp(join(tmpdir(), "pdf-mss-io-update-"));
  await cp("dist", dir, { recursive: true });
  const port = await freePort();
  const server = await startPreview(port, dir);
  return {
    dir,
    origin: `http://localhost:${port}`,
    async stop() {
      await stopPreview(server, port);
      await rm(dir, { recursive: true, force: true });
    },
  };
}

/** A deploy: index.html changes (it gains a marker), and sw.js's precache list says so. */
async function deployNewVersion(dir: string) {
  const index = join(dir, "index.html");
  await writeFile(index, (await readFile(index, "utf8")).replace("</head>", '<meta name="e2e-deploy" content="2"></head>'));
  const sw = join(dir, "sw.js");
  const source = await readFile(sw, "utf8");
  const updated = source.replace(/(url:"index\.html",revision:")[^"]*"/, '$1e2e-deploy-2"');
  expect(updated, "sw.js precache entry for index.html not found").not.toBe(source);
  await writeFile(sw, updated);
}

/** Opens the app and waits until its service worker controls the page. */
async function openInstalled(page: Page, url: string) {
  await page.goto(url);
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
}

const comeBackOnline = (page: Page) => page.evaluate(() => window.dispatchEvent(new Event("online")));
const runsNewVersion = (page: Page) => page.locator('meta[name="e2e-deploy"]').count();

test("a new deployment is offered; Later moves it to the footer, which updates", async ({ page }) => {
  const site = await servedCopy();
  try {
    await openInstalled(page, `${site.origin}/`);
    await deployNewVersion(site.dir);
    await comeBackOnline(page);

    const dialog = page.getByRole("alertdialog", { name: "Update available" });
    await expect(dialog).toBeVisible({ timeout: 15_000 });
    await dialog.getByRole("button", { name: "Later" }).click();
    await expect(dialog).toBeHidden();
    expect(await runsNewVersion(page)).toBe(0);

    await page.getByRole("button", { name: "Update to the latest version" }).click();
    await expect.poll(() => runsNewVersion(page), { timeout: 15_000 }).toBe(1);
    await expect(page.getByRole("button", { name: "Update to the latest version" })).toHaveCount(0);
  } finally {
    await site.stop();
  }
});

test("an update that arrives during a job waits until the job is done", async ({ page }) => {
  const site = await servedCopy();
  try {
    await spaceOutProgress(page, { gapMs: 80 }); // the Compress below takes ~8 s
    await openInstalled(page, `${site.origin}/compress`);
    await chooseFiles(page, "twenty-mb.pdf");
    await page.getByRole("button", { name: "Compress", exact: true }).click();
    await expect(page.getByRole("progressbar")).toBeVisible();

    await deployNewVersion(site.dir);
    await comeBackOnline(page);
    // Ready, but held back: no dialog, and the footer button can't be used yet.
    await expect(page.getByRole("button", { name: "Update to the latest version" })).toBeDisabled({ timeout: 15_000 });
    await expect(page.getByRole("alertdialog")).toHaveCount(0);

    await expect(page.getByText("Your PDF is smaller")).toBeVisible({ timeout: 30_000 });
    const dialog = page.getByRole("alertdialog", { name: "Update available" });
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: "Update now" }).click();
    await expect.poll(() => runsNewVersion(page), { timeout: 15_000 }).toBe(1);
  } finally {
    await site.stop();
  }
});
