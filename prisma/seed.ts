import { readFileSync } from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { parseCsv } from "../src/lib/csv/parse";
import { detectMapping } from "../src/lib/csv/detect";
import { groupRows } from "../src/lib/csv/group";
import { rowsToHighlights } from "../src/lib/csv/rows";
import { LOCAL_USER_ID } from "../src/lib/user";

const prisma = new PrismaClient();

async function main() {
  const file = path.join(process.cwd(), "fixtures", "readwise-sample.csv");
  const { headers, rows } = parseCsv(readFileSync(file, "utf8"));
  const mapping = detectMapping(headers);

  const existing = await prisma.book.findMany({
    where: { userId: LOCAL_USER_ID },
    select: { id: true, title: true, author: true },
  });
  const groups = groupRows(rows, mapping, existing);

  const batch = await prisma.importBatch.create({
    data: {
      filename: "readwise-sample.csv",
      rowCount: rows.length,
      mapping,
      status: "committed",
    },
    select: { id: true },
  });

  let imported = 0;

  for (const group of groups) {
    const bookId =
      group.matchedBookId ??
      (
        await prisma.book.create({
          data: { userId: LOCAL_USER_ID, title: group.title, author: group.author },
          select: { id: true },
        })
      ).id;

    const groupRowsForBook = rows.filter((row) => {
      const title = (mapping.title ? row[mapping.title] : "")?.trim() || "Untitled";
      const author = (mapping.author ? row[mapping.author] : "")?.trim() || "Unknown";
      return `${title}|${author}` === `${group.title}|${group.author}`;
    });

    const drafts = rowsToHighlights(groupRowsForBook, mapping);
    const result = await prisma.highlight.createMany({
      data: drafts.map((d) => ({ ...d, bookId, importBatchId: batch.id })),
      skipDuplicates: true,
    });
    imported += result.count;

    console.log(`${group.title} — ${result.count} highlights`);
  }

  await prisma.importBatch.update({
    where: { id: batch.id },
    data: { importedCount: imported, skippedCount: rows.length - imported },
  });

  console.log(`Seeded ${groups.length} books and ${imported} highlights.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
