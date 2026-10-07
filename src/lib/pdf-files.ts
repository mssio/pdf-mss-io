export function isPdfFile(file: File): boolean {
  return file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
}

/** Splits picked or dropped files into PDFs and others. Single mode keeps only the first PDF. */
export function pickPdfFiles(files: readonly File[], multiple: boolean): { accepted: File[]; rejectedCount: number } {
  const pdfs = files.filter(isPdfFile);
  return { accepted: multiple ? pdfs : pdfs.slice(0, 1), rejectedCount: files.length - pdfs.length };
}
