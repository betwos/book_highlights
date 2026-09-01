import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { currentUserId } from "@/lib/user";
import { highlightSetHash } from "@/lib/hash";
import { MODEL, PROMPT_VERSION } from "@/lib/analysis";
import { Button } from "@/components/ui/button";
import { BookView, type Tab } from "@/components/book-view";
import type { AnalysisDto } from "@/components/analysis-panel";

export const dynamic = "force-dynamic";

function toTab(value: string | undefined): Tab {
  return value === "chapters" || value === "highlights" ? value : "takeaways";
}

export default async function BookPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { id } = await params;
  const { tab } = await searchParams;

  const book = await prisma.book.findFirst({
    where: { id, userId: currentUserId() },
    include: {
      highlights: { orderBy: { orderIndex: "asc" } },
      analyses: { orderBy: { createdAt: "desc" }, take: 1 },
    },
  });
  if (!book) notFound();

  const currentHash = highlightSetHash(book.highlights.map((h) => h.contentHash));
  const latest = book.analyses[0] ?? null;

  // Stale is derived, not stored: the hash, prompt version, and model are the
  // analysis cache key, so any drift means the row no longer describes this book.
  const isStale =
    latest?.status === "succeeded" &&
    (latest.highlightSetHash !== currentHash ||
      latest.promptVersion !== PROMPT_VERSION ||
      latest.model !== MODEL);

  const initialAnalysis: AnalysisDto | null = latest
    ? {
        id: latest.id,
        status: latest.status,
        takeaways: latest.takeaways,
        chapters: latest.chapters,
        chaptersMeta: latest.chaptersMeta,
        error: latest.error,
        costCents: latest.costCents,
        highlightSetHash: latest.highlightSetHash,
        createdAt: latest.createdAt.toISOString(),
        completedAt: latest.completedAt?.toISOString() ?? null,
      }
    : null;

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start gap-5">
        <div className="h-40 w-28 shrink-0 overflow-hidden rounded-md bg-[var(--surface-muted)]">
          {book.coverUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={book.coverUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-xs text-[var(--muted-foreground)]">
              No cover
            </div>
          )}
        </div>

        <div className="min-w-0 flex-1 space-y-2">
          <h1 className="text-2xl font-medium leading-tight tracking-tight">{book.title}</h1>
          {book.subtitle ? (
            <p className="text-[var(--muted-foreground)]">{book.subtitle}</p>
          ) : null}
          <p className="text-sm">{book.author}</p>
          <p className="text-sm text-[var(--muted-foreground)]">
            {[book.publisher, book.publishedYear, book.pageCount ? `${book.pageCount} pp.` : null]
              .filter(Boolean)
              .join(" · ")}
          </p>
          {book.notes ? <p className="prose-reading text-sm">{book.notes}</p> : null}

          <div className="pt-1">
            <Button asChild variant="outline" size="sm">
              <Link href={`/books/${book.id}/edit`}>Edit</Link>
            </Button>
          </div>
        </div>
      </div>

      <BookView
        bookId={book.id}
        initialTab={toTab(tab)}
        currentHighlightSetHash={currentHash}
        isStale={Boolean(isStale)}
        initialAnalysis={initialAnalysis}
        highlights={book.highlights.map((h) => ({
          id: h.id,
          text: h.text,
          note: h.note,
          location: h.location,
          locationType: h.locationType,
          tags: h.tags,
        }))}
      />
    </div>
  );
}
