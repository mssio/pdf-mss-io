import { spawn, type ChildProcess } from "node:child_process";
import { createServer } from "node:net";
import { expect, test, type Page } from "@playwright/test";

import { chooseFiles, download } from "./helpers";

// This spec needs the real service worker, so it opts back in (the config blocks it elsewhere).
test.use({ serviceWorkers: "allow" });

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, () => {
      const address = server.address();
      server.close(() => (typeof address === "object" && address ? resolve(address.port) : reject(new Error("no port"))));
    });
  });
}

const running = new Set<ChildProcess>();

function killGroup(child: ChildProcess): void {
  if (!child.pid || child.exitCode !== null) return;
  try {
    process.kill(-child.pid);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ESRCH") throw error; // already gone is fine
  }
}

// Backstop: if the worker exits early (timeout, Ctrl-C), don't leave detached servers behind.
process.once("exit", () => running.forEach(killGroup));

async function startPreview(port: number): Promise<ChildProcess> {
  const child = spawn("npx", ["vite", "preview", "--port", String(port), "--strictPort"], {
    stdio: "ignore",
    detached: true,
  });
  running.add(child);
  try {
    for (let attempt = 0; attempt < 100; attempt++) {
      // --strictPort makes vite exit if the port was taken; never trust another process's answer.
      if (child.exitCode !== null) throw new Error(`vite preview exited early on port ${port}`);
      try {
        await fetch(`http://localhost:${port}/`);
        return child;
      } catch {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    }
    throw new Error(`vite preview did not start on port ${port}`);
  } catch (error) {
    killGroup(child);
    running.delete(child);
    throw error;
  }
}

async function stopPreview(child: ChildProcess, port: number): Promise<void> {
  killGroup(child);
  running.delete(child);
  for (let attempt = 0; attempt < 50; attempt++) {
    try {
      await fetch(`http://localhost:${port}/`);
      await new Promise((resolve) => setTimeout(resolve, 100));
    } catch {
      return; // the server is gone: from now on only the service worker can answer
    }
  }
  throw new Error("vite preview did not stop");
}

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
