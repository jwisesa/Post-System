const cell = (v: string) => (/[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);

/** RFC 4180 CSV with CRLF line endings (no BOM; the caller adds it). */
export const toCsv = (rows: string[][]) => rows.map((r) => r.map(cell).join(",")).join("\r\n") + "\r\n";
