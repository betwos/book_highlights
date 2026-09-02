import { NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { currentUserId, unauthorized } from "@/lib/user";
import { CANONICAL_FIELDS, emptyMapping, isMappingValid, type Mapping } from "@/lib/csv/detect";
import { aliasesToRemember } from "@/lib/csv/aliases";
import { rememberAliases } from "@/lib/csv/alias-store";
import { groupKey } from "@/lib/csv/group";
import { rowsToHighlights } from "@/lib/csv/rows";
import type { CsvRow } from "@/lib/csv/parse";

export const maxDuration = 120;

const GroupActionSchema = z.discriminatedUnion("action", [
  z.object({
    key: z.string(),
    action: z.literal("new"),
    book: z.object({
      title: z.string().min(1),
      author: z.string().min(1),
      subtitle: z.string().optional().nullable(),
      publishedYear: z.number().int().optional().nullable(),
    }),
  }),
  z.object({ key: z.string(), action: z.literal("merge"), bookId: z.string().min(1) }),
  z.object({ key: z.string(), action: z.literal("skip") }),
]);

const BodySchema = z.object({
  mapping: z.record(z.string(), z.string().nullable()),
  groups: z.array(GroupActionSchema),
});

function coerceMapping(raw: Record<string, string | null>): Mapping {
  const mapping = emptyMapping();
  for (const field of CANONICAL_FIELDS) {
    const value = raw[field];
    mapping[field] = typeof value === "string" && value.length > 0 ? value : null;
  }
  return mapping;
}

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const denied = await unauthorized();
  if (denied) return denied;

  const { id } = await ctx.params;

  const parsedBody = BodySchema.safeParse(await req.json().catch(() => null));
  if (!parsedBody.success) {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const mapping = coerceMapping(parsedBody.data.mapping);
  if (!isMappingValid(mapping)) {
    return NextResponse.json({ error: "A highlight text column is required." }, { status: 400 });
  }

  const batch = await prisma.importBatch.findUnique({ where: { id } });
  if (!batch) return NextResponse.json({ error: "Import not found." }, { status: 404 });
  if (batch.status !== "pending") {
    return NextResponse.json({ error: "This import was already committed." }, { status: 409 });
  }

  const stagedRows = (batch.stagedRows ?? []) as unknown as CsvRow[];
  const userId = currentUserId();

  // Bucket the staged rows by group key once.
  const byKey = new Map<string, CsvRow[]>();
  for (const row of stagedRows) {
    const title = (mapping.title ? row[mapping.title] : "")?.trim() || "Untitled";
    const author = (mapping.author ? row[mapping.author] : "")?.trim() || "Unknown";
    const k = groupKey(title, author);
    const bucket = byKey.get(k);
    if (bucket) bucket.push(row);
    else byKey.set(k, [row]);
  }

  const books: { bookId: string; title: string; imported: number; skipped: number }[] = [];
  let totalImported = 0;
  let totalSkipped = 0;

  for (const group of parsedBody.data.groups) {
    if (group.action === "skip") continue;

    const rows = byKey.get(group.key) ?? [];
    if (rows.length === 0) continue;

    let bookId: string;
    let title: string;

    if (group.action === "merge") {
      const existing = await prisma.book.findFirst({
        where: { id: group.bookId, userId },
        select: { id: true, title: true },
      });
      if (!existing) {
        return NextResponse.json(
          { error: `Book ${group.bookId} not found for merge.` },
          { status: 400 },
        );
      }
      bookId = existing.id;
      title = existing.title;
    } else {
      const created = await prisma.book.create({
        data: {
          userId,
          title: group.book.title,
          author: group.book.author,
          subtitle: group.book.subtitle ?? null,
          publishedYear: group.book.publishedYear ?? null,
        },
        select: { id: true, title: true },
      });
      bookId = created.id;
      title = created.title;
    }

    const drafts = rowsToHighlights(rows, mapping);

    // Continue the book's existing reading order rather than restarting at 0.
    const maxOrder = await prisma.highlight.aggregate({
      where: { bookId },
      _max: { orderIndex: true },
    });
    const base = (maxOrder._max.orderIndex ?? -1) + 1;

    const data: Prisma.HighlightCreateManyInput[] = drafts.map((d) => ({
      bookId,
      importBatchId: batch.id,
      text: d.text,
      note: d.note,
      location: d.location,
      locationType: d.locationType,
      color: d.color,
      tags: d.tags,
      highlightedAt: d.highlightedAt,
      orderIndex: base + d.orderIndex,
      contentHash: d.contentHash,
    }));

    // Idempotent by construction: re-importing an unchanged file inserts zero.
    const result = await prisma.highlight.createMany({ data, skipDuplicates: true });
    const imported = result.count;
    const skipped = drafts.length - imported;

    books.push({ bookId, title, imported, skipped });
    totalImported += imported;
    totalSkipped += skipped;
  }

  // The reader just reviewed this mapping and pressed Import, which makes it the
  // authoritative answer for these headers — including the columns they chose to
  // leave out. Remembering it is what stops the next file asking the model again.
  const headers = Object.keys(stagedRows[0] ?? {});
  await rememberAliases(userId, aliasesToRemember(headers, mapping, "user")).catch(() => undefined);

  await prisma.importBatch.update({
    where: { id: batch.id },
    data: {
      status: "committed",
      stagedRows: Prisma.DbNull,
      mapping: mapping as unknown as Prisma.InputJsonValue,
      importedCount: totalImported,
      skippedCount: totalSkipped,
    },
  });

  return NextResponse.json({
    books,
    totals: { imported: totalImported, skipped: totalSkipped },
  });
}
