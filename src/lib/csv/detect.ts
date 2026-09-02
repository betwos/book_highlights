export const CANONICAL_FIELDS = [
  "text",
  "title",
  "author",
  "note",
  "location",
  "locationType",
  "color",
  "tags",
  "highlightedAt",
] as const;

export type CanonicalField = (typeof CANONICAL_FIELDS)[number];

/** Column mapping: canonical field -> source header (or null when unmapped). */
export type Mapping = Record<CanonicalField, string | null>;

const RECOGNIZED: Record<CanonicalField, string[]> = {
  text: ["Highlight", "Text", "Quote", "Highlight Text"],
  title: ["Book Title", "Title", "Document Title"],
  author: ["Book Author", "Author", "Document Author"],
  note: ["Note", "Annotation", "Comment"],
  location: ["Location", "Page", "Position"],
  locationType: ["Location Type"],
  color: ["Color", "Highlight Color"],
  tags: ["Tags", "Document Tags"],
  highlightedAt: ["Highlighted at", "Date", "Created"],
};

/** Case- and space-insensitive header key. Also the persisted alias key. */
export function headerKey(header: string): string {
  return header.toLowerCase().replace(/[\s_-]+/g, "");
}

const key = headerKey;

export function isCanonicalField(value: unknown): value is CanonicalField {
  return typeof value === "string" && (CANONICAL_FIELDS as readonly string[]).includes(value);
}

const LOOKUP: Map<string, CanonicalField[]> = (() => {
  const m = new Map<string, CanonicalField[]>();
  for (const field of CANONICAL_FIELDS) {
    for (const alias of RECOGNIZED[field]) {
      const k = key(alias);
      const existing = m.get(k);
      if (existing) existing.push(field);
      else m.set(k, [field]);
    }
  }
  return m;
})();

export function emptyMapping(): Mapping {
  return Object.fromEntries(CANONICAL_FIELDS.map((f) => [f, null])) as Mapping;
}

/**
 * Best-effort mapping of source headers onto canonical fields. Never applied
 * silently: the import UI always shows and allows editing the result (SPEC 8.3).
 * A canonical field with no recognized header stays `null`.
 */
export function detectMapping(headers: string[]): Mapping {
  const mapping = emptyMapping();

  for (const header of headers) {
    const fields = LOOKUP.get(key(header));
    if (!fields) continue;
    for (const field of fields) {
      if (mapping[field] !== null) continue;
      // Prefer a more specific alias: earlier aliases win by header order below.
      mapping[field] = header;
      break;
    }
  }

  return mapping;
}

export function isMappingValid(mapping: Mapping): boolean {
  return typeof mapping.text === "string" && mapping.text.length > 0;
}

/**
 * Source headers the reader has made no decision about yet: neither mapped to a
 * canonical field nor explicitly marked "never import" by a remembered alias.
 *
 * A multi-file import only stops to ask about files that have some of these —
 * a file whose every column is either mapped or deliberately ignored needs no
 * approval, so the reader is not asked to re-confirm what is already settled.
 */
export function unassignedHeaders(
  headers: string[],
  mapping: Mapping,
  ignoredHeaders: readonly string[] = [],
): string[] {
  const decided = new Set<string>();
  for (const field of CANONICAL_FIELDS) {
    const header = mapping[field];
    if (header) decided.add(key(header));
  }
  for (const header of ignoredHeaders) decided.add(key(header));

  return headers.filter((header) => !decided.has(key(header)));
}
