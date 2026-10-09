import { describe, expect, test } from "vitest";

import { testBuildLabel } from "@/lib/build-label";

describe("testBuildLabel", () => {
  const builtAt = new Date(2026, 9, 9, 14, 32); // local time: 9 Oct 2026, 14:32

  test("names the commit and the local build time", () => {
    expect(testBuildLabel({ commit: "e68a395", dirty: false, builtAt })).toBe("test e68a395 10-09 14:32");
  });

  test("marks uncommitted changes", () => {
    expect(testBuildLabel({ commit: "e68a395", dirty: true, builtAt })).toBe("test e68a395-dirty 10-09 14:32");
  });

  test("pads single-digit months, days, hours and minutes", () => {
    expect(testBuildLabel({ commit: "abc1234", dirty: false, builtAt: new Date(2026, 0, 5, 7, 3) })).toBe(
      "test abc1234 01-05 07:03",
    );
  });
});
