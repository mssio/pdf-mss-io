import { parsePdfDate } from "@/lib/format";

export type DocumentInfo = {
  title?: string;
  author?: string;
  subject?: string;
  keywords?: string;
  creator?: string;
  producer?: string;
  created?: Date;
  modified?: Date;
};
export type PageSize = { widthPt: number; heightPt: number; name: string | null; landscape: boolean };
export type Security = { encrypted: false } | { encrypted: true; method: string; denied: string[] };
export type PdfDetails = {
  document: DocumentInfo;
  firstPageSize: PageSize | null;
  mixedSizes: boolean;
  attachments: string[];
  security: Security;
};

/** `qpdf.run([...QPDF_JSON_ARGS, "in.pdf"])` produces the JSON parseQpdfJson expects. */
export const QPDF_JSON_ARGS = [
  "--json",
  "--json-key=pages",
  "--json-key=encrypt",
  "--json-key=attachments",
  "--json-key=qpdf",
];

type JsonObject = Record<string, unknown>;

const isObject = (value: unknown): value is JsonObject =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const TEXT_FIELDS = [
  ["/Title", "title"],
  ["/Author", "author"],
  ["/Subject", "subject"],
  ["/Keywords", "keywords"],
  ["/Creator", "creator"],
  ["/Producer", "producer"],
] as const;

const NAMED_SIZES: [string, number, number][] = [
  ["A5", 419.53, 595.28],
  ["A4", 595.28, 841.89],
  ["Letter", 612, 792],
  ["Legal", 612, 1008],
  ["A3", 841.89, 1190.55],
];

const METHODS: Record<string, string> = { AESv3: "AES-256", AESv2: "AES-128", RC4: "RC4" };

const PERMISSIONS: [string, string][] = [
  ["printhigh", "Printing"],
  ["modifyother", "Editing"],
  ["extract", "Copying"],
  ["modifyannotations", "Comments and forms"],
];

/** Reads qpdf's JSON v2 (`--json` with pages, encrypt, attachments and qpdf keys) into display data. */
export function parseQpdfJson(json: unknown): PdfDetails {
  const root = isObject(json) ? json : {};
  const objects = objectTable(root);
  const resolve = (value: unknown): unknown => {
    if (typeof value === "string" && /^\d+ \d+ R$/.test(value)) {
      const entry = objects[`obj:${value}`];
      return isObject(entry) ? entry.value : undefined;
    }
    return value;
  };
  const text = (value: unknown): string | undefined => {
    const resolved = resolve(value);
    return typeof resolved === "string" && resolved.startsWith("u:") ? resolved.slice(2).trim() || undefined : undefined;
  };

  const trailer = isObject(objects.trailer) ? resolve(objects.trailer.value) : undefined;
  const infoDict = isObject(trailer) ? resolve(trailer["/Info"]) : undefined;
  const document: DocumentInfo = {};
  if (isObject(infoDict)) {
    for (const [key, field] of TEXT_FIELDS) {
      const value = text(infoDict[key]);
      if (value) document[field] = value;
    }
    const created = parsePdfDate(text(infoDict["/CreationDate"]) ?? "");
    const modified = parsePdfDate(text(infoDict["/ModDate"]) ?? "");
    if (created) document.created = created;
    if (modified) document.modified = modified;
  }

  const sizes = (Array.isArray(root.pages) ? root.pages : [])
    .map((page) => (isObject(page) ? mediaBoxSize(page.object, resolve) : null))
    .filter((size): size is [number, number] => size !== null);
  const first = sizes[0];
  const firstPageSize = first ? pageSize(first[0], first[1]) : null;
  const mixedSizes = first
    ? sizes.some(([w, h]) => Math.abs(w - first[0]) > 2 || Math.abs(h - first[1]) > 2)
    : false;

  const attachments = isObject(root.attachments)
    ? Object.entries(root.attachments).map(([key, value]) => {
        const name = isObject(value) ? value.preferredname : undefined;
        return typeof name === "string" && name !== "" ? name.replace(/^u:/, "") : key;
      })
    : [];

  return { document, firstPageSize, mixedSizes, attachments, security: security(root.encrypt) };
}

function objectTable(root: JsonObject): JsonObject {
  const qpdf = root.qpdf;
  return Array.isArray(qpdf) && isObject(qpdf[1]) ? qpdf[1] : {};
}

/** Walks /Parent up from the page until a MediaBox is found (it is inheritable). */
function mediaBoxSize(pageRef: unknown, resolve: (value: unknown) => unknown): [number, number] | null {
  let node = resolve(pageRef);
  for (let depth = 0; isObject(node) && depth < 32; depth++) {
    const box = resolve(node["/MediaBox"]);
    if (Array.isArray(box) && box.length === 4) {
      const [x1, y1, x2, y2] = box.map(resolve);
      if ([x1, y1, x2, y2].every((n) => typeof n === "number")) {
        return [Math.abs((x2 as number) - (x1 as number)), Math.abs((y2 as number) - (y1 as number))];
      }
    }
    node = resolve(node["/Parent"]);
  }
  return null;
}

function pageSize(widthPt: number, heightPt: number): PageSize {
  const short = Math.min(widthPt, heightPt);
  const long = Math.max(widthPt, heightPt);
  const named = NAMED_SIZES.find(([, a, b]) => Math.abs(short - a) <= 2 && Math.abs(long - b) <= 2);
  return { widthPt, heightPt, name: named ? named[0] : null, landscape: widthPt > heightPt };
}

function security(encrypt: unknown): Security {
  if (!isObject(encrypt) || encrypt.encrypted !== true) return { encrypted: false };
  const method = isObject(encrypt.parameters) ? String(encrypt.parameters.method ?? "") : "";
  const capabilities = isObject(encrypt.capabilities) ? encrypt.capabilities : {};
  const denied = PERMISSIONS.filter(([key]) => capabilities[key] === false).map(([, label]) => label);
  return { encrypted: true, method: METHODS[method] ?? method, denied };
}

/** "A4 · 210 × 297 mm (8.27 × 11.69 in)". */
export function describePageSize(size: PageSize): string {
  const mm = (pt: number) => Math.round((pt * 25.4) / 72);
  const inches = (pt: number) => (pt / 72).toFixed(2);
  const dimensions = `${mm(size.widthPt)} × ${mm(size.heightPt)} mm (${inches(size.widthPt)} × ${inches(size.heightPt)} in)`;
  if (!size.name) return dimensions;
  return `${size.name}${size.landscape ? " landscape" : ""} · ${dimensions}`;
}

/** qpdf exits 0 whether or not the file is linearized; only the message tells them apart. */
export function isLinearized(result: { exitCode: number; stdout: string }): boolean {
  return result.exitCode !== 2 && /no linearization errors/.test(result.stdout);
}
