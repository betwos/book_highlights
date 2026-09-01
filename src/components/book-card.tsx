import Link from "next/link";
import { Badge, Card } from "@/components/ui/primitives";
import { plural } from "@/lib/utils";

export type AnalysisBadge = "none" | "ready" | "stale" | "failed" | "running";

const BADGE_LABEL: Record<AnalysisBadge, string | null> = {
  none: null,
  ready: "Analyzed",
  stale: "Stale",
  running: "Analyzing",
  failed: "Failed",
};

export function BookCard({
  book,
}: {
  book: {
    id: string;
    title: string;
    author: string;
    coverUrl: string | null;
    highlightCount: number;
    badge: AnalysisBadge;
  };
}) {
  const label = BADGE_LABEL[book.badge];

  return (
    <Card className="overflow-hidden transition-colors hover:border-[var(--accent)]">
      <Link href={`/books/${book.id}`} className="flex gap-4 p-4">
        <div className="h-28 w-20 shrink-0 overflow-hidden rounded-md bg-[var(--surface-muted)]">
          {book.coverUrl ? (
            // Covers are re-encoded WebP served from local disk or blob storage.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={book.coverUrl}
              alt=""
              className="h-full w-full object-cover"
              loading="lazy"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-xs text-[var(--muted-foreground)]">
              No cover
            </div>
          )}
        </div>

        <div className="min-w-0 flex-1 space-y-1">
          <h2 className="truncate font-medium leading-snug">{book.title}</h2>
          <p className="truncate text-sm text-[var(--muted-foreground)]">{book.author}</p>
          <p className="text-xs text-[var(--muted-foreground)]">
            {plural(book.highlightCount, "highlight")}
          </p>
          {label ? (
            <Badge tone={book.badge === "ready" ? "accent" : book.badge === "failed" ? "danger" : "muted"}>
              {label}
            </Badge>
          ) : null}
        </div>
      </Link>
    </Card>
  );
}
