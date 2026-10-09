/** "Not now" hides the install banner this long. */
export const INSTALL_DISMISS_MS = 30 * 24 * 60 * 60 * 1000;
const KEY = "pdf-mss-io-install-dismissed";

/**
 * Safari on iPhone/iPod/iPad (iPads report a Mac user agent but have touch). Other iOS browsers and in-app
 * browsers (Google app, Facebook, Instagram, …) have different menus than the screenshots, so they're left
 * out. Brave sends Safari's exact user agent and can't be told apart.
 */
const NOT_SAFARI = /CriOS|FxiOS|EdgiOS|OPiOS|OPT\/|GSA\/|DuckDuckGo|Ddg\/|YaBrowser|FBAN|FBIOS|Instagram|Line\//;

export function isIosSafari(userAgent: string, maxTouchPoints: number): boolean {
  const ios = /iPhone|iPod|iPad/.test(userAgent) || (/Macintosh/.test(userAgent) && maxTouchPoints > 1);
  return ios && /Safari\//.test(userAgent) && !NOT_SAFARI.test(userAgent);
}

/** Which banner to show, if any (spec section 10). */
export function installBannerKind({
  smallTouchScreen,
  standalone,
  iosSafari,
  promptAvailable,
  dismissedAt,
  now,
  busy,
}: {
  smallTouchScreen: boolean;
  standalone: boolean;
  iosSafari: boolean;
  promptAvailable: boolean;
  dismissedAt: number | null;
  now: number;
  busy: boolean;
}): "android" | "ios" | null {
  if (!smallTouchScreen || standalone || busy) return null;
  if (dismissedAt !== null && now - dismissedAt < INSTALL_DISMISS_MS) return null;
  if (promptAvailable) return "android";
  if (iosSafari) return "ios";
  return null;
}

function defaultStorage(): Storage | undefined {
  try {
    return typeof localStorage === "undefined" ? undefined : localStorage;
  } catch {
    return undefined;
  }
}

export function readDismissedAt(storage: Storage | undefined = defaultStorage()): number | null {
  try {
    const value = Number(storage?.getItem(KEY));
    return storage?.getItem(KEY) != null && Number.isFinite(value) ? value : null;
  } catch {
    return null;
  }
}

export function saveDismissedAt(now: number, storage: Storage | undefined = defaultStorage()): void {
  try {
    storage?.setItem(KEY, String(now));
  } catch {
    // private mode or disabled storage: the banner shows again next visit
  }
}
