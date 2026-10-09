/** How often an open app checks for a new deployment while online. */
export const UPDATE_CHECK_INTERVAL_MS = 60 * 60 * 1000;
/** Returning to the foreground checks only if the last check was at least this long ago. */
export const UPDATE_CHECK_MIN_GAP_MS = 60 * 1000;

type Listenable = Pick<EventTarget, "addEventListener" | "removeEventListener">;

export type UpdateCheckOptions = {
  check: () => Promise<void>;
  isOnline: () => boolean;
  intervalMs?: number;
  minGapMs?: number;
  win?: Listenable;
  doc?: Listenable & { readonly visibilityState: DocumentVisibilityState };
  now?: () => number;
};

/**
 * Checks for a new deployment hourly, whenever the device comes back online, and when the app returns
 * to the foreground (at most once per minGapMs). Never while offline. Returns a function that stops it.
 */
export function startUpdateChecks({
  check,
  isOnline,
  intervalMs = UPDATE_CHECK_INTERVAL_MS,
  minGapMs = UPDATE_CHECK_MIN_GAP_MS,
  win = window,
  doc = document,
  now = Date.now,
}: UpdateCheckOptions): () => void {
  let lastCheck = now(); // registering the service worker has just checked
  const run = (throttled: boolean) => {
    if (!isOnline()) return;
    if (throttled && now() - lastCheck < minGapMs) return;
    lastCheck = now();
    check().catch(() => {}); // a failed check just waits for the next trigger
  };
  const onOnline = () => run(false);
  const onVisibility = () => {
    if (doc.visibilityState === "visible") run(true);
  };
  const timer = setInterval(() => run(false), intervalMs);
  win.addEventListener("online", onOnline);
  doc.addEventListener("visibilitychange", onVisibility);
  return () => {
    clearInterval(timer);
    win.removeEventListener("online", onOnline);
    doc.removeEventListener("visibilitychange", onVisibility);
  };
}

/**
 * One check, following vite-plugin-pwa's recipe for edge cases: only if sw.js is reachable (HTTP 200)
 * does the browser compare it with the installed one, so a down server never looks like an update.
 */
export async function checkForUpdate(
  swUrl: string,
  registration: Pick<ServiceWorkerRegistration, "installing" | "update">,
  fetchSw: typeof fetch = fetch,
): Promise<void> {
  if (registration.installing) return;
  const response = await fetchSw(swUrl, { cache: "no-store", headers: { "cache-control": "no-cache" } }).catch(
    () => null,
  );
  if (response?.status === 200) await registration.update();
}

/**
 * The dialog shows for a ready update the user hasn't put off, never while a job runs and never over a
 * result that is still on screen (updating reloads, which would lose both).
 */
export function shouldShowUpdatePrompt({
  updateReady,
  dismissed,
  jobRunning,
  resultShown,
}: {
  updateReady: boolean;
  dismissed: boolean;
  jobRunning: boolean;
  resultShown: boolean;
}): boolean {
  return updateReady && !dismissed && !jobRunning && !resultShown;
}

/**
 * The reload after a new version takes control. Returns `request()`: it reloads at once when nothing is
 * in progress, otherwise once `isBusy()` has stayed false for `settleMs` (a job ends a moment before its
 * download shows, and neither counts as busy in between), and only ever once (both the plugin's
 * listener and our own controllerchange listener may ask).
 */
export function createUpdateReload({
  reload,
  isBusy,
  subscribe,
  settleMs = 500,
}: {
  reload: () => void;
  isBusy: () => boolean;
  subscribe: (listener: () => void) => () => void;
  settleMs?: number;
}): () => void {
  let requested = false;
  return () => {
    if (requested) return;
    requested = true;
    if (!isBusy()) {
      reload();
      return;
    }
    let timer: ReturnType<typeof setTimeout> | undefined;
    const unsubscribe = subscribe(() => {
      clearTimeout(timer);
      if (isBusy()) return;
      timer = setTimeout(() => {
        if (isBusy()) return;
        unsubscribe();
        reload();
      }, settleMs);
    });
  };
}
