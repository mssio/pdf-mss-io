import { describe, expect, test } from "vitest";

import { IJG_ACKNOWLEDGEMENT, parseThirdPartyNotices } from "@/lib/third-party-notices";
// Same import as AboutPage.tsx.
import shippedNotices from "../../node_modules/@mssio/qpdf-wasm/THIRD_PARTY_NOTICES.md?raw";

describe("parseThirdPartyNotices", () => {
  test("splits libraries, titled and untitled fences, source and notes", () => {
    const md = [
      "# T",
      "",
      "intro",
      "",
      "## lib-a 1.0",
      "",
      "Source: https://example.com/a (tag v1), compiled.",
      "",
      "### LICENSE",
      "",
      "````text",
      "",
      "# not a heading",
      "A",
      "",
      "````",
      "",
      "## lib-b",
      "",
      "Uses `x`.",
      "",
      "````text",
      "B",
      "````",
      "",
    ].join("\n");
    expect(parseThirdPartyNotices(md)).toEqual([
      {
        name: "lib-a 1.0",
        sourceUrl: "https://example.com/a",
        sourceDetail: "(tag v1), compiled.",
        notes: [],
        licenses: [{ title: "LICENSE", text: "# not a heading\nA" }],
      },
      { name: "lib-b", sourceUrl: null, sourceDetail: null, notes: ["Uses x."], licenses: [{ title: null, text: "B" }] },
    ]);
  });

  test("punctuation after a source URL stays out of the link", () => {
    const [lib] = parseThirdPartyNotices("## z\n\nSource: https://github.com/madler/zlib, via Emscripten ports.\n");
    expect(lib.sourceUrl).toBe("https://github.com/madler/zlib");
    expect(lib.sourceDetail).toBe(", via Emscripten ports.");
    const [bare] = parseThirdPartyNotices("## z\n\nSource: https://example.com/z.\n");
    expect(bare.sourceUrl).toBe("https://example.com/z");
    expect(bare.sourceDetail).toBe(".");
  });

  test("accepts any fence of four or more backticks, closed by the same run", () => {
    const md = "## a\n\n`````txt\nX\n````\nY\n`````\n\n````\nZ\n````\n";
    expect(parseThirdPartyNotices(md)[0].licenses).toEqual([
      { title: null, text: "X\n````\nY" },
      { title: null, text: "Z" },
    ]);
  });

  test("an unclosed fence throws instead of dropping a license", () => {
    expect(() => parseThirdPartyNotices("## a\n\n````text\nX\n")).toThrow(/unclosed/i);
  });

  test("a ### heading followed by prose doesn't name the next fence", () => {
    const md = "## a\n\n### Notes\n\nSome prose.\n\n````text\nL\n````\n";
    expect(parseThirdPartyNotices(md)[0]).toMatchObject({
      notes: ["Notes", "Some prose."],
      licenses: [{ title: null, text: "L" }],
    });
  });

  // Guards against a @mssio/qpdf-wasm upgrade changing the file's format.
  test("parses the notices shipped in @mssio/qpdf-wasm", () => {
    const md = shippedNotices;
    const libs = parseThirdPartyNotices(md);
    expect(libs.map((lib) => lib.name.split(" ")[0])).toEqual(["qpdf", "zlib", "libjpeg", "Emscripten", "musl", "libc++"]);
    expect(libs[0].sourceUrl).toBe("https://github.com/qpdf/qpdf");
    expect(libs[0].sourceDetail).toBe("(tag v12.4.2), compiled unmodified.");
    expect(libs.map((lib) => lib.licenses.length)).toEqual([2, 1, 1, 1, 1, 0]);
    expect(libs[0].licenses.map((license) => license.title)).toEqual(["LICENSE.txt", "NOTICE.md"]);
    for (const lib of libs.slice(0, 5)) {
      expect(lib.licenses.length, lib.name).toBeGreaterThan(0);
      for (const license of lib.licenses) expect(license.text.length, lib.name).toBeGreaterThan(0);
    }
    expect(libs[5].notes.length).toBeGreaterThan(0); // libc++: a note only, no license text
    expect(md).toContain(IJG_ACKNOWLEDGEMENT);
  });
});
