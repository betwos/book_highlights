import { prisma } from "@/lib/db";
import { describeApiError, sumUsage, EMPTY_USAGE, type Usage } from "./client";
import { costCents } from "./cost";
import { generateTakeaways } from "./takeaways";
import { generateChapters } from "./chapters";
import type { Takeaway, Chapter } from "./schemas";

/**
 * The analysis job body (SPEC 9.8). Catches everything: an unhandled throw
 * inside `after()` must never leave a row stuck in `running`.
 */
export async function runAnalysis(analysisId: string): Promise<void> {
  try {
    const analysis = await prisma.analysis.update({
      where: { id: analysisId },
      data: { status: "running" },
      select: { id: true, bookId: true },
    });

    const book = await prisma.book.findUnique({
      where: { id: analysis.bookId },
      select: {
        title: true,
        subtitle: true,
        author: true,
        publishedYear: true,
        isbn: true,
      },
    });
    if (!book) throw new Error("Book not found.");

    const highlights = await prisma.highlight.findMany({
      where: { bookId: analysis.bookId },
      orderBy: { orderIndex: "asc" },
      select: { id: true, text: true, note: true, location: true, locationType: true },
    });

    // Independent by design (SPEC 4.1), so run them concurrently.
    const [takeawaysResult, chaptersResult] = await Promise.allSettled([
      generateTakeaways(book, highlights),
      generateChapters(book),
    ]);

    if (takeawaysResult.status === "rejected") {
      await prisma.analysis.update({
        where: { id: analysisId },
        data: {
          status: "failed",
          error: describeApiError(takeawaysResult.reason),
          completedAt: new Date(),
        },
      });
      return;
    }

    const usages: Usage[] = [takeawaysResult.value.usage];
    let chapters: Chapter[] = [];
    let chaptersMeta: { bookRecognized: boolean; caveat: string | null };

    if (chaptersResult.status === "fulfilled") {
      chapters = chaptersResult.value.outline.chapters;
      chaptersMeta = {
        bookRecognized: chaptersResult.value.outline.bookRecognized,
        caveat: chaptersResult.value.outline.caveat,
      };
      usages.push(chaptersResult.value.usage);
    } else {
      // A missing chapter outline must never cost the reader their takeaways.
      chaptersMeta = { bookRecognized: false, caveat: describeApiError(chaptersResult.reason) };
    }

    const usage = sumUsage(usages.length > 0 ? usages : [EMPTY_USAGE]);
    const takeaways: Takeaway[] = takeawaysResult.value.takeaways;

    await prisma.analysis.update({
      where: { id: analysisId },
      data: {
        status: "succeeded",
        takeaways: { takeaways },
        chapters,
        chaptersMeta,
        tokensIn: usage.tokensIn,
        tokensOut: usage.tokensOut,
        cachedTokensRead: usage.cacheReadTokens,
        costCents: costCents(usage),
        error: null,
        completedAt: new Date(),
      },
    });
  } catch (err) {
    await prisma.analysis
      .update({
        where: { id: analysisId },
        data: { status: "failed", error: describeApiError(err), completedAt: new Date() },
      })
      .catch(() => undefined);
  }
}
