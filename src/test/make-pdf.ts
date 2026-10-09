/**
 * Builds a valid, uncompressed PDF in memory: `pages` Letter pages (or `size`), a correct xref table,
 * and an optional Info dictionary with Title, Author and CreationDate. `fillerBytes` adds a comment
 * of that many printable characters to each page's content stream, so the PDF is big and takes a
 * while to write (for progress tests).
 */
export function makePdf(
  pages: number,
  options: { title?: string; size?: [number, number]; fillerBytes?: number } = {},
): Uint8Array<ArrayBuffer> {
  const [width, height] = options.size ?? [612, 792];
  const objects: string[] = [];
  const add = (body: string) => objects.push(body);
  const catalog = add("");
  const pageTree = add("");
  const font = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
  const kids: number[] = [];
  for (let i = 1; i <= pages; i++) {
    const text =
      `BT /F1 24 Tf 72 700 Td (Page ${i}) Tj ET` + (options.fillerBytes ? `\n%${filler(options.fillerBytes, i)}` : "");
    const content = add(`<< /Length ${text.length} >>\nstream\n${text}\nendstream`);
    kids.push(
      add(
        `<< /Type /Page /Parent ${pageTree} 0 R /MediaBox [0 0 ${width} ${height}] /Resources << /Font << /F1 ${font} 0 R >> >> /Contents ${content} 0 R >>`,
      ),
    );
  }
  objects[catalog - 1] = `<< /Type /Catalog /Pages ${pageTree} 0 R >>`;
  objects[pageTree - 1] = `<< /Type /Pages /Kids [${kids.map((kid) => `${kid} 0 R`).join(" ")}] /Count ${pages} >>`;
  const info = options.title
    ? add(`<< /Title (${options.title}) /Author (Test Author) /CreationDate (D:20260101120000Z) >>`)
    : 0;

  let out = "%PDF-1.7\n";
  const offsets = objects.map((body, index) => {
    const at = out.length;
    out += `${index + 1} 0 obj\n${body}\nendobj\n`;
    return at;
  });
  const xref = out.length;
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  out += offsets.map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`).join("");
  out += `trailer\n<< /Size ${objects.length + 1} /Root ${catalog} 0 R${info ? ` /Info ${info} 0 R` : ""} >>\n`;
  out += `startxref\n${xref}\n%%EOF\n`;
  return new TextEncoder().encode(out);
}

/** `length` printable ASCII characters (33–122), deterministic per `seed`; a PDF comment can hold them. */
function filler(length: number, seed: number): string {
  const chars: string[] = [];
  let state = seed;
  for (let i = 0; i < length; i++) {
    state = (state * 1103515245 + 12345) & 0x7fffffff;
    chars.push(String.fromCharCode(33 + ((state >>> 16) % 90)));
  }
  return chars.join("");
}
