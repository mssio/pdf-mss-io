import { describe, expect, test } from "vitest";

import { outputFilename } from "@/lib/filename";

describe("outputFilename", () => {
  test.each([
    ["report.pdf", "-d", "report-d.pdf"],
    ["scan.final.PDF", "-compressed", "scan.final-compressed.PDF"],
    ["noext", "-d", "noext-d.pdf"],
    [".hidden", "-pages", ".hidden-pages.pdf"],
    ["C:\\Users\\me\\tax.pdf", "-protected", "tax-protected.pdf"],
    ["/home/me/tax.pdf", "-protected", "tax-protected.pdf"],
    ["   ", "-d", "document-d.pdf"],
    ["", "-d", "document-d.pdf"],
    ["  spaced.pdf  ", "-d", "spaced-d.pdf"],
    ["résumé 2026.pdf", "-d", "résumé 2026-d.pdf"],
  ])("%j + %j → %j", (name, suffix, expected) => {
    expect(outputFilename(name, suffix)).toBe(expected);
  });
});
