import { describe, expect, test } from "vitest";

import { testBuildLabel } from "@/lib/build-label";

describe("testBuildLabel", () => {
  const builtAt = new Date(2026, 9, 9, 14, 32); // local time: 9 Oct 2026, 14:32:00

  test("names the commit and the local build time", () => {
    expect(testBuildLabel({ commit: "e68a395", dirty: false, builtAt })).toBe("test e68a395 2026-10-09 14:32:00");
  });

  test("marks uncommitted changes", () => {
    expect(testBuildLabel({ commit: "e68a395", dirty: true, builtAt })).toBe("test e68a395-dirty 2026-10-09 14:32:00");
  });

  test("pads single-digit months, days, hours, minutes and seconds", () => {
    expect(testBuildLabel({ commit: "abc1234", dirty: false, builtAt: new Date(2026, 0, 5, 7, 3, 9) })).toBe(
      "test abc1234 2026-01-05 07:03:09",
    );
  });
});
