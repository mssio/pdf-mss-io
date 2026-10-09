import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import {
  checkForUpdate,
  createUpdateReload,
  shouldShowUpdatePrompt,
  startUpdateChecks,
  UPDATE_CHECK_INTERVAL_MS,
  UPDATE_CHECK_MIN_GAP_MS,
} from "@/lib/update-check";

describe("startUpdateChecks", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  function setup() {
    const win = new EventTarget();
    const doc = Object.assign(new EventTarget(), { visibilityState: "visible" as DocumentVisibilityState });
    const network = { online: true };
    const check = vi.fn(async () => {});
    const stop = startUpdateChecks({ check, isOnline: () => network.online, win, doc });
    const goOnline = () => win.dispatchEvent(new Event("online"));
    const setVisibility = (state: DocumentVisibilityState) => {
      doc.visibilityState = state;
      doc.dispatchEvent(new Event("visibilitychange"));
    };
    return { check, stop, network, goOnline, setVisibility };
  }

  test("checks once an hour while online", async () => {
    const { check } = setup();
    await vi.advanceTimersByTimeAsync(UPDATE_CHECK_INTERVAL_MS - 1);
    expect(check).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(check).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(UPDATE_CHECK_INTERVAL_MS);
    expect(check).toHaveBeenCalledTimes(2);
  });

  test("never checks while offline", async () => {
    const { check, network, goOnline } = setup();
    network.online = false;
    await vi.advanceTimersByTimeAsync(UPDATE_CHECK_INTERVAL_MS);
    goOnline(); // a stray event while navigator.onLine is still false
    expect(check).not.toHaveBeenCalled();
  });

  test("coming back online always checks, even right after another check", () => {
    const { check, goOnline } = setup();
    goOnline();
    goOnline();
    expect(check).toHaveBeenCalledTimes(2);
  });

  test("returning to the foreground checks at most once a minute", async () => {
    const { check, setVisibility } = setup();
    setVisibility("visible"); // registering just checked
    expect(check).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(UPDATE_CHECK_MIN_GAP_MS);
    setVisibility("visible");
    setVisibility("visible");
    expect(check).toHaveBeenCalledTimes(1);
  });

  test("going to the background doesn't check", async () => {
    const { check, setVisibility } = setup();
    await vi.advanceTimersByTimeAsync(UPDATE_CHECK_MIN_GAP_MS);
    setVisibility("hidden");
    expect(check).not.toHaveBeenCalled();
  });

  test("a failed check is harmless and the next trigger checks again", async () => {
    const { check, goOnline } = setup();
    check.mockRejectedValueOnce(new Error("network"));
    goOnline();
    await vi.advanceTimersByTimeAsync(0);
    goOnline();
    expect(check).toHaveBeenCalledTimes(2);
  });

  test("stop() ends every trigger", async () => {
    const { check, stop, goOnline, setVisibility } = setup();
    stop();
    await vi.advanceTimersByTimeAsync(UPDATE_CHECK_INTERVAL_MS);
    goOnline();
    setVisibility("visible");
    expect(check).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe("checkForUpdate", () => {
  function registration(installing: object | null = null) {
    return { installing, update: vi.fn(async () => {}) } as unknown as Pick<
      ServiceWorkerRegistration,
      "installing" | "update"
    > & { update: ReturnType<typeof vi.fn> };
  }

  test("fetches sw.js without any cache and updates when the server answers 200", async () => {
    const reg = registration();
    const fetchSw = vi.fn(async () => new Response("", { status: 200 }));
    await checkForUpdate("/sw.js", reg, fetchSw);
    expect(fetchSw).toHaveBeenCalledWith("/sw.js", expect.objectContaining({ cache: "no-store" }));
    expect(reg.update).toHaveBeenCalledTimes(1);
  });

  test("a server error or a network failure is never taken for an update", async () => {
    const reg = registration();
    await checkForUpdate("/sw.js", reg, vi.fn(async () => new Response("", { status: 503 })));
    await checkForUpdate("/sw.js", reg, vi.fn(async () => Promise.reject(new TypeError("offline"))));
    expect(reg.update).not.toHaveBeenCalled();
  });

  test("does nothing while an update is already installing", async () => {
    const reg = registration({});
    const fetchSw = vi.fn();
    await checkForUpdate("/sw.js", reg, fetchSw);
    expect(fetchSw).not.toHaveBeenCalled();
  });
});

describe("shouldShowUpdatePrompt", () => {
  test("only for a ready update that wasn't dismissed, never during a job or over an unsaved result", () => {
    for (const updateReady of [false, true])
      for (const dismissed of [false, true])
        for (const jobRunning of [false, true])
          for (const resultShown of [false, true])
            expect(shouldShowUpdatePrompt({ updateReady, dismissed, jobRunning, resultShown })).toBe(
              updateReady && !dismissed && !jobRunning && !resultShown,
            );
  });
});

describe("createUpdateReload", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  function setup(busy: boolean) {
    const state = { busy };
    const listeners = new Set<() => void>();
    const reload = vi.fn();
    const request = createUpdateReload({
      reload,
      isBusy: () => state.busy,
      subscribe: (listener) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
    });
    const settle = (next: boolean) => {
      state.busy = next;
      [...listeners].forEach((listener) => listener());
    };
    return { request, reload, settle, listeners };
  }

  test("reloads at once when nothing is in progress", () => {
    const { request, reload } = setup(false);
    request();
    expect(reload).toHaveBeenCalledTimes(1);
  });

  test("waits until the job or unsaved result is gone, then reloads once", () => {
    const { request, reload, settle, listeners } = setup(true);
    request();
    expect(reload).not.toHaveBeenCalled();
    settle(true);
    expect(reload).not.toHaveBeenCalled();
    settle(false);
    expect(reload).not.toHaveBeenCalled(); // quiet must last a moment first
    vi.advanceTimersByTime(500);
    expect(reload).toHaveBeenCalledTimes(1);
    expect(listeners.size).toBe(0);
  });

  test("a job ending just before its result shows doesn't slip a reload in between", () => {
    const { request, reload, settle } = setup(true);
    request();
    settle(false); // the job finished…
    vi.advanceTimersByTime(10);
    settle(true); // …and its download appeared a moment later
    vi.advanceTimersByTime(1000);
    expect(reload).not.toHaveBeenCalled();
    settle(false);
    vi.advanceTimersByTime(500);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  test("repeated requests (the plugin's listener and ours) reload only once", () => {
    const { request, reload, settle } = setup(true);
    request();
    request();
    settle(false);
    vi.advanceTimersByTime(500);
    request();
    expect(reload).toHaveBeenCalledTimes(1);
  });
});
