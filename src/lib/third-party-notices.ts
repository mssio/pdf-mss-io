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
  /** The URL of a "Source: https://…" line (trailing punctuation left out), else null. */
  sourceUrl: string | null;
  /** The rest of that line, e.g. "(tag v12.4.2), compiled unmodified."; null without a source line. */
  sourceDetail: string | null;
  /** Other prose lines under the heading, backticks stripped. */
  notes: string[];
  licenses: LicenseText[];
}

/** Four or more backticks, optionally followed by an info string ("text", "txt", …). */
const FENCE_OPEN = /^(`{4,})[^`]*$/;
/** The URL runs to the first space; punctuation at its end belongs to the sentence. */
const SOURCE_LINE = /^Source:\s*(https:\/\/\S*?)([.,;:)>]*)(?=\s|$)(.*)$/;

function trimBlankLines(lines: string[]): string {
  let start = 0;
  let end = lines.length;
  while (start < end && lines[start].trim() === "") start++;
  while (end > start && lines[end - 1].trim() === "") end--;
  return lines.slice(start, end).join("\n");
}

/**
 * Splits @mssio/qpdf-wasm's THIRD_PARTY_NOTICES.md into one entry per `## ` library. Everything before the
 * first `## ` is skipped; each fence of 4+ backticks becomes a license text, named by a `### ` heading right before it.
 * Throws on an unclosed fence, so a broken file fails the tests instead of losing a license.
 */
export function parseThirdPartyNotices(markdown: string): ThirdPartyLibrary[] {
  const libraries: ThirdPartyLibrary[] = [];
  let current: ThirdPartyLibrary | null = null;
  let pendingTitle: string | null = null;
  let fence: string[] | null = null;
  let fenceMarker = "";

  for (const line of markdown.split(/\r?\n/)) {
    if (fence) {
      if (line.trimEnd() === fenceMarker) {
        current?.licenses.push({ title: pendingTitle, text: trimBlankLines(fence) });
        pendingTitle = null;
        fence = null;
      } else {
        fence.push(line);
      }
      continue;
    }
    if (line.startsWith("## ")) {
      current = { name: line.slice(3).trim(), sourceUrl: null, sourceDetail: null, notes: [], licenses: [] };
      libraries.push(current);
      pendingTitle = null;
      continue;
    }
    if (!current) continue;
    const open = FENCE_OPEN.exec(line);
    if (line.startsWith("### ")) {
      pendingTitle = line.slice(4).trim();
    } else if (open) {
      fence = [];
      fenceMarker = open[1];
    } else if (line.trim() !== "") {
      // A heading followed by prose is a section of notes, not the name of a later license.
      if (pendingTitle !== null) {
        current.notes.push(pendingTitle.replaceAll("`", ""));
        pendingTitle = null;
      }
      const source = SOURCE_LINE.exec(line);
      if (source && current.sourceUrl === null) {
        current.sourceUrl = source[1];
        current.sourceDetail = (source[2] + source[3]).trim();
      } else {
        current.notes.push(line.trim().replaceAll("`", ""));
      }
    }
  }
  // A missing closing fence would silently drop a license the engine must ship.
  if (fence) throw new Error(`Unclosed license text in ${current?.name ?? "the notices"}`);
  return libraries;
}
