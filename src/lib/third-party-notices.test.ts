import { readFileSync } from "node:fs";

import { describe, expect, test } from "vitest";

import { IJG_ACKNOWLEDGEMENT, parseThirdPartyNotices } from "@/lib/third-party-notices";

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
        notes: [],
        licenses: [{ title: "LICENSE", text: "# not a heading\nA" }],
      },
      { name: "lib-b", sourceUrl: null, notes: ["Uses x."], licenses: [{ title: null, text: "B" }] },
    ]);
  });

  // Guards against a @mssio/qpdf-wasm upgrade changing the file's format.
  test("parses the notices shipped in @mssio/qpdf-wasm", () => {
    const md = readFileSync("node_modules/@mssio/qpdf-wasm/THIRD_PARTY_NOTICES.md", "utf8");
    const libs = parseThirdPartyNotices(md);
    expect(libs.map((lib) => lib.name.split(" ")[0])).toEqual(["qpdf", "zlib", "libjpeg", "Emscripten", "musl", "libc++"]);
    expect(libs[0].sourceUrl).toBe("https://github.com/qpdf/qpdf");
    expect(libs[0].licenses.map((license) => license.title)).toEqual(["LICENSE.txt", "NOTICE.md"]);
    for (const lib of libs.slice(0, 5)) {
      expect(lib.licenses.length, lib.name).toBeGreaterThan(0);
      for (const license of lib.licenses) expect(license.text.length, lib.name).toBeGreaterThan(0);
    }
    expect(libs[5].notes.length).toBeGreaterThan(0); // libc++: a note only, no license text
    expect(md).toContain(IJG_ACKNOWLEDGEMENT);
  });
});
