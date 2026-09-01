import Link from "next/link";
import { prisma } from "@/lib/db";
import { currentUserId } from "@/lib/user";
import { highlightSetHash } from "@/lib/hash";
import { currentModel, PROMPT_VERSION } from "@/lib/analysis";
import { BookCard, type AnalysisBadge } from "@/components/book-card";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/primitives";

export const dynamic = "force-dynamic";

export default async function LibraryPage() {
  // Reads happen in the Server Component, calling Prisma directly (SPEC 4.11).
  const books = await prisma.book.findMany({
    where: { userId: currentUserId() },
    orderBy: { updatedAt: "desc" },
    include: {
      highlights: { select: { contentHash: true } },
      analyses: { orderBy: { createdAt: "desc" }, take: 1 },
    },
  });

  const cards = books.map((book) => {
    const currentHash = highlightSetHash(book.highlights.map((h) => h.contentHash));
    const latest = book.analyses[0];

    let badge: AnalysisBadge = "none";
    if (latest) {
      if (latest.status === "queued" || latest.status === "running") badge = "running";
      else if (latest.status === "failed") badge = "failed";
      else if (
        latest.highlightSetHash === currentHash &&
        latest.promptVersion === PROMPT_VERSION &&
        latest.model === currentModel()
      )
        badge = "ready";
      else badge = "stale";
    }

    return {
      id: book.id,
      title: book.title,
      author: book.author,
      coverUrl: book.coverUrl,
      highlightCount: book.highlights.length,
      badge,
    };
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-medium tracking-tight">Library</h1>
          <p className="text-sm text-[var(--muted-foreground)]">
            {books.length === 0 ? "Nothing here yet." : `${books.length} books`}
          </p>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="outline">
            <Link href="/books/new">Add a book</Link>
          </Button>
          <Button asChild>
            <Link href="/import">Import highlights</Link>
          </Button>
        </div>
      </div>

      {cards.length === 0 ? (
        <EmptyState
          title="No books yet"
          description="Import a Readwise or CSV export of your highlights, or add a book by hand and upload its cover."
        >
          <Button asChild>
            <Link href="/import">Import a CSV</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/books/new">Add a book</Link>
          </Button>
        </EmptyState>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {cards.map((book) => (
            <BookCard key={book.id} book={book} />
          ))}
        </div>
      )}
    </div>
  );
}
