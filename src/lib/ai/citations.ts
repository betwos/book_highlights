export type PromptHighlight = {
  id: string;
  text: string;
  note?: string | null;
  location?: string | null;
  locationType?: string | null;
};

/** `H<n>` token -> database highlight id. */
export type HighlightLookup = Map<string, string>;

export type Cited = { highlightIds: string[] };

export function tokenFor(index: number): string {
  return `H${index + 1}`;
}

export function buildLookup(highlights: PromptHighlight[], offset = 0): HighlightLookup {
  const lookup: HighlightLookup = new Map();
  highlights.forEach((h, i) => lookup.set(tokenFor(offset + i), h.id));
  return lookup;
}

/** `[H12] The text of the highlight. (loc 1423)` plus `Note: ...` on its own line. */
export function renderHighlights(highlights: PromptHighlight[], offset = 0): string {
  return highlights
    .map((h, i) => {
      const token = tokenFor(offset + i);
      const where = h.location
        ? ` (${h.locationType === "page" ? "p." : h.locationType === "offset" ? "offset" : "loc"} ${h.location})`
        : "";
      const note = h.note?.trim() ? `\nNote: ${h.note.trim()}` : "";
      return `[${token}] ${h.text.trim()}${where}${note}`;
    })
    .join("\n\n");
}

/** Ids cited by the model that were never given to it. Deduped, in order. */
export function invalidCitations(items: Cited[], lookup: HighlightLookup): string[] {
  const bad: string[] = [];
  const seen = new Set<string>();
  for (const item of items) {
    for (const id of item.highlightIds) {
      if (lookup.has(id) || seen.has(id)) continue;
      seen.add(id);
      bad.push(id);
    }
  }
  return bad;
}

export function citationRetryMessage(invalid: string[], lookup: HighlightLookup): string {
  const known = [...lookup.keys()];
  const range = known.length > 0 ? `${known[0]} through ${known[known.length - 1]}` : "none";
  return [
    `These cited highlight ids were not in the highlights you were given: ${invalid.join(", ")}.`,
    `The only valid ids are the ones in the list above (${range}).`,
    "Rewrite your answer citing only ids that appear there. Never cite an id that was not provided.",
  ].join(" ");
}

/**
 * Drop unknown ids, then drop takeaways left with none. Second-failure fallback
 * (SPEC 9.4 step 3) — the caller decides whether what remains is enough.
 */
export function dropInvalidCitations<T extends Cited>(items: T[], lookup: HighlightLookup): T[] {
  return items
    .map((item) => ({ ...item, highlightIds: item.highlightIds.filter((id) => lookup.has(id)) }))
    .filter((item) => item.highlightIds.length > 0);
}

/** Map `H<n>` tokens back to real database ids before persisting (SPEC 9.4 step 4). */
export function resolveCitations<T extends Cited>(items: T[], lookup: HighlightLookup): T[] {
  return items.map((item) => ({
    ...item,
    highlightIds: item.highlightIds
      .map((token) => lookup.get(token))
      .filter((id): id is string => typeof id === "string"),
  }));
}
