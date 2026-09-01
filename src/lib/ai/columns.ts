import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { anthropic, MODEL, THINKING, usageFrom, type Usage } from "./client";
import { CANONICAL_FIELDS, isCanonicalField, type CanonicalField } from "@/lib/csv/detect";
import type { CsvRow } from "@/lib/csv/parse";

/**
 * This prompt deliberately does NOT live in prompts.ts: PROMPT_VERSION there is
 * part of the analysis cache key, and an import-time prompt has no business
 * invalidating stored analyses.
 */
export const COLUMNS_SYSTEM = `You map the column headers of a highlights export onto a fixed set of fields used by a reading app.

You are given the headers of one CSV file and a few example values from each column. Decide, for each header, which field it holds.

The fields:
- text — the highlighted passage itself. Long prose, often a full sentence or paragraph. This is the important one.
- title — the book's title.
- author — the book's author.
- note — the reader's own note or annotation about a highlight, written by the reader, not the book's author.
- location — where in the book the highlight sits: a page number, a Kindle location, a chapter, a percentage, an offset.
- locationType — a column that names the unit of the location column ("page", "location", "offset"), not a location itself.
- color — the highlight's color.
- tags — reader-applied tags, usually comma-separated.
- highlightedAt — when the highlight was made: a date or timestamp.

Rules
1. Answer for every header you were given, exactly once, using the header string verbatim.
2. Use "none" for any header that fits no field — ids, urls, book metadata other than title and author, empty columns, internal flags. "none" is a correct answer and is much better than a forced fit.
3. Judge by the example values as much as by the name. A column called "text" holding "Chapter 3" is a location, not the highlighted passage.
4. Never assign the same field to two headers. If two could serve, take the better one and answer "none" for the other.
5. A single column may not be split, and you may not invent fields.
6. confidence is your own: "high" only when both the name and the values agree.`;

const FIELD_CHOICES = [...CANONICAL_FIELDS, "none"] as const;

export const ColumnAssignmentSchema = z.object({
  header: z.string(),
  field: z.enum(FIELD_CHOICES),
  confidence: z.enum(["high", "medium", "low"]),
  reason: z.string().max(200),
});

export const ColumnMatchSchema = z.object({
  assignments: z.array(ColumnAssignmentSchema),
});

export type ColumnAssignment = z.infer<typeof ColumnAssignmentSchema>;

const MAX_SAMPLES = 3;
const MAX_SAMPLE_CHARS = 160;
const MAX_TOKENS = 4000;

function samples(rows: CsvRow[], header: string): string[] {
  const values: string[] = [];
  for (const row of rows) {
    const value = (row[header] ?? "").trim();
    if (!value) continue;
    values.push(
      value.length > MAX_SAMPLE_CHARS ? `${value.slice(0, MAX_SAMPLE_CHARS)}…` : value,
    );
    if (values.length === MAX_SAMPLES) break;
  }
  return values;
}

export function renderColumns(headers: string[], rows: CsvRow[]): string {
  return headers
    .map((header) => {
      const values = samples(rows, header);
      const shown = values.length > 0 ? values.map((v) => `    - ${v}`).join("\n") : "    (empty)";
      return `Header: ${header}\n  Example values:\n${shown}`;
    })
    .join("\n\n");
}

export type MatchedColumns = {
  assignments: { header: string; field: CanonicalField | null; confidence: string; reason: string }[];
  usage: Usage;
};

/**
 * Ask the model what the unrecognized headers hold. Callers merge the result on
 * top of header detection and never let it move an already-mapped column; the
 * reader still sees and can edit every row of the mapping.
 */
export async function matchColumns(headers: string[], rows: CsvRow[]): Promise<MatchedColumns> {
  if (headers.length === 0) {
    return { assignments: [], usage: usageFrom(null) };
  }

  const message = await anthropic.messages.parse({
    model: MODEL,
    max_tokens: MAX_TOKENS,
    thinking: THINKING,
    system: [{ type: "text", text: COLUMNS_SYSTEM, cache_control: { type: "ephemeral" } }],
    output_config: { effort: "low", format: zodOutputFormat(ColumnMatchSchema) },
    messages: [{ role: "user", content: renderColumns(headers, rows) }],
  });

  const parsed = message.parsed_output;
  const known = new Set(headers);

  const assignments = (parsed?.assignments ?? [])
    .filter((a) => known.has(a.header))
    .map((a) => ({
      header: a.header,
      field: isCanonicalField(a.field) ? a.field : null,
      confidence: a.confidence,
      reason: a.reason,
    }));

  return { assignments, usage: usageFrom(message.usage) };
}
