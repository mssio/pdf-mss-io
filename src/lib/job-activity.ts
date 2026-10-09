/**
 * Whether any qpdf job is running in this tab, and whether a finished job's download is still on screen.
 * The update prompt reads both: updating reloads the page, which must never lose a job or its result.
 * useQpdfJob reports jobs; useBlobUrl reports shown downloads.
 */
let running = 0;
let results = 0;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((listener) => listener());

export function jobStarted(): void {
  running++;
  notify();
}

export function jobFinished(): void {
  running = Math.max(0, running - 1);
  notify();
}

export function isJobRunning(): boolean {
  return running > 0;
}

export function resultShown(): void {
  results++;
  notify();
}

export function resultCleared(): void {
  results = Math.max(0, results - 1);
  notify();
}

export function hasUnsavedResult(): boolean {
  return results > 0;
}

export function subscribeJobActivity(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
