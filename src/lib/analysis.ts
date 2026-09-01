import { prisma } from "@/lib/db";
import { highlightSetHash } from "@/lib/hash";
import { MODEL } from "@/lib/ai/client";
import { PROMPT_VERSION } from "@/lib/ai/prompts";

export { MODEL, PROMPT_VERSION };

/** Content address of a book's current highlight set (SPEC 4.4). */
export async function currentHighlightSetHash(
  bookId: string,
): Promise<{ hash: string; count: number }> {
  const highlights = await prisma.highlight.findMany({
    where: { bookId },
    select: { contentHash: true },
  });
  return {
    hash: highlightSetHash(highlights.map((h) => h.contentHash)),
    count: highlights.length,
  };
}

/** The newest analysis for a book, whatever its status. */
export async function latestAnalysis(bookId: string) {
  return prisma.analysis.findFirst({
    where: { bookId },
    orderBy: { createdAt: "desc" },
  });
}
