"use client";

import { Badge, Card } from "@/components/ui/primitives";
import { useBookView } from "@/components/book-view";
import type { Takeaway } from "@/lib/ai/schemas";

export function TakeawayCard({
  takeaway,
  index,
  labelFor,
}: {
  takeaway: Takeaway;
  index: number;
  /** Real highlight id -> the `H<n>` label the reader saw in the list. */
  labelFor: (highlightId: string) => string | null;
}) {
  const { jumpToHighlight } = useBookView();

  return (
    <Card className="p-5">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 text-sm tabular-nums text-[var(--muted-foreground)]">
          {index + 1}
        </span>
        <div className="min-w-0 flex-1 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-medium leading-snug">{takeaway.title}</h3>
            <Badge tone="muted">{takeaway.theme}</Badge>
          </div>

          <p className="prose-reading text-[0.95rem]">{takeaway.body}</p>

          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs text-[var(--muted-foreground)]">From</span>
            {takeaway.highlightIds.map((id) => {
              const label = labelFor(id);
              if (!label) return null;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => jumpToHighlight(id)}
                  className="rounded-full bg-[var(--accent-soft)] px-2 py-0.5 text-xs font-medium text-[var(--accent)] transition-opacity hover:opacity-80"
                  title="Jump to this highlight"
                >
                  {label}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </Card>
  );
}
