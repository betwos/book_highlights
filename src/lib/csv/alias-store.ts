import { prisma } from "@/lib/db";
import { isCanonicalField } from "./detect";
import type { StoredAlias } from "./aliases";

/** Remembered decisions for the headers of this file, keyed by normalized header. */
export async function loadAliases(userId: string, headerKeys: string[]): Promise<StoredAlias[]> {
  if (headerKeys.length === 0) return [];

  const rows = await prisma.columnAlias.findMany({
    where: { userId, headerKey: { in: headerKeys } },
    select: { headerKey: true, headerSample: true, field: true, source: true },
  });

  return rows.map((row) => ({
    headerKey: row.headerKey,
    headerSample: row.headerSample,
    // A field name retired by a later version of the app degrades to "unknown
    // column", never to a crash on someone's old import memory.
    field: isCanonicalField(row.field) ? row.field : null,
    source: row.source === "user" ? "user" : "llm",
  }));
}

/**
 * Persist decisions so the next file with these headers needs no model call.
 * A model-sourced write never overwrites a decision the reader made by hand;
 * a user-sourced write always wins.
 */
export async function rememberAliases(userId: string, aliases: StoredAlias[]): Promise<void> {
  for (const alias of aliases) {
    const existing = await prisma.columnAlias.findUnique({
      where: { userId_headerKey: { userId, headerKey: alias.headerKey } },
      select: { id: true, source: true, field: true },
    });

    if (!existing) {
      await prisma.columnAlias.create({
        data: {
          userId,
          headerKey: alias.headerKey,
          headerSample: alias.headerSample,
          field: alias.field,
          source: alias.source,
        },
      });
      continue;
    }

    const overrulesUser = existing.source === "user" && alias.source !== "user";
    await prisma.columnAlias.update({
      where: { id: existing.id },
      data: {
        headerSample: alias.headerSample,
        field: overrulesUser ? existing.field : alias.field,
        source: overrulesUser ? existing.source : alias.source,
        timesSeen: { increment: 1 },
      },
    });
  }
}
