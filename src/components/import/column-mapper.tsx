"use client";

import { CANONICAL_FIELDS, type CanonicalField, type Mapping } from "@/lib/csv/detect";
import type { FieldSource, MappingSources } from "@/lib/csv/aliases";
import { Card } from "@/components/ui/primitives";

const FIELD_LABEL: Record<CanonicalField, string> = {
  text: "Highlight text",
  title: "Book title",
  author: "Book author",
  note: "Note",
  location: "Location",
  locationType: "Location type",
  color: "Color",
  tags: "Tags",
  highlightedAt: "Highlighted at",
};

const SOURCE_LABEL: Record<FieldSource, string> = {
  detected: "from header",
  learned: "remembered",
  ai: "matched by AI",
};

/**
 * Always shown and always editable, even on a perfect Readwise match — a silent
 * auto-map that guesses wrong is the worst failure mode of a CSV importer.
 */
export function ColumnMapper({
  headers,
  mapping,
  sources,
  aiError,
  onChange,
}: {
  headers: string[];
  mapping: Mapping;
  sources?: MappingSources;
  aiError?: string | null;
  onChange: (mapping: Mapping) => void;
}) {
  return (
    <Card className="p-4">
      <h2 className="text-sm font-medium">Columns</h2>
      <p className="mt-1 text-sm text-[var(--muted-foreground)]">
        We guessed these from the header row, from columns you have mapped before, and — for
        anything left over — by asking the model. Check them; highlight text is required. What you
        import with is remembered, so these columns map themselves next time.
      </p>

      {aiError ? (
        <p className="mt-2 text-sm text-[var(--muted-foreground)]">
          Unrecognized columns could not be matched automatically ({aiError}). Map them by hand
          below.
        </p>
      ) : null}

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {CANONICAL_FIELDS.map((field) => (
          <label key={field} className="space-y-1.5 text-sm">
            <span className="flex items-center gap-2 font-medium">
              <span>
                {FIELD_LABEL[field]}
                {field === "text" ? <span className="text-[var(--danger)]"> *</span> : null}
              </span>
              {mapping[field] && sources?.[field] ? (
                <span className="rounded-full border border-[var(--border)] px-1.5 py-0.5 text-[11px] font-normal text-[var(--muted-foreground)]">
                  {SOURCE_LABEL[sources[field]!]}
                </span>
              ) : null}
            </span>
            <select
              value={mapping[field] ?? ""}
              onChange={(e) =>
                onChange({ ...mapping, [field]: e.target.value === "" ? null : e.target.value })
              }
              className="h-9 w-full rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] px-2 text-sm"
            >
              <option value="">— not imported —</option>
              {headers.map((h) => (
                <option key={h} value={h}>
                  {h}
                </option>
              ))}
            </select>
          </label>
        ))}
      </div>

      {!mapping.text ? (
        <p className="mt-3 text-sm text-[var(--danger)]">
          Pick the column that holds the highlight text.
        </p>
      ) : null}
    </Card>
  );
}
