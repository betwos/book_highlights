import { normalizeForHash } from "@/lib/hash";
import type { CsvRow } from "./parse";
import type { Mapping } from "./detect";

export type BookGroup = {
  key: string;
  title: string;
  author: string;
  rowCount: number;
  sampleTexts: string[];
  matchedBookId?: string;
};

export type ExistingBook = { id: string; title: string; author: string };

export function groupKey(title: string, author: string): string {
  return `${normalizeForHash(title)}|${normalizeForHash(author)}`;
}

function cell(row: CsvRow, header: string | null): string {
  if (!header) return "";
  return (row[header] ?? "").trim();
}

/**
 * A Readwise export is an export of a library, not of one book (SPEC 4.8).
 * Group rows by normalized (title, author) and match each group against the
 * user's existing books.
 */
export function groupRows(
  rows: CsvRow[],
  mapping: Mapping,
  existingBooks: ExistingBook[] = [],
): BookGroup[] {
  const existingByKey = new Map<string, string>();
  for (const b of existingBooks) existingByKey.set(groupKey(b.title, b.author), b.id);

  const groups = new Map<string, BookGroup>();

  for (const row of rows) {
    const text = cell(row, mapping.text);
    if (!text) continue;

    const title = cell(row, mapping.title) || "Untitled";
    const author = cell(row, mapping.author) || "Unknown";
    const k = groupKey(title, author);

    let group = groups.get(k);
    if (!group) {
      group = { key: k, title, author, rowCount: 0, sampleTexts: [] };
      const matched = existingByKey.get(k);
      if (matched) group.matchedBookId = matched;
      groups.set(k, group);
    }

    group.rowCount += 1;
    if (group.sampleTexts.length < 3) group.sampleTexts.push(text.slice(0, 240));
  }

  return [...groups.values()];
}
