import { describe, expect, test } from "vitest";

import { INSTALL_DISMISS_MS, installBannerKind, isIosSafari, readDismissedAt, saveDismissedAt } from "@/lib/install-banner";

const IPHONE_SAFARI =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1";
const IPHONE_CHROME = IPHONE_SAFARI.replace("Version/26.0", "CriOS/141.0.0.0");
const IPHONE_FIREFOX = IPHONE_SAFARI.replace("Version/26.0", "FxiOS/143.0");
const IPHONE_EDGE = IPHONE_SAFARI.replace("Version/26.0", "EdgiOS/141.0");
const MAC_SAFARI =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Safari/605.1.15";
const ANDROID_CHROME =
  "Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36";

describe("isIosSafari", () => {
  test("iPhone Safari yes; other iOS browsers no", () => {
    expect(isIosSafari(IPHONE_SAFARI, 5)).toBe(true);
    expect(isIosSafari(IPHONE_CHROME, 5)).toBe(false);
    expect(isIosSafari(IPHONE_FIREFOX, 5)).toBe(false);
    expect(isIosSafari(IPHONE_EDGE, 5)).toBe(false);
  });

  test("an iPad reports a Mac user agent but has touch; a real Mac doesn't", () => {
    expect(isIosSafari(MAC_SAFARI, 5)).toBe(true);
    expect(isIosSafari(MAC_SAFARI, 0)).toBe(false);
  });

  test("Android is never iOS", () => {
    expect(isIosSafari(ANDROID_CHROME, 5)).toBe(false);
  });
});

describe("installBannerKind", () => {
  const now = 1_000_000_000_000;
  const base = {
    smallTouchScreen: true,
    standalone: false,
    iosSafari: false,
    promptAvailable: false,
    dismissedAt: null as number | null,
    now,
    busy: false,
  };

  test("Android with an install prompt → android; iPhone Safari → ios", () => {
    expect(installBannerKind({ ...base, promptAvailable: true })).toBe("android");
    expect(installBannerKind({ ...base, iosSafari: true })).toBe("ios");
  });

  test("no install path → nothing", () => {
    expect(installBannerKind(base)).toBeNull();
  });

  test("each condition turns it off", () => {
    const ready = { ...base, promptAvailable: true };
    expect(installBannerKind({ ...ready, smallTouchScreen: false })).toBeNull();
    expect(installBannerKind({ ...ready, standalone: true })).toBeNull();
    expect(installBannerKind({ ...ready, busy: true })).toBeNull();
    expect(installBannerKind({ ...ready, dismissedAt: now - 1000 })).toBeNull();
  });

  test("Not now lasts 30 days", () => {
    const ready = { ...base, iosSafari: true };
    expect(installBannerKind({ ...ready, dismissedAt: now - INSTALL_DISMISS_MS + 1 })).toBeNull();
    expect(installBannerKind({ ...ready, dismissedAt: now - INSTALL_DISMISS_MS })).toBe("ios");
  });
});

describe("dismissal storage", () => {
  function memoryStorage(initial: Record<string, string> = {}): Storage {
    const data = new Map(Object.entries(initial));
    return {
      get length() {
        return data.size;
      },
      clear: () => data.clear(),
      getItem: (key) => data.get(key) ?? null,
      key: (index) => [...data.keys()][index] ?? null,
      removeItem: (key) => void data.delete(key),
      setItem: (key, value) => void data.set(key, String(value)),
    };
  }

  test("round-trips the time", () => {
    const storage = memoryStorage();
    expect(readDismissedAt(storage)).toBeNull();
    saveDismissedAt(1234, storage);
    expect(readDismissedAt(storage)).toBe(1234);
  });

  test("garbage reads as never dismissed", () => {
    expect(readDismissedAt(memoryStorage({ "pdf-mss-io-install-dismissed": "soon" }))).toBeNull();
  });

  test("storage that throws is ignored", () => {
    const throwing = {
      getItem: () => {
        throw new Error("denied");
      },
      setItem: () => {
        throw new Error("denied");
      },
    } as unknown as Storage;
    expect(readDismissedAt(throwing)).toBeNull();
    expect(() => saveDismissedAt(1, throwing)).not.toThrow();
  });
});
