/** The sentence libjpeg's license asks every product that ships it to show. */
export const IJG_ACKNOWLEDGEMENT = "This software is based in part on the work of the Independent JPEG Group.";

export interface LicenseText {
  /** From a `### X` heading just before the text; null when there is none. */
  title: string | null;
  text: string;
}

export interface ThirdPartyLibrary {
  /** The `## ` heading, e.g. "zlib (zlib-1.3.2, via Emscripten 6.0.11 ports)". */
  name: string;
  /** First URL of a "Source: https://…" line, else null. */
  sourceUrl: string | null;
  /** Other prose lines under the heading, backticks stripped. */
  notes: string[];
  licenses: LicenseText[];
}

const FENCE_OPEN = /^````text\s*$/;
const FENCE_CLOSE = "````";
const SOURCE_LINE = /^Source:\s*(https:\/\/\S+)/;

function trimBlankLines(lines: string[]): string {
  let start = 0;
  let end = lines.length;
  while (start < end && lines[start].trim() === "") start++;
  while (end > start && lines[end - 1].trim() === "") end--;
  return lines.slice(start, end).join("\n");
}

/**
 * Splits @mssio/qpdf-wasm's THIRD_PARTY_NOTICES.md into one entry per `## ` library. Everything before the
 * first `## ` is skipped; each ````text fence becomes a license text, named by a preceding `### ` heading.
 */
export function parseThirdPartyNotices(markdown: string): ThirdPartyLibrary[] {
  const libraries: ThirdPartyLibrary[] = [];
  let current: ThirdPartyLibrary | null = null;
  let pendingTitle: string | null = null;
  let fence: string[] | null = null;

  for (const line of markdown.split(/\r?\n/)) {
    if (fence) {
      if (line.trimEnd() === FENCE_CLOSE) {
        current?.licenses.push({ title: pendingTitle, text: trimBlankLines(fence) });
        pendingTitle = null;
        fence = null;
      } else {
        fence.push(line);
      }
      continue;
    }
    if (line.startsWith("## ")) {
      current = { name: line.slice(3).trim(), sourceUrl: null, notes: [], licenses: [] };
      libraries.push(current);
      pendingTitle = null;
      continue;
    }
    if (!current) continue;
    if (line.startsWith("### ")) {
      pendingTitle = line.slice(4).trim();
    } else if (FENCE_OPEN.test(line)) {
      fence = [];
    } else if (line.trim() !== "") {
      const source = SOURCE_LINE.exec(line);
      if (source && current.sourceUrl === null) current.sourceUrl = source[1];
      else current.notes.push(line.trim().replaceAll("`", ""));
    }
  }
  return libraries;
}
