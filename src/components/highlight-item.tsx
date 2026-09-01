"use client";

import { useActionState, useState, useTransition } from "react";
import { Card } from "@/components/ui/primitives";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/field";
import { updateHighlight, deleteHighlight, type HighlightActionState } from "@/actions/highlights";
import type { HighlightDto } from "@/components/highlight-list";

export function HighlightItem({
  highlight,
  label,
  onDeleted,
}: {
  highlight: HighlightDto;
  label: string;
  onDeleted: (id: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [deleting, startDelete] = useTransition();
  const [state, formAction] = useActionState<HighlightActionState, FormData>(
    async (prev, formData) => {
      const result = await updateHighlight(highlight.id, prev, formData);
      if (result.ok) setEditing(false);
      return result;
    },
    {},
  );

  const where = highlight.location
    ? `${highlight.locationType === "page" ? "p." : "loc"} ${highlight.location}`
    : null;

  return (
    // The anchor a citation chip scrolls to and flashes.
    <Card id={`h-${highlight.id}`} className="scroll-mt-24 p-4 transition-colors">
      <div className="flex items-start justify-between gap-3">
        <span className="text-xs font-medium text-[var(--muted-foreground)]">{label}</span>
        <div className="flex shrink-0 gap-1">
          <Button variant="ghost" size="sm" onClick={() => setEditing((v) => !v)}>
            {editing ? "Cancel" : "Edit"}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            disabled={deleting}
            onClick={() =>
              startDelete(async () => {
                const result = await deleteHighlight(highlight.id);
                if (result.ok) onDeleted(highlight.id);
              })
            }
          >
            {deleting ? "Deleting…" : "Delete"}
          </Button>
        </div>
      </div>

      {editing ? (
        <form action={formAction} className="mt-3 space-y-2">
          <Textarea name="text" defaultValue={highlight.text} rows={4} required />
          <Input name="note" defaultValue={highlight.note ?? ""} placeholder="Your note" />
          <Input name="location" defaultValue={highlight.location ?? ""} placeholder="Location" />
          {state.error ? <p className="text-xs text-[var(--danger)]">{state.error}</p> : null}
          <div className="flex items-center gap-2">
            <Button type="submit" size="sm">
              Save
            </Button>
            <p className="text-xs text-[var(--muted-foreground)]">
              Editing the text marks any analysis stale.
            </p>
          </div>
        </form>
      ) : (
        <>
          <p className="prose-reading mt-2 text-[0.95rem]">{highlight.text}</p>
          {highlight.note ? (
            <p className="mt-3 border-l-2 border-[var(--accent)] pl-3 text-sm text-[var(--muted-foreground)]">
              {highlight.note}
            </p>
          ) : null}
          {where || highlight.tags.length > 0 ? (
            <p className="mt-3 flex flex-wrap gap-2 text-xs text-[var(--muted-foreground)]">
              {where ? <span>{where}</span> : null}
              {highlight.tags.map((tag) => (
                <span key={tag}>#{tag}</span>
              ))}
            </p>
          ) : null}
        </>
      )}
    </Card>
  );
}
