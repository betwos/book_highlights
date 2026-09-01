import Papa from "papaparse";

export const MAX_CSV_BYTES = 10 * 1024 * 1024;

export type CsvRow = Record<string, string>;
export type ParsedCsv = { headers: string[]; rows: CsvRow[] };

export class CsvError extends Error {}

/** papaparse with header rows; handles quoted newlines inside highlight text. */
export function parseCsv(content: string): ParsedCsv {
  const result = Papa.parse<CsvRow>(content, {
    header: true,
    skipEmptyLines: "greedy",
    transformHeader: (h) => h.trim(),
  });

  const headers = (result.meta.fields ?? []).filter((h) => h.length > 0);
  if (headers.length === 0) throw new CsvError("The file has no header row.");

  const rows = result.data.filter((row) =>
    Object.values(row).some((v) => typeof v === "string" && v.trim() !== ""),
  );
  if (rows.length === 0) throw new CsvError("The file has no data rows.");

  return { headers, rows };
}

export function assertSize(bytes: number) {
  if (bytes > MAX_CSV_BYTES) throw new CsvError("File is larger than 10 MB.");
}
