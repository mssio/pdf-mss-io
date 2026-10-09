import { useState, useSyncExternalStore } from "react";
import { useRegisterSW } from "virtual:pwa-register/react";

import { isJobRunning, subscribeJobActivity } from "@/lib/job-activity";
import { checkForUpdate, shouldShowUpdatePrompt, startUpdateChecks } from "@/lib/update-check";

/**
 * Registers the service worker, checks for a new deployment while online (see startUpdateChecks), and
 * tracks the update prompt. updateNow() activates the waiting worker and reloads, never during a job.
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
  });
  const jobRunning = useSyncExternalStore(subscribeJobActivity, isJobRunning);
  const [dismissed, setDismissed] = useState(false);

  return {
    updateReady,
    promptOpen: shouldShowUpdatePrompt({ updateReady, dismissed, jobRunning }),
    jobRunning,
    later: () => setDismissed(true),
    updateNow: () => {
      if (!isJobRunning()) void updateServiceWorker(true);
    },
  };
}
