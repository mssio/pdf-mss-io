/** "report.pdf" + "-d" → "report-d.pdf". Drops directories; a blank name becomes "document". */
export function outputFilename(uploadedName: string, suffix: string): string {
  const base = uploadedName.replace(/^.*[/\\]/, "").trim() || "document.pdf";
  const dot = base.lastIndexOf(".");
  if (dot > 0 && dot < base.length - 1) {
    return `${base.slice(0, dot)}${suffix}${base.slice(dot)}`;
  }
  return `${base}${suffix}.pdf`;
}
