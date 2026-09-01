"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Virtuoso, type VirtuosoHandle } from "react-virtuoso";
import { Input } from "@/components/ui/field";
import { HighlightItem } from "@/components/highlight-item";
import { plural } from "@/lib/utils";

export type HighlightDto = {
  id: string;
  text: string;
  note: string | null;
  location: string | null;
  locationType: string | null;
  tags: string[];
};

/** Above this many items the list is virtualized. */
export const VIRTUALIZE_ABOVE = 300;

export function HighlightList({
  highlights,
  jumpTarget,
}: {
  highlights: HighlightDto[];
  /** Set when a citation chip asks for a highlight (see BookView). */
  jumpTarget?: { id: string; nonce: number } | null;
}) {
  const [query, setQuery] = useState("");
  const [deleted, setDeleted] = useState<Set<string>>(new Set());
  const virtuosoRef = useRef<VirtuosoHandle>(null);

  const live = useMemo(
    () => highlights.filter((h) => !deleted.has(h.id)),
    [highlights, deleted],
  );

  // Labels match the [H<n>] ids the model was given: position in reading order.
  const labels = useMemo(() => {
    const map = new Map<string, string>();
    highlights.forEach((h, i) => map.set(h.id, `H${i + 1}`));
    return map;
  }, [highlights]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return live;
    return live.filter(
      (h) =>
        h.text.toLowerCase().includes(q) || (h.note ?? "").toLowerCase().includes(q),
    );
  }, [live, query]);

  const onDeleted = (id: string) => setDeleted((prev) => new Set(prev).add(id));

  // A citation chip must reach its highlight even when a search is active or
  // the list is virtualized: clear the filter, then bring the row into range.
  useEffect(() => {
    if (!jumpTarget) return;
    setQuery("");
    if (live.length <= VIRTUALIZE_ABOVE) return;
    const index = live.findIndex((h) => h.id === jumpTarget.id);
    if (index >= 0) virtuosoRef.current?.scrollToIndex({ index, align: "center" });
  }, [jumpTarget, live]);

  const item = (h: HighlightDto) => (
    <HighlightItem
      key={h.id}
      highlight={h}
      label={labels.get(h.id) ?? ""}
      onDeleted={onDeleted}
    />
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search highlights and notes"
          className="max-w-sm"
          type="search"
        />
        <p className="text-sm text-[var(--muted-foreground)]">
          {query ? `${filtered.length} of ${live.length} match` : plural(live.length, "highlight")}
        </p>
      </div>

      {filtered.length === 0 ? (
        <p className="py-8 text-center text-sm text-[var(--muted-foreground)]">
          Nothing matches that search.
        </p>
      ) : filtered.length > VIRTUALIZE_ABOVE ? (
        <Virtuoso
          ref={virtuosoRef}
          useWindowScroll
          data={filtered}
          itemContent={(_, h) => <div className="pb-3">{item(h)}</div>}
        />
      ) : (
        <div className="space-y-3">{filtered.map(item)}</div>
      )}
    </div>
  );
}
