const RANGES = /^(\d+|z)(-(\d+|z))?(,(\d+|z)(-(\d+|z))?)*$/;

/** Turns loose input like " 1 - 3, 7, 5-Z " into qpdf page-range syntax, or null if invalid. */
export function normalizePageRanges(input: string): string | null {
  const compact = input.replace(/\s+/g, "").toLowerCase().replace(/,$/, "");
  if (!RANGES.test(compact)) return null;
  const hasPageZero = compact.split(/[,-]/).some((part) => part !== "z" && Number(part) === 0);
  return hasPageZero ? null : compact;
}
