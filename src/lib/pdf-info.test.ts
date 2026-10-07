import { describe, expect, test } from "vitest";

import { describePageSize, parseQpdfJson } from "@/lib/pdf-info";

const sample = {
  pages: [{ object: "4 0 R" }, { object: "5 0 R" }],
  attachments: { "notes.txt": { preferredname: "notes.txt" }, key2: {} },
  encrypt: { encrypted: false },
  qpdf: [
    { jsonversion: 2 },
    {
      trailer: { value: { "/Info": "9 0 R", "/Root": "1 0 R" } },
      "obj:3 0 R": { value: { "/Type": "/Pages", "/MediaBox": [0, 0, 595.28, 841.89], "/Kids": ["4 0 R", "5 0 R"] } },
      "obj:4 0 R": { value: { "/Type": "/Page", "/Parent": "3 0 R" } },
      "obj:5 0 R": { value: { "/Type": "/Page", "/Parent": "3 0 R", "/MediaBox": "7 0 R" } },
      "obj:7 0 R": { value: [0, 0, 612, 792] },
      "obj:8 0 R": { value: "u:Indirect subject" },
      "obj:9 0 R": {
        value: {
          "/Title": "u:Quarterly report",
          "/Author": "u:Mario",
          "/Subject": "8 0 R",
          "/Producer": "b:feff0041",
          "/CreationDate": "u:D:20260101120000Z",
          "/ModDate": "u:not a date",
        },
      },
    },
  ],
};

describe("parseQpdfJson", () => {
  const details = parseQpdfJson(sample);

  test("document info: u: strings, references, skipped binary strings, dates", () => {
    expect(details.document).toEqual({
      title: "Quarterly report",
      author: "Mario",
      subject: "Indirect subject",
      created: new Date("2026-01-01T12:00:00.000Z"),
    });
  });

  test("inherited MediaBox, named size and mixed sizes", () => {
    expect(details.firstPageSize).toEqual({ widthPt: 595.28, heightPt: 841.89, name: "A4", landscape: false });
    expect(details.mixedSizes).toBe(true);
  });

  test("attachments use preferredname, falling back to the key", () => {
    expect(details.attachments).toEqual(["notes.txt", "key2"]);
  });

  test("not encrypted", () => expect(details.security).toEqual({ encrypted: false }));

  test("restriction-only security lists denied permissions", () => {
    const parsed = parseQpdfJson({
      ...sample,
      encrypt: {
        encrypted: true,
        parameters: { method: "AESv3" },
        capabilities: { printhigh: false, modifyother: true, extract: true, modifyannotations: false },
      },
    });
    expect(parsed.security).toEqual({ encrypted: true, method: "AES-256", denied: ["Printing", "Comments and forms"] });
  });

  test("empty or unexpected JSON gives empty details", () => {
    expect(parseQpdfJson({})).toEqual({
      document: {},
      firstPageSize: null,
      mixedSizes: false,
      attachments: [],
      security: { encrypted: false },
    });
    expect(parseQpdfJson(null).firstPageSize).toBeNull();
  });
});

describe("describePageSize", () => {
  test.each([
    [{ widthPt: 595.28, heightPt: 841.89, name: "A4", landscape: false }, "A4 · 210 × 297 mm (8.27 × 11.69 in)"],
    [{ widthPt: 841.89, heightPt: 595.28, name: "A4", landscape: true }, "A4 landscape · 297 × 210 mm (11.69 × 8.27 in)"],
    [{ widthPt: 612, heightPt: 792, name: "Letter", landscape: false }, "Letter · 216 × 279 mm (8.50 × 11.00 in)"],
    [{ widthPt: 500, heightPt: 500, name: null, landscape: false }, "176 × 176 mm (6.94 × 6.94 in)"],
  ])("%j → %s", (size, expected) => {
    expect(describePageSize(size)).toBe(expected);
  });
});
