/** Whether this device can use PDF Toolbox offline (spec section 8). */
export type OfflineState =
  | { kind: "ready" }
  | { kind: "downloading"; done: number; total: number | null }
  | { kind: "not-ready" }
  | { kind: "unsupported" };

const ENTRY = /\{\s*"?url"?\s*:\s*"([^"]+)"\s*,\s*"?revision"?\s*:\s*(?:"[^"]*"|null)\s*\}/g;

/** The files the build precaches, from the generated sw.js; null if the list can't be found. */
export function parsePrecacheList(source: string): string[] | null {
  const paths = [...source.matchAll(ENTRY)].map((match) => match[1]);
  return paths.length > 0 ? paths : null;
}

/** A precache cache key ("https://host/index.html?__WB_REVISION__=…") as a precache-list path. */
export function cachedPath(url: string): string {
  return new URL(url).pathname.replace(/^\//, "");
}

export function isEngineFile(path: string): boolean {
  return /qpdf-[^/]*\.wasm$/.test(path);
}

export function offlineState({
  supported,
  controlled,
  installing,
  active,
  expected,
  cached,
}: {
  supported: boolean;
  controlled: boolean;
  installing: boolean;
  active: boolean;
  expected: string[] | null;
  cached: string[];
}): OfflineState {
  if (!supported) return { kind: "unsupported" };
  const have = new Set(cached);
  const done = expected ? expected.filter((path) => have.has(path)).length : have.size;
  const complete = expected !== null && done === expected.length;
  if (active && (controlled || complete)) return { kind: "ready" };
  if (installing || active) return { kind: "downloading", done, total: expected?.length ?? null };
  return { kind: "not-ready" };
}

/** Download percent, capped at 99 until the worker is active and the state is ready. */
export function offlinePercent(state: OfflineState): number | null {
  if (state.kind !== "downloading" || !state.total) return null;
  return Math.min(99, Math.floor((state.done / state.total) * 100));
}

export function offlineLabel(state: OfflineState): string {
  switch (state.kind) {
    case "ready":
      return "Ready offline";
    case "downloading": {
      const percent = offlinePercent(state);
      return percent === null ? "Downloading for offline use…" : `Downloading for offline use… ${percent}%`;
    }
    case "not-ready":
      return "Not available offline yet";
    case "unsupported":
      return "Offline use not available";
  }
}
