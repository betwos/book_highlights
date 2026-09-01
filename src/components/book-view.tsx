"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import {
  useAnalysis,
  AnalysisControls,
  type AnalysisDto,
} from "@/components/analysis-panel";
import { TakeawayCard } from "@/components/takeaway-card";
import { ChapterAccordion } from "@/components/chapter-accordion";
import { HighlightList, type HighlightDto } from "@/components/highlight-list";
import { EmptyState, Skeleton } from "@/components/ui/primitives";
import {
  parseStoredTakeaways,
  parseStoredChapters,
  parseStoredChaptersMeta,
} from "@/lib/ai/schemas";

export type Tab = "takeaways" | "chapters" | "highlights";

const TABS: { id: Tab; label: string }[] = [
  { id: "takeaways", label: "Takeaways" },
  { id: "chapters", label: "Chapters" },
  { id: "highlights", label: "Highlights" },
];

const BookViewContext = createContext<{ jumpToHighlight: (id: string) => void } | null>(null);

export function useBookView() {
  const ctx = useContext(BookViewContext);
  if (!ctx) throw new Error("useBookView must be used inside BookView");
  return ctx;
}

function isTab(value: string | null): value is Tab {
  return value === "takeaways" || value === "chapters" || value === "highlights";
}

export function BookView({
  bookId,
  initialTab,
  highlights,
  initialAnalysis,
  currentHighlightSetHash,
  isStale,
}: {
  bookId: string;
  initialTab: Tab;
  highlights: HighlightDto[];
  initialAnalysis: AnalysisDto | null;
  currentHighlightSetHash: string;
  isStale: boolean;
}) {
  const [tab, setTab] = useState<Tab>(initialTab);
  const [jumpTarget, setJumpTarget] = useState<{ id: string; nonce: number } | null>(null);

  const state = useAnalysis(bookId, initialAnalysis, currentHighlightSetHash, isStale);

  // `?tab=` stays in the URL so citation links are shareable, without re-running
  // the server render on every tab click.
  useEffect(() => {
    const url = new URL(window.location.href);
    if (url.searchParams.get("tab") === tab) return;
    url.searchParams.set("tab", tab);
    window.history.replaceState(null, "", url);
  }, [tab]);

  useEffect(() => {
    const onPop = () => {
      const value = new URL(window.location.href).searchParams.get("tab");
      if (isTab(value)) setTab(value);
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const jumpToHighlight = useCallback((highlightId: string) => {
    setTab("highlights");
    setJumpTarget({ id: highlightId, nonce: Date.now() });
  }, []);

  // The panel has to be visible (and, when virtualized, scrolled) before the
  // anchor exists — retry briefly rather than assume one frame is enough.
  useEffect(() => {
    if (!jumpTarget) return;

    let attempts = 0;
    let timer: number;

    const tryScroll = () => {
      const el = document.getElementById(`h-${jumpTarget.id}`);
      if (el) {
        el.scrollIntoView({ block: "center", behavior: "smooth" });
        el.classList.remove("flash-target");
        void el.offsetWidth; // restart the animation if it is already running
        el.classList.add("flash-target");
        window.setTimeout(() => el.classList.remove("flash-target"), 1400);
        return;
      }
      if (attempts++ < 20) timer = window.setTimeout(tryScroll, 50);
    };

    timer = window.setTimeout(tryScroll, 0);
    return () => window.clearTimeout(timer);
  }, [jumpTarget]);

  const analysis = state.analysis;
  const takeaways = useMemo(
    () => (analysis?.status === "succeeded" ? parseStoredTakeaways(analysis.takeaways) : null),
    [analysis],
  );
  const chapters = useMemo(
    () => (analysis?.status === "succeeded" ? parseStoredChapters(analysis.chapters) : null),
    [analysis],
  );
  const chaptersMeta = useMemo(
    () => (analysis ? parseStoredChaptersMeta(analysis.chaptersMeta) : null),
    [analysis],
  );

  const labelFor = useMemo(() => {
    const map = new Map<string, string>();
    highlights.forEach((h, i) => map.set(h.id, `H${i + 1}`));
    return (id: string) => map.get(id) ?? null;
  }, [highlights]);

  const working = state.pending || state.inFlight;
  const succeeded = analysis?.status === "succeeded";

  return (
    <BookViewContext.Provider value={{ jumpToHighlight }}>
      <div className="space-y-6">
        <div
          role="tablist"
          aria-label="Book sections"
          className="-mx-4 flex gap-1 overflow-x-auto border-b border-[var(--border)] px-4 sm:mx-0 sm:px-0"
        >
          {TABS.map(({ id, label }) => (
            <button
              key={id}
              role="tab"
              type="button"
              aria-selected={tab === id}
              onClick={() => setTab(id)}
              className={cn(
                "-mb-px whitespace-nowrap border-b-2 px-3 py-2 text-sm transition-colors",
                tab === id
                  ? "border-[var(--accent)] font-medium text-[var(--foreground)]"
                  : "border-transparent text-[var(--muted-foreground)] hover:text-[var(--foreground)]",
              )}
            >
              {label}
              {id === "highlights" ? (
                <span className="ml-1.5 text-xs text-[var(--muted-foreground)]">
                  {highlights.length}
                </span>
              ) : null}
            </button>
          ))}
        </div>

        {/* Panels stay mounted so a citation chip can scroll to its highlight
            the moment the tab flips — no remount, no refetch. */}
        <div hidden={tab !== "takeaways"} className="space-y-5">
          <AnalysisControls state={state} highlightCount={highlights.length} />

          {working && !succeeded ? (
            <div className="space-y-3">
              <Skeleton className="h-28" />
              <Skeleton className="h-28" />
              <Skeleton className="h-28" />
            </div>
          ) : null}

          {succeeded && takeaways ? (
            <div className="space-y-3">
              {takeaways.map((t, i) => (
                <TakeawayCard key={i} takeaway={t} index={i} labelFor={labelFor} />
              ))}
            </div>
          ) : null}

          {succeeded && !takeaways ? (
            <EmptyState
              title="Generated by an older version"
              description="This analysis was written by an earlier prompt version and can no longer be displayed. Regenerate it to get the current format."
            />
          ) : null}

          {!analysis && !working ? (
            <EmptyState
              title="No analysis yet"
              description="Takeaways are built only from the passages you highlighted, and each one cites the highlights it came from."
            />
          ) : null}
        </div>

        <div hidden={tab !== "chapters"} className="space-y-5">
          <AnalysisControls state={state} highlightCount={highlights.length} />

          {succeeded ? (
            <ChapterAccordion chapters={chapters ?? []} meta={chaptersMeta} />
          ) : working ? (
            <div className="space-y-2">
              <Skeleton className="h-12" />
              <Skeleton className="h-12" />
              <Skeleton className="h-12" />
            </div>
          ) : (
            <EmptyState
              title="No chapter outline yet"
              description="The outline is reconstructed from the model's own knowledge of the book — it never sees your highlights, so it shows what you skipped as well as what you kept."
            />
          )}
        </div>

        <div hidden={tab !== "highlights"}>
          {highlights.length === 0 ? (
            <EmptyState
              title="No highlights yet"
              description="Import a Readwise or CSV export to fill this book."
            />
          ) : (
            <HighlightList highlights={highlights} jumpTarget={jumpTarget} />
          )}
        </div>
      </div>
    </BookViewContext.Provider>
  );
}
