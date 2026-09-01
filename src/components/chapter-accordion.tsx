"use client";

import * as Accordion from "@radix-ui/react-accordion";
import { ChevronDown } from "lucide-react";
import { EmptyState } from "@/components/ui/primitives";
import type { Chapter, ChaptersMeta } from "@/lib/ai/schemas";

const DOT: Record<Chapter["confidence"], string> = {
  high: "var(--confidence-high)",
  medium: "var(--confidence-medium)",
  low: "var(--confidence-low)",
};

export const CHAPTERS_BANNER =
  "Reconstructed from the model's knowledge of this book, not from your highlights — verify against your copy.";

export function ChapterAccordion({
  chapters,
  meta,
}: {
  chapters: Chapter[];
  meta: ChaptersMeta | null;
}) {
  const recognized = meta?.bookRecognized ?? chapters.length > 0;

  return (
    <div className="space-y-4">
      <p className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface-muted)] px-4 py-3 text-sm text-[var(--muted-foreground)]">
        {CHAPTERS_BANNER}
      </p>

      {!recognized || chapters.length === 0 ? (
        <EmptyState
          title="The model does not reliably know this book"
          description={
            meta?.caveat ??
            "Rather than invent a plausible chapter list, it returned nothing. Your takeaways above are unaffected — they come from your highlights, not from the model's recall."
          }
        />
      ) : (
        <>
          <Accordion.Root type="multiple" className="space-y-2">
            {chapters.map((chapter, i) => (
              <Accordion.Item
                key={`${chapter.number ?? "x"}-${i}`}
                value={`ch-${i}`}
                className="overflow-hidden rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)]"
              >
                <Accordion.Header>
                  <Accordion.Trigger className="group flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-[var(--surface-muted)]">
                    <span
                      aria-hidden
                      className="size-2 shrink-0 rounded-full"
                      style={{ background: DOT[chapter.confidence] }}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="text-sm font-medium">
                        {chapter.number !== null ? `${chapter.number}. ` : ""}
                        {chapter.title}
                      </span>
                      <span className="sr-only"> — {chapter.confidence} confidence</span>
                    </span>
                    <ChevronDown className="shrink-0 text-[var(--muted-foreground)] transition-transform group-data-[state=open]:rotate-180" />
                  </Accordion.Trigger>
                </Accordion.Header>

                <Accordion.Content className="border-t border-[var(--border)] px-4 py-3">
                  <p className="prose-reading text-sm">{chapter.summary}</p>
                  {chapter.keyIdeas.length > 0 ? (
                    <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-[var(--muted-foreground)]">
                      {chapter.keyIdeas.map((idea, j) => (
                        <li key={j}>{idea}</li>
                      ))}
                    </ul>
                  ) : null}
                  <p className="mt-3 text-xs text-[var(--muted-foreground)]">
                    Confidence: {chapter.confidence}
                  </p>
                </Accordion.Content>
              </Accordion.Item>
            ))}
          </Accordion.Root>

          {meta?.caveat ? (
            <p className="text-sm text-[var(--muted-foreground)]">{meta.caveat}</p>
          ) : null}
        </>
      )}
    </div>
  );
}
