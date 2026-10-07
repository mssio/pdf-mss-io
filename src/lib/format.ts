const UNITS = ["B", "KB", "MB", "GB"] as const;

/** 1536 → "1.5 KB". One decimal below 10, whole numbers above. */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < UNITS.length - 1) {
    value /= 1024;
    unit++;
  }
  return `${value < 10 ? value.toFixed(1) : Math.round(value)} ${UNITS[unit]}`;
}

/** Percent saved going from `before` to `after` bytes (negative when it grew). */
export function sizeChange(before: number, after: number): { smaller: boolean; percent: number } {
  const percent = before > 0 ? Math.round((1 - after / before) * 100) : 0;
  return { smaller: after < before, percent: percent === 0 ? 0 : percent };
}

/** "1000 B → 730 B (−27%)"; says "less than 1% smaller" when the saving rounds to 0. */
export function describeSizeChange(before: number, after: number): string {
  const range = `${formatBytes(before)} → ${formatBytes(after)}`;
  const { smaller, percent } = sizeChange(before, after);
  if (!smaller) return range;
  return percent >= 1 ? `${range} (−${percent}%)` : `${range} (less than 1% smaller)`;
}

const PDF_DATE = /^(?:D:)?(\d{4})(\d{2})?(\d{2})?(\d{2})?(\d{2})?(\d{2})?(?:(Z)|([+-])(\d{2})'?(\d{2})?'?)?/;

/** Parses a PDF date string ("D:20260101120000+07'00'"); null when it isn't one. */
export function parsePdfDate(raw: string): Date | null {
  const match = PDF_DATE.exec(raw.trim());
  if (!match) return null;
  const [, year, month = "01", day = "01", hour = "00", minute = "00", second = "00", , sign, offsetHours = "00", offsetMinutes = "00"] =
    match;
  const utc = Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute), Number(second));
  if (Number.isNaN(utc)) return null;
  const offset = sign ? (sign === "+" ? 1 : -1) * (Number(offsetHours) * 60 + Number(offsetMinutes)) : 0;
  return new Date(utc - offset * 60_000);
}
