/**
 * Formula-safe CSV output (PERFORMANCE_SECURITY_FAILURES §3). Cells are
 * always quoted; when a cell's first character — after stripping leading
 * whitespace and control characters — is a spreadsheet formula trigger
 * (`=`, `+`, `-`, `@`), or the raw cell begins with whitespace/control
 * characters that a spreadsheet may strip to reveal one, the cell is
 * prefixed with `'`. The JSON export keeps the original string verbatim.
 */

const FORMULA_CHARS = new Set(['=', '+', '-', '@']);

export function csvCell(raw: string): string {
  // Leading whitespace/C0/CF characters are invisible to spreadsheet
  // formula detection — the cell is dangerous when they precede a trigger.
  const normalized = raw.replace(/^[\s\p{Cc}\p{Cf}]+/u, '');
  const dangerous = FORMULA_CHARS.has(normalized.charAt(0)) || normalized !== raw;
  const value = dangerous ? `'${raw}` : raw;
  return `"${value.replace(/"/g, '""')}"`;
}

export function toCsv(rows: readonly (readonly string[])[]): string {
  return rows.map((row) => row.map(csvCell).join(',')).join('\r\n') + '\r\n';
}
