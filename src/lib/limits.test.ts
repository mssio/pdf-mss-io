import { describe, expect, test } from "vitest";

import { checkSize, MAX_TOTAL_BYTES, PHONE_WARN_BYTES, totalBytes } from "@/lib/limits";

describe("checkSize", () => {
  test("exactly the limit is allowed", () => {
    expect(checkSize(MAX_TOTAL_BYTES, false)).toEqual({ ok: true, phoneWarning: false });
  });

  test("one byte over the limit is rejected with both sizes", () => {
    const result = checkSize(MAX_TOTAL_BYTES + 1, false);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).toBe("Files must be 250 MB or less in total (you selected 250 MB).");
    }
  });

  test("phone warning only on phones above 100 MB", () => {
    expect(checkSize(PHONE_WARN_BYTES, true)).toEqual({ ok: true, phoneWarning: false });
    expect(checkSize(PHONE_WARN_BYTES + 1, true)).toEqual({ ok: true, phoneWarning: true });
    expect(checkSize(PHONE_WARN_BYTES + 1, false)).toEqual({ ok: true, phoneWarning: false });
  });
});

test("totalBytes sums every file", () => {
  const files = [new Blob([new Uint8Array(10)]), new Blob([new Uint8Array(32)])];
  expect(totalBytes(files)).toBe(42);
  expect(totalBytes([])).toBe(0);
});
