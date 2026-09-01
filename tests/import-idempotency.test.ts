import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { parseCsv } from "@/lib/csv/parse";
import { detectMapping } from "@/lib/csv/detect";
import { groupRows } from "@/lib/csv/group";
import { rowsToHighlights } from "@/lib/csv/rows";

const fixture = parseCsv(
  readFileSync(path.join(process.cwd(), "fixtures", "readwise-sample.csv"), "utf8"),
);
const mapping = detectMapping(fixture.headers);

/**
 * Stand-in for `prisma.highlight.createMany({ skipDuplicates: true })` against
 * the `@@unique([bookId, contentHash])` constraint.
 */
function makeCreateMany() {
  const stored = new Set<string>();
  return vi.fn(async ({ data, skipDuplicates }: { data: { bookId: string; contentHash: string }[]; skipDuplicates?: boolean }) => {
    let count = 0;
    for (const row of data) {
      const key = `${row.bookId}:${row.contentHash}`;
      if (stored.has(key)) {
        if (!skipDuplicates) throw new Error("unique constraint violation");
        continue;
      }
      stored.add(key);
      count += 1;
    }
    return { count };
  });
}

function draftsFor(title: string) {
  const rows = fixture.rows.filter((r) => r[mapping.title!] === title);
  return rowsToHighlights(rows, mapping).map((d) => ({ ...d, bookId: "book_1" }));
}

describe("re-importing the same file", () => {
  it("collapses near-duplicate rows inside a single batch", () => {
    const kahnemanRows = fixture.rows.filter((r) => r[mapping.title!] === "Thinking, Fast and Slow");
    const drafts = rowsToHighlights(kahnemanRows, mapping);

    // The fixture repeats one highlight with different whitespace, curly quotes
    // and a trailing ellipsis; normalization folds it into the original.
    expect(drafts.length).toBe(kahnemanRows.length - 1);
  });

  it("imports 0 rows the second time and reports the skipped count", async () => {
    const createMany = makeCreateMany();
    const drafts = draftsFor("Thinking, Fast and Slow");

    const first = await createMany({ data: drafts, skipDuplicates: true });
    expect(first.count).toBe(drafts.length);
    expect(drafts.length - first.count).toBe(0);

    const second = await createMany({ data: drafts, skipDuplicates: true });
    expect(second.count).toBe(0);
    expect(drafts.length - second.count).toBe(drafts.length);
  });

  it("imports only the new rows when the export grows", async () => {
    const createMany = makeCreateMany();
    const drafts = draftsFor("The Design of Everyday Things");

    await createMany({ data: drafts.slice(0, 5), skipDuplicates: true });
    const second = await createMany({ data: drafts, skipDuplicates: true });

    expect(second.count).toBe(drafts.length - 5);
  });

  it("groups the same way on both imports", () => {
    const a = groupRows(fixture.rows, mapping);
    const b = groupRows(fixture.rows, mapping);
    expect(a.map((g) => g.key)).toEqual(b.map((g) => g.key));
  });
});
