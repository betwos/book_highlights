import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { currentUserId, unauthorized } from "@/lib/user";
import { parseCsv, assertSize, CsvError, MAX_CSV_BYTES } from "@/lib/csv/parse";
import { isMappingValid } from "@/lib/csv/detect";
import { resolveMapping } from "@/lib/csv/resolve";
import { groupRows } from "@/lib/csv/group";

export const maxDuration = 60;

const DAY_MS = 24 * 60 * 60 * 1000;

export async function POST(req: Request) {
  const denied = await unauthorized();
  if (denied) return denied;

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Expected a multipart upload." }, { status: 400 });
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file was uploaded." }, { status: 400 });
  }
  if (file.size > MAX_CSV_BYTES) {
    return NextResponse.json({ error: "File is larger than 10 MB." }, { status: 400 });
  }
  if (!/\.csv$/i.test(file.name) && file.type !== "text/csv") {
    return NextResponse.json({ error: "Only .csv files are supported." }, { status: 400 });
  }

  let parsed;
  try {
    assertSize(file.size);
    parsed = parseCsv(await file.text());
  } catch (err) {
    const message = err instanceof CsvError ? err.message : "Could not read that CSV.";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  const resolved = await resolveMapping(await currentUserId(), parsed.headers, parsed.rows);
  const { mapping } = resolved;
  if (!isMappingValid(mapping)) {
    return NextResponse.json(
      {
        error:
          "No column in this file looks like highlight text. Expected a column named Highlight, Text, or Quote.",
        headers: parsed.headers,
      },
      { status: 400 },
    );
  }

  const existingBooks = await prisma.book.findMany({
    where: { userId: await currentUserId() },
    select: { id: true, title: true, author: true },
  });

  const groups = groupRows(parsed.rows, mapping, existingBooks);

  // Housekeeping: stale staged rows are dead weight (SPEC 7).
  await prisma.importBatch.deleteMany({
    where: { status: "pending", createdAt: { lt: new Date(Date.now() - DAY_MS) } },
  });

  const batch = await prisma.importBatch.create({
    data: {
      filename: file.name,
      rowCount: parsed.rows.length,
      mapping: mapping as unknown as Prisma.InputJsonValue,
      stagedRows: parsed.rows as unknown as Prisma.InputJsonValue,
      status: "pending",
    },
    select: { id: true },
  });

  return NextResponse.json({
    importBatchId: batch.id,
    filename: file.name,
    rowCount: parsed.rows.length,
    headers: parsed.headers,
    mapping,
    mappingSources: resolved.sources,
    ignoredHeaders: resolved.ignoredHeaders,
    aiError: resolved.aiError,
    groups,
  });
}
