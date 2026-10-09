import { spawn, type ChildProcess } from "node:child_process";
import { createServer } from "node:net";

/** Preview servers for specs that need a real service worker (offline.spec.ts, update.spec.ts). */

export function freePort(): Promise<number> {
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

export async function startPreview(port: number, outDir?: string): Promise<ChildProcess> {
  const child = spawn(
    "npx",
    ["vite", "preview", "--port", String(port), "--strictPort", ...(outDir ? ["--outDir", outDir] : [])],
    { stdio: "ignore", detached: true },
  );
  running.add(child);
  try {
    // Up to 30 s: `npx vite preview` can start slowly on a busy machine.
    for (let attempt = 0; attempt < 300; attempt++) {
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

export async function stopPreview(child: ChildProcess, port: number): Promise<void> {
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
