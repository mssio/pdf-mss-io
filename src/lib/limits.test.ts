import { afterEach, describe, expect, test, vi } from "vitest";

import { checkSize, isLikelyPhone, MAX_TOTAL_BYTES, PHONE_MAX_BYTES, totalBytes } from "@/lib/limits";

describe("checkSize on a computer", () => {
  test("exactly the limit is allowed", () => {
    expect(checkSize(MAX_TOTAL_BYTES, false)).toEqual({ ok: true });
  });

  test("one byte over the limit is rejected with both sizes", () => {
    expect(checkSize(MAX_TOTAL_BYTES + 1, false)).toEqual({
      ok: false,
      message: "Files must be 250 MB or less in total (you selected 250 MB).",
    });
  });

});

describe("checkSize on a phone", () => {
  test("exactly the phone limit is allowed", () => {
    expect(checkSize(PHONE_MAX_BYTES, true)).toEqual({ ok: true });
  });

  test("over the phone limit is rejected and points to a computer", () => {
    expect(checkSize(260 * 1024 * 1024, true)).toEqual({
      ok: false,
      message: "On phones, files must be 200 MB or less in total (you selected 260 MB). Use a computer for bigger files.",
    });
  });

  test("a 245 MB file (too big for an iPhone's memory) is refused on a phone but fine on a computer", () => {
    const size = 245 * 1024 * 1024;
    expect(checkSize(size, true)).toEqual({
      ok: false,
      message: "On phones, files must be 200 MB or less in total (you selected 245 MB). Use a computer for bigger files.",
    });
    expect(checkSize(size, false)).toEqual({ ok: true });
  });
});

describe("isLikelyPhone", () => {
  afterEach(() => vi.unstubAllGlobals());

  /** `matching` lists the media queries that match on the stubbed device. */
  function stub(deviceMemory: number | undefined, coarseNarrow: boolean, matching: string[] = []) {
    vi.stubGlobal("navigator", { deviceMemory });
    vi.stubGlobal("matchMedia", (query: string) => ({
      matches: matching.includes(query) || (coarseNarrow && query.includes("max-width")),
    }));
  }

  test("a narrow touch screen is a phone, even when Chrome reports plenty of memory", () => {
    stub(8, true);
    expect(isLikelyPhone()).toBe(true);
  });

  test("an iPhone (no deviceMemory) is a phone", () => {
    stub(undefined, true);
    expect(isLikelyPhone()).toBe(true);
  });

  test("a phone held sideways (wider than 820 px, but short) is still a phone", () => {
    stub(undefined, false, ["(pointer: coarse) and (max-height: 500px)"]);
    expect(isLikelyPhone()).toBe(true);
  });

  test("a low-memory device is treated like a phone", () => {
    stub(4, false);
    expect(isLikelyPhone()).toBe(true);
  });

  test("a desktop is not a phone", () => {
    stub(8, false);
    expect(isLikelyPhone()).toBe(false);
    stub(undefined, false);
    expect(isLikelyPhone()).toBe(false);
  });
});

test("totalBytes sums every file", () => {
  const files = [new Blob([new Uint8Array(10)]), new Blob([new Uint8Array(32)])];
  expect(totalBytes(files)).toBe(42);
  expect(totalBytes([])).toBe(0);
});
