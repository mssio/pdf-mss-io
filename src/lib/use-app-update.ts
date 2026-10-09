import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useRegisterSW } from "virtual:pwa-register/react";

import { hasUnsavedResult, isJobRunning, subscribeJobActivity } from "@/lib/job-activity";
import { checkForUpdate, createUpdateReload, shouldShowUpdatePrompt, startUpdateChecks } from "@/lib/update-check";

/** Set when the user taps "Update now" here: their own reload doesn't wait for a result on screen. */
let userAsked = false;

/**
 * One reload per page once a new version controls it. Every tab gets it (activation switches them all):
 * it waits for a running job, and in a tab where the user didn't ask, for a result still on screen.
 */
const reloadForUpdate = createUpdateReload({
  reload: () => window.location.reload(),
  isBusy: () => isJobRunning() || (!userAsked && hasUnsavedResult()),
  subscribe: subscribeJobActivity,
});

/**
 * Registers the service worker, checks for a new deployment while online (see startUpdateChecks), and
 * tracks the update prompt. updateNow() activates the waiting worker; the page then reloads (never
 * during a job). AppShell mounts this once for the life of the page, so the checks are never stopped.
 */
export function useAppUpdate() {
  const {
    needRefresh: [updateReady],
    updateServiceWorker,
  } = useRegisterSW({
    immediate: true,
    onRegisteredSW(swUrl, registration) {
      if (!registration) return;
      startUpdateChecks({ check: () => checkForUpdate(swUrl, registration), isOnline: () => navigator.onLine });
    },
    // The plugin reloads by itself only on pages that were controlled when they loaded; ours defers.
    onNeedReload: reloadForUpdate,
  });
  const resultShown = useSyncExternalStore(subscribeJobActivity, hasUnsavedResult);
  const jobRunning = useSyncExternalStore(subscribeJobActivity, isJobRunning);
  const [dismissed, setDismissed] = useState(false);
  const updateReadyRef = useRef(updateReady);

  useEffect(() => {
    updateReadyRef.current = updateReady;
  }, [updateReady]);

  // Pages that started without a controlling worker (the first visit, a hard reload) never get the
  // plugin's reload; a new controller while an update was waiting means the update took over.
  useEffect(() => {
    const container = navigator.serviceWorker;
    if (!container) return;
    const onControllerChange = () => {
      if (updateReadyRef.current) reloadForUpdate();
    };
    container.addEventListener("controllerchange", onControllerChange);
    return () => container.removeEventListener("controllerchange", onControllerChange);
  }, []);

  return {
    updateReady,
    promptOpen: shouldShowUpdatePrompt({ updateReady, dismissed, jobRunning, resultShown }),
    jobRunning,
    later: () => setDismissed(true),
    updateNow: () => {
      if (isJobRunning()) return;
      userAsked = true;
      void updateServiceWorker(true);
    },
  };
}
