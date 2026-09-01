import { contentHash } from "@/lib/hash";
import type { CsvRow } from "./parse";
import type { Mapping } from "./detect";

export type HighlightDraft = {
  text: string;
  note: string | null;
  location: string | null;
  locationType: string | null;
  color: string | null;
  tags: string[];
  highlightedAt: Date | null;
  orderIndex: number;
  contentHash: string;
};

function cell(row: CsvRow, header: string | null): string {
  if (!header) return "";
  return (row[header] ?? "").trim();
}

function orNull(v: string): string | null {
  return v === "" ? null : v;
}

function parseDate(v: string): Date | null {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

function parseTags(v: string): string[] {
  if (!v) return [];
  return v
    .split(/[,;]/)
    .map((t) => t.trim())
    .filter(Boolean);
}

/**
 * Turn mapped CSV rows into insertable highlights, deduped within the batch by
 * content hash. Order is source row order, or `highlightedAt` when every row
 * carries one (SPEC 7).
 */
export function rowsToHighlights(rows: CsvRow[], mapping: Mapping): HighlightDraft[] {
  const drafts: HighlightDraft[] = [];
  const seen = new Set<string>();

  for (const row of rows) {
    const text = cell(row, mapping.text);
    if (!text) continue;

    const hash = contentHash(text);
    if (seen.has(hash)) continue;
    seen.add(hash);

    drafts.push({
      text,
      note: orNull(cell(row, mapping.note)),
      location: orNull(cell(row, mapping.location)),
      locationType: orNull(cell(row, mapping.locationType)),
      color: orNull(cell(row, mapping.color)),
      tags: parseTags(cell(row, mapping.tags)),
      highlightedAt: parseDate(cell(row, mapping.highlightedAt)),
      orderIndex: 0,
      contentHash: hash,
    });
  }

  const allDated = drafts.length > 0 && drafts.every((d) => d.highlightedAt !== null);
  if (allDated) {
    drafts.sort((a, b) => a.highlightedAt!.getTime() - b.highlightedAt!.getTime());
  }
  drafts.forEach((d, i) => (d.orderIndex = i));

  return drafts;
}
