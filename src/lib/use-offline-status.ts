import { useEffect, useState } from "react";

import { cachedPath, type OfflineState, offlineState, parsePrecacheList } from "@/lib/offline-status";

export type OfflineSnapshot = { state: OfflineState; expected: string[] | null; cached: string[] };

/** Every path in Workbox's precache caches. */
async function cachedPaths(): Promise<string[]> {
  const paths: string[] = [];
  for (const name of await caches.keys()) {
    if (!name.startsWith("workbox-precache")) continue;
    for (const request of await (await caches.open(name)).keys()) paths.push(cachedPath(request.url));
  }
  return paths;
}

async function readSnapshot(known: string[] | null): Promise<OfflineSnapshot> {
  const supported = window.isSecureContext && "serviceWorker" in navigator && "caches" in window;
  if (!supported) return { state: { kind: "unsupported" }, expected: known, cached: [] };
  const registration = await navigator.serviceWorker.getRegistration();
  const cached = await cachedPaths();
  let expected = known;
  if (!expected && navigator.onLine) {
    const response = await fetch("/sw.js", { cache: "no-store" }).catch(() => null);
    if (response?.ok) expected = parsePrecacheList(await response.text());
  }
  const state = offlineState({
    supported,
    controlled: navigator.serviceWorker.controller !== null,
    installing: Boolean(registration?.installing),
    active: Boolean(registration?.active),
    expected,
    cached,
  });
  return { state, expected, cached };
}

/**
 * Whether this device can use the app offline (spec section 8). Re-reads once a second while
 * downloading or not ready, and on controllerchange / online / offline. null until the first read.
 */
export function useOfflineStatus(): OfflineSnapshot | null {
  const [snapshot, setSnapshot] = useState<OfflineSnapshot | null>(null);

  useEffect(() => {
    let cancelled = false;
    let reading = false;
    let expected: string[] | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const refresh = async () => {
      if (reading) return;
      reading = true;
      clearTimeout(timer);
      try {
        const next = await readSnapshot(expected).catch(() => null);
        if (cancelled || !next) return;
        expected = next.expected;
        setSnapshot(next);
        if (next.state.kind === "downloading" || next.state.kind === "not-ready") timer = setTimeout(refresh, 1000);
      } finally {
        reading = false;
      }
    };
    const onChange = () => void refresh();
    void refresh();
    navigator.serviceWorker?.addEventListener("controllerchange", onChange);
    window.addEventListener("online", onChange);
    window.addEventListener("offline", onChange);
    return () => {
      cancelled = true;
      clearTimeout(timer);
      navigator.serviceWorker?.removeEventListener("controllerchange", onChange);
      window.removeEventListener("online", onChange);
      window.removeEventListener("offline", onChange);
    };
  }, []);

  return snapshot;
}
