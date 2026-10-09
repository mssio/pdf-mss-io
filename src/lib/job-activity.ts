/**
 * Whether any qpdf job is running in this tab. The update prompt reads it: updating reloads the page,
 * which must never happen mid-job. useQpdfJob reports starts and finishes.
 */
let running = 0;
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

export function subscribeJobActivity(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
