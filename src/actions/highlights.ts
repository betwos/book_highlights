"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { currentUserId } from "@/lib/user";
import { contentHash } from "@/lib/hash";
import { HighlightFormSchema } from "@/lib/schemas/book";

export type HighlightActionState = { error?: string; ok?: boolean };

async function ownedHighlight(id: string) {
  return prisma.highlight.findFirst({
    where: { id, book: { userId: currentUserId() } },
    select: { id: true, bookId: true },
  });
}

export async function updateHighlight(
  id: string,
  _prev: HighlightActionState,
  formData: FormData,
): Promise<HighlightActionState> {
  const parsed = HighlightFormSchema.safeParse({
    text: formData.get("text") ?? "",
    note: formData.get("note") ?? "",
    location: formData.get("location") ?? "",
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid highlight." };
  }

  const highlight = await ownedHighlight(id);
  if (!highlight) return { error: "Highlight not found." };

  const hash = contentHash(parsed.data.text);

  // The unique (bookId, contentHash) constraint means an edit can collide with
  // an existing highlight; say so rather than surfacing a database error.
  const clash = await prisma.highlight.findFirst({
    where: { bookId: highlight.bookId, contentHash: hash, id: { not: highlight.id } },
    select: { id: true },
  });
  if (clash) return { error: "Another highlight in this book already has that text." };

  await prisma.highlight.update({
    where: { id: highlight.id },
    // Changing the text changes the hash, which marks the analysis stale.
    data: { ...parsed.data, contentHash: hash },
  });

  revalidatePath(`/books/${highlight.bookId}`);
  return { ok: true };
}

export async function deleteHighlight(id: string): Promise<HighlightActionState> {
  const highlight = await ownedHighlight(id);
  if (!highlight) return { error: "Highlight not found." };

  await prisma.highlight.delete({ where: { id: highlight.id } });

  revalidatePath("/");
  revalidatePath(`/books/${highlight.bookId}`);
  return { ok: true };
}
