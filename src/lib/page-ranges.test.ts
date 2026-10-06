import { expect, test } from "vitest";

import { normalizePageRanges } from "@/lib/page-ranges";

test.each([
  ["1-3", "1-3"],
  [" 1 - 3 , 7 ", "1-3,7"],
  ["5-Z", "5-z"],
  ["z", "z"],
  ["1-3,", "1-3"],
  ["3-1", "3-1"],
  ["1,4-z", "1,4-z"],
])("%j → %j", (input, expected) => {
  expect(normalizePageRanges(input)).toBe(expected);
});

test.each(["", "   ", "abc", "1--3", "1,,2", "0", "0-3", "2-00", "-3", "1-", "1;2"])("%j is invalid", (input) => {
  expect(normalizePageRanges(input)).toBeNull();
});
