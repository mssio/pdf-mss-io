import { describe, expect, test } from "vitest";

import { isPdfFile, pickPdfFiles } from "@/lib/pdf-files";

const file = (name: string, type = "") => new File(["x"], name, { type });

describe("isPdfFile", () => {
  test("by extension, any case", () => expect(isPdfFile(file("SCAN.PDF"))).toBe(true));
  test("by MIME type without extension", () => expect(isPdfFile(file("download", "application/pdf"))).toBe(true));
  test("other files", () => expect(isPdfFile(file("notes.txt", "text/plain"))).toBe(false));
});

describe("pickPdfFiles", () => {
  test("multiple mode keeps every PDF in order and counts the rest", () => {
    const a = file("a.pdf");
    const b = file("b.pdf");
    const result = pickPdfFiles([a, file("x.txt"), b, file("y.png")], true);
    expect(result.accepted).toEqual([a, b]);
    expect(result.rejectedCount).toBe(2);
  });

  test("single mode keeps only the first PDF", () => {
    const a = file("a.pdf");
    expect(pickPdfFiles([file("x.txt"), a, file("b.pdf")], false)).toEqual({ accepted: [a], rejectedCount: 1 });
  });

  test("nothing usable", () => {
    expect(pickPdfFiles([file("x.txt")], false)).toEqual({ accepted: [], rejectedCount: 1 });
    expect(pickPdfFiles([], true)).toEqual({ accepted: [], rejectedCount: 0 });
  });
});
