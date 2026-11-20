/** Match a highlight across all fields visible in the highlights list. */
export function matchesHighlightQuery(
  highlight: {
    text: string;
    note: string | null;
    location: string | null;
    locationType: string | null;
    tags: string[];
  },
  query: string,
): boolean {
  const normalized = query.trim().toLocaleLowerCase();
  if (!normalized) return true;

  return [
    highlight.text,
    highlight.note,
    highlight.location,
    highlight.locationType,
    ...highlight.tags,
  ].some((value) => value?.toLocaleLowerCase().includes(normalized));
}
