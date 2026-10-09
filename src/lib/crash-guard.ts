/**
 * Remembers that a qpdf job is running, in sessionStorage (per tab, survives a reload). If the browser
 * kills the page mid-job — iOS does this when a file is too big for its memory — the note is still
 * there after the reload, so the app can say what happened instead of looking like a plain refresh.
 */
const KEY = "pdf-mss-io-job-running";
/** Jobs still running per storage, so an earlier job finishing can't clear a later job's note. */
const running = new WeakMap<Storage, number>();

function defaultStorage(): Storage | undefined {
  try {
    return typeof sessionStorage === "undefined" ? undefined : sessionStorage;
  } catch {
    return undefined; // storage access can throw when it's disabled
  }
}

export function markJobStarted(storage: Storage | undefined = defaultStorage()): void {
  if (!storage) return;
  running.set(storage, (running.get(storage) ?? 0) + 1);
  try {
    storage.setItem(KEY, String(Date.now()));
  } catch {
    // private mode or disabled storage: lose the crash notice, never the job
  }
}

export function markJobFinished(storage: Storage | undefined = defaultStorage()): void {
  if (!storage) return;
  const left = Math.max(0, (running.get(storage) ?? 0) - 1);
  running.set(storage, left);
  if (left === 0) removeNote(storage);
}

function removeNote(storage: Storage): void {
  try {
    storage.removeItem(KEY);
  } catch {
    // see markJobStarted
  }
}

export function hadCrashedJob(storage: Storage | undefined = defaultStorage()): boolean {
  try {
    return storage?.getItem(KEY) != null;
  } catch {
    return false;
  }
}

/** Called once at start-up: a note from before this page load is old news after it's been shown. */
export function clearCrashedJob(storage: Storage | undefined = defaultStorage()): void {
  if (storage && !running.get(storage)) removeNote(storage);
}

/**
 * Building a download copies the whole output once more, which is when a phone is most likely to run
 * out of memory, after the job itself has finished. Keeps the crash note for `holdMs` after `build`
 * returns (or throws), so a reload in that window is explained too.
 */
export function guardDownload<T>(
  build: () => T,
  { storage = defaultStorage(), holdMs = 2000 }: { storage?: Storage; holdMs?: number } = {},
): T {
  markJobStarted(storage);
  try {
    return build();
  } finally {
    setTimeout(() => markJobFinished(storage), holdMs);
  }
}
