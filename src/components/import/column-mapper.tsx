"use client";

import { CANONICAL_FIELDS, type CanonicalField, type Mapping } from "@/lib/csv/detect";
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

/**
 * Always shown and always editable, even on a perfect Readwise match — a silent
 * auto-map that guesses wrong is the worst failure mode of a CSV importer.
 */
export function ColumnMapper({
  headers,
  mapping,
  onChange,
}: {
  headers: string[];
  mapping: Mapping;
  onChange: (mapping: Mapping) => void;
}) {
  return (
    <Card className="p-4">
      <h2 className="text-sm font-medium">Columns</h2>
      <p className="mt-1 text-sm text-[var(--muted-foreground)]">
        We guessed these from the header row. Check them — highlight text is required.
      </p>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {CANONICAL_FIELDS.map((field) => (
          <label key={field} className="space-y-1.5 text-sm">
            <span className="font-medium">
              {FIELD_LABEL[field]}
              {field === "text" ? <span className="text-[var(--danger)]"> *</span> : null}
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
