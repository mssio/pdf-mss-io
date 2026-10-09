import { describe, expect, test } from "vitest";

import {
  cachedPath,
  isEngineFile,
  offlineLabel,
  offlinePercent,
  offlineState,
  parsePrecacheList,
} from "@/lib/offline-status";

describe("parsePrecacheList", () => {
  test("reads the generated (minified) precache list", () => {
    const source =
      'e.precacheAndRoute([{url:"assets/index-abc.js",revision:null},{url:"index.html",revision:"80b2"},{url:"assets/qpdf-x.wasm",revision:null}],{})';
    expect(parsePrecacheList(source)).toEqual(["assets/index-abc.js", "index.html", "assets/qpdf-x.wasm"]);
  });

  test("also reads quoted keys", () => {
    expect(parsePrecacheList('[{"url":"index.html","revision":"1"}]')).toEqual(["index.html"]);
  });

  test("no list → null", () => {
    expect(parsePrecacheList("self.addEventListener('fetch', () => {})")).toBeNull();
  });
});

test("cachedPath strips the origin and Workbox's revision parameter", () => {
  expect(cachedPath("https://pdf.example/index.html?__WB_REVISION__=80b2")).toBe("index.html");
  expect(cachedPath("https://pdf.example/assets/index-abc.js")).toBe("assets/index-abc.js");
});

test("isEngineFile finds the qpdf wasm", () => {
  expect(isEngineFile("assets/qpdf-DoMQ-ZAf.wasm")).toBe(true);
  expect(isEngineFile("assets/index-abc.js")).toBe(false);
});

describe("offlineState", () => {
  const expected = ["index.html", "assets/a.js", "assets/qpdf-x.wasm"];
  const base = { supported: true, controlled: false, installing: false, active: false, expected, cached: [] as string[] };

  test("no service worker here → unsupported", () => {
    expect(offlineState({ ...base, supported: false })).toEqual({ kind: "unsupported" });
  });

  test("nothing installed → not ready", () => {
    expect(offlineState(base)).toEqual({ kind: "not-ready" });
  });

  test("first install running → downloading, counted against the list", () => {
    expect(offlineState({ ...base, installing: true, cached: ["index.html", "assets/a.js"] })).toEqual({
      kind: "downloading",
      done: 2,
      total: 3,
    });
  });

  test("first install running without a list → downloading with unknown total", () => {
    expect(offlineState({ ...base, installing: true, expected: null, cached: ["index.html"] })).toEqual({
      kind: "downloading",
      done: 1,
      total: null,
    });
  });

  test("active and in control → ready", () => {
    expect(offlineState({ ...base, active: true, controlled: true })).toEqual({ kind: "ready" });
  });

  test("active, not yet in control, but every file cached → ready", () => {
    expect(offlineState({ ...base, active: true, cached: expected })).toEqual({ kind: "ready" });
  });

  test("active, not in control, files missing → still downloading", () => {
    expect(offlineState({ ...base, active: true, cached: ["index.html"] })).toEqual({
      kind: "downloading",
      done: 1,
      total: 3,
    });
  });

  test("an active worker with an update installing is still ready", () => {
    expect(offlineState({ ...base, active: true, controlled: true, installing: true })).toEqual({ kind: "ready" });
  });
});

describe("offlineLabel and offlinePercent", () => {
  test("labels", () => {
    expect(offlineLabel({ kind: "ready" })).toBe("Ready offline");
    expect(offlineLabel({ kind: "downloading", done: 12, total: 30 })).toBe("Downloading for offline use… 40%");
    expect(offlineLabel({ kind: "downloading", done: 12, total: null })).toBe("Downloading for offline use…");
    expect(offlineLabel({ kind: "not-ready" })).toBe("Not available offline yet");
    expect(offlineLabel({ kind: "unsupported" })).toBe("Offline use not available");
  });

  test("a download never shows 100% until it is ready", () => {
    expect(offlinePercent({ kind: "downloading", done: 30, total: 30 })).toBe(99);
    expect(offlinePercent({ kind: "downloading", done: 0, total: 30 })).toBe(0);
    expect(offlinePercent({ kind: "ready" })).toBeNull();
  });
});
