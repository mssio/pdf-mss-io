/**
 * Remembers that a qpdf job is running, in sessionStorage (per tab, survives a reload). If the browser
 * kills the page mid-job — iOS does this when a file is too big for its memory — the note is still
 * there after the reload, so the app can say what happened instead of looking like a plain refresh.
 */
const KEY = "pdf-mss-io-job-running";

function defaultStorage(): Storage | undefined {
  try {
    return typeof sessionStorage === "undefined" ? undefined : sessionStorage;
  } catch {
    return undefined; // storage access can throw when it's disabled
  }
}

export function markJobStarted(storage: Storage | undefined = defaultStorage()): void {
  try {
    storage?.setItem(KEY, String(Date.now()));
  } catch {
    // private mode or disabled storage: lose the crash notice, never the job
  }
}

export function markJobFinished(storage: Storage | undefined = defaultStorage()): void {
  try {
    storage?.removeItem(KEY);
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

export function clearCrashedJob(storage: Storage | undefined = defaultStorage()): void {
  markJobFinished(storage);
}
