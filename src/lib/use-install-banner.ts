import { useState, useSyncExternalStore } from "react";

import { installBannerKind, isIosSafari, readDismissedAt, saveDismissedAt } from "@/lib/install-banner";
import { hasUnsavedResult, isJobRunning, subscribeJobActivity } from "@/lib/job-activity";
import { hasSmallTouchScreen } from "@/lib/limits";

type InstallPromptEvent = Event & { prompt: () => Promise<void> };

// Captured at module load: Chrome can fire it before React mounts, and it fires only once per page.
let savedPrompt: InstallPromptEvent | null = null;
let installed = false;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((listener) => listener());
if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault(); // we show our own banner instead of the browser's mini-infobar
    savedPrompt = event as InstallPromptEvent;
    notify();
  });
  window.addEventListener("appinstalled", () => {
    installed = true;
    savedPrompt = null;
    notify();
  });
}
/**
 * Hands out the saved install prompt once. It lives outside the hook on purpose: inside it, React Compiler
 * treated `const event = savedPrompt` as an alias and read the variable after it was cleared, so prompt()
 * was never called (caught by e2e/install.spec.ts).
 */
function takeSavedPrompt(): InstallPromptEvent | null {
  const event = savedPrompt;
  savedPrompt = null; // usable once
  notify();
  return event;
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

function isStandalone(): boolean {
  const iosStandalone = (navigator as Navigator & { standalone?: boolean }).standalone === true;
  return iosStandalone || (typeof matchMedia === "function" && matchMedia("(display-mode: standalone)").matches);
}

/** Whether to offer installing the app on this phone, and the banner's actions (spec section 10). */
export function useInstallBanner() {
  const promptAvailable = useSyncExternalStore(subscribe, () => savedPrompt !== null);
  const justInstalled = useSyncExternalStore(subscribe, () => installed);
  const busy = useSyncExternalStore(subscribeJobActivity, () => isJobRunning() || hasUnsavedResult());
  const [dismissedAt, setDismissedAt] = useState(() => readDismissedAt());
  const [env] = useState(() => ({
    smallTouchScreen: hasSmallTouchScreen(),
    standalone: isStandalone(),
    iosSafari: isIosSafari(navigator.userAgent, navigator.maxTouchPoints ?? 0),
  }));
  // The page's start time is enough: a dismissal made after it still counts as within the 30 days.
  const [now] = useState(() => Date.now());

  const kind = justInstalled
    ? null
    : installBannerKind({ ...env, promptAvailable, dismissedAt, now, busy });

  return {
    kind,
    install: () => {
      void takeSavedPrompt()?.prompt();
    },
    dismiss: () => {
      const at = Date.now();
      saveDismissedAt(at);
      setDismissedAt(at);
    },
  };
}
