import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { parseCsv } from "@/lib/csv/parse";
import { detectMapping } from "@/lib/csv/detect";
import { groupRows } from "@/lib/csv/group";

const fixture = parseCsv(
  readFileSync(path.join(process.cwd(), "fixtures", "readwise-sample.csv"), "utf8"),
);
const mapping = detectMapping(fixture.headers);

describe("groupRows", () => {
  it("splits the mixed two-book fixture into exactly two groups", () => {
    const groups = groupRows(fixture.rows, mapping);

    expect(groups).toHaveLength(2);
    expect(groups.map((g) => g.title).sort()).toEqual([
      "The Design of Everyday Things",
      "Thinking, Fast and Slow",
    ]);
    expect(groups.reduce((n, g) => n + g.rowCount, 0)).toBe(fixture.rows.length);
    for (const g of groups) expect(g.sampleTexts.length).toBeGreaterThan(0);
  });

  it("matches an existing book by normalized title and author", () => {
    const groups = groupRows(fixture.rows, mapping, [
      { id: "book_1", title: "  thinking,  fast and slow ", author: "Daniel Kahneman" },
    ]);

    const matched = groups.find((g) => g.title === "Thinking, Fast and Slow");
    const unmatched = groups.find((g) => g.title === "The Design of Everyday Things");

    expect(matched?.matchedBookId).toBe("book_1");
    expect(unmatched?.matchedBookId).toBeUndefined();
  });

  it("does not match a same-title book by a different author", () => {
    const groups = groupRows(fixture.rows, mapping, [
      { id: "book_x", title: "Thinking, Fast and Slow", author: "Someone Else" },
    ]);
    expect(groups.every((g) => g.matchedBookId === undefined)).toBe(true);
  });
});
