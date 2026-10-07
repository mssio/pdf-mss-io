import { describe, expect, test } from "vitest";

import { describeDuration, describeSizeChange, formatBytes, formatElapsed, parsePdfDate, sizeChange } from "@/lib/format";

describe("formatBytes", () => {
  test.each([
    [0, "0 B"],
    [1023, "1023 B"],
    [1024, "1.0 KB"],
    [1536, "1.5 KB"],
    [10650, "10 KB"],
    [250 * 1024 * 1024, "250 MB"],
    [1024 ** 3, "1.0 GB"],
  ])("%d → %s", (bytes, expected) => {
    expect(formatBytes(bytes)).toBe(expected);
  });
});

describe("sizeChange", () => {
  test("smaller output", () => expect(sizeChange(1000, 730)).toEqual({ smaller: true, percent: 27 }));
  test("same size", () => expect(sizeChange(1000, 1000)).toEqual({ smaller: false, percent: 0 }));
  test("bigger output", () => expect(sizeChange(1000, 1100)).toEqual({ smaller: false, percent: -10 }));
  test("empty input", () => expect(sizeChange(0, 0)).toEqual({ smaller: false, percent: 0 }));
});

describe("parsePdfDate", () => {
  test.each([
    ["D:20260101120000Z", "2026-01-01T12:00:00.000Z"],
    ["D:20260101120000+07'00'", "2026-01-01T05:00:00.000Z"],
    ["D:20260101120000-05'30'", "2026-01-01T17:30:00.000Z"],
    ["D:2026", "2026-01-01T00:00:00.000Z"],
    ["20260315", "2026-03-15T00:00:00.000Z"],
  ])("%s → %s", (raw, iso) => {
    expect(parsePdfDate(raw)?.toISOString()).toBe(iso);
  });

  test("garbage → null", () => expect(parsePdfDate("yesterday")).toBeNull());
});

describe("describeSizeChange", () => {
  test.each([
    [1000, 730, "1000 B → 730 B (−27%)"],
    [1000, 999, "1000 B → 999 B (less than 1% smaller)"],
    [1000, 1000, "1000 B → 1000 B"],
    [1000, 1100, "1000 B → 1.1 KB"],
  ])("%d → %d", (before, after, text) => expect(describeSizeChange(before, after)).toBe(text));
});

describe("formatElapsed", () => {
  test.each([
    [0, "0:00"],
    [999, "0:00"],
    [5_000, "0:05"],
    [102_000, "1:42"],
    [3_725_000, "62:05"],
    [-50, "0:00"],
  ])("%d ms → %s", (ms, expected) => {
    expect(formatElapsed(ms)).toBe(expected);
  });
});

describe("describeDuration", () => {
  test("under a second", () => expect(describeDuration(400)).toBe("Finished in under a second."));
  test("seconds", () => expect(describeDuration(3_400)).toBe("Finished in 0:03."));
  test("minutes", () => expect(describeDuration(102_000)).toBe("Finished in 1:42."));
});
