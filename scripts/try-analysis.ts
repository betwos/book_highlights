/**
 * Exercise the AI layer directly, without the database or any UI.
 *
 *   npx tsx scripts/try-analysis.ts "Thinking, Fast and Slow" "Daniel Kahneman"
 *
 * Reads highlights for the named book out of fixtures/readwise-sample.csv and
 * prints the takeaways, the chapter outline, and what the run cost.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { parseCsv } from "../src/lib/csv/parse";
import { detectMapping } from "../src/lib/csv/detect";
import { rowsToHighlights } from "../src/lib/csv/rows";
import { generateTakeaways } from "../src/lib/ai/takeaways";
import { generateChapters } from "../src/lib/ai/chapters";
import { sumUsage } from "../src/lib/ai/client";
import { costCents } from "../src/lib/ai/cost";

async function main() {
  const title = process.argv[2] ?? "Thinking, Fast and Slow";
  const author = process.argv[3] ?? "Daniel Kahneman";

  const { headers, rows } = parseCsv(
    readFileSync(path.join(process.cwd(), "fixtures", "readwise-sample.csv"), "utf8"),
  );
  const mapping = detectMapping(headers);
  const bookRows = rows.filter((r) => (mapping.title ? r[mapping.title] : "") === title);

  if (bookRows.length === 0) {
    console.error(`No rows in the fixture for "${title}".`);
    process.exit(1);
  }

  const highlights = rowsToHighlights(bookRows, mapping).map((d, i) => ({
    id: `fixture_${i}`,
    text: d.text,
    note: d.note,
    location: d.location,
    locationType: d.locationType,
  }));

  const book = { title, author, publishedYear: null, isbn: null, subtitle: null };
  console.log(`${title} — ${highlights.length} highlights\n`);

  const [takeaways, chapters] = await Promise.all([
    generateTakeaways(book, highlights),
    generateChapters(book),
  ]);

  for (const [i, t] of takeaways.takeaways.entries()) {
    console.log(`${i + 1}. ${t.title}  [${t.theme}]`);
    console.log(`   ${t.body}`);
    console.log(`   cites: ${t.highlightIds.join(", ")}\n`);
  }

  console.log(`bookRecognized: ${chapters.outline.bookRecognized}`);
  for (const c of chapters.outline.chapters) {
    console.log(`  ${c.number ?? "—"}. ${c.title} (${c.confidence})`);
  }
  if (chapters.outline.caveat) console.log(`  caveat: ${chapters.outline.caveat}`);

  const usage = sumUsage([takeaways.usage, chapters.usage]);
  console.log(
    `\nin ${usage.tokensIn} / out ${usage.tokensOut} / cache read ${usage.cacheReadTokens} — ${costCents(usage)}c`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
