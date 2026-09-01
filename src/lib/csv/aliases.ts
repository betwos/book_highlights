import {
  CANONICAL_FIELDS,
  headerKey,
  type CanonicalField,
  type Mapping,
} from "./detect";

/** Where a stored decision came from. A user's own edit outranks the model's guess. */
export type AliasSource = "user" | "llm";

export type StoredAlias = {
  headerKey: string;
  headerSample: string;
  /** Canonical field, or null for "this column is never imported". */
  field: CanonicalField | null;
  source: AliasSource;
};

/** How each mapped field got its header — surfaced in the import UI. */
export type FieldSource = "detected" | "learned" | "ai";
export type MappingSources = Partial<Record<CanonicalField, FieldSource>>;

export type ResolvedMapping = {
  mapping: Mapping;
  sources: MappingSources;
  /** Headers a stored alias says to leave out of the import. */
  ignoredHeaders: string[];
};

export function aliasMap(aliases: StoredAlias[]): Map<string, StoredAlias> {
  return new Map(aliases.map((a) => [a.headerKey, a]));
}

export function sourcesFor(mapping: Mapping, source: FieldSource): MappingSources {
  const sources: MappingSources = {};
  for (const field of CANONICAL_FIELDS) {
    if (mapping[field]) sources[field] = source;
  }
  return sources;
}

function unassign(mapping: Mapping, sources: MappingSources, header: string, keep?: CanonicalField) {
  for (const field of CANONICAL_FIELDS) {
    if (field === keep) continue;
    if (mapping[field] === header) {
      mapping[field] = null;
      delete sources[field];
    }
  }
}

/**
 * Overlay remembered header decisions on the heuristic mapping. A stored alias
 * wins over header detection: it is a decision made about this reader's own
 * files, where detection is only a guess about names in general. User-sourced
 * aliases are applied before model-sourced ones, so the reader's own correction
 * takes the field when two headers compete for it.
 */
export function applyAliases(
  headers: string[],
  base: Mapping,
  aliases: Map<string, StoredAlias>,
): ResolvedMapping {
  const mapping = { ...base };
  const sources = sourcesFor(base, "detected");
  const ignoredHeaders: string[] = [];

  const matched = headers
    .map((header) => ({ header, alias: aliases.get(headerKey(header)) }))
    .filter((m): m is { header: string; alias: StoredAlias } => m.alias !== undefined)
    .sort((a, b) => (a.alias.source === b.alias.source ? 0 : a.alias.source === "user" ? -1 : 1));

  const claimed = new Set<CanonicalField>();

  for (const { header, alias } of matched) {
    if (alias.field === null) {
      ignoredHeaders.push(header);
      unassign(mapping, sources, header);
      continue;
    }
    if (claimed.has(alias.field)) continue;

    unassign(mapping, sources, header, alias.field);
    mapping[alias.field] = header;
    sources[alias.field] = "learned";
    claimed.add(alias.field);
  }

  return { mapping, sources, ignoredHeaders };
}

/**
 * Headers still worth asking the model about: not already mapped, not covered
 * by a remembered decision. An empty result means the import needs no LLM call.
 */
export function unresolvedHeaders(
  headers: string[],
  resolved: ResolvedMapping,
  aliases: Map<string, StoredAlias>,
): string[] {
  const used = new Set(
    CANONICAL_FIELDS.map((f) => resolved.mapping[f]).filter((h): h is string => h !== null),
  );
  return headers.filter((h) => !used.has(h) && !aliases.has(headerKey(h)));
}

export type AiAssignment = { header: string; field: CanonicalField | null };

/**
 * Fold the model's answers in. The model only ever fills a hole: it may not
 * move a header that detection or a remembered decision already placed, and the
 * first assignment wins when it names one field twice.
 */
export function mergeAiAssignments(
  resolved: ResolvedMapping,
  assignments: AiAssignment[],
): ResolvedMapping {
  const mapping = { ...resolved.mapping };
  const sources: MappingSources = { ...resolved.sources };
  const used = new Set(
    CANONICAL_FIELDS.map((f) => mapping[f]).filter((h): h is string => h !== null),
  );

  for (const { header, field } of assignments) {
    if (field === null) continue;
    if (used.has(header)) continue;
    if (mapping[field] !== null) continue;

    mapping[field] = header;
    sources[field] = "ai";
    used.add(header);
  }

  return { ...resolved, mapping, sources };
}

/** The decisions worth persisting after a resolve or a confirmed import. */
export function aliasesToRemember(
  headers: string[],
  mapping: Mapping,
  source: AliasSource,
): StoredAlias[] {
  const fieldByHeader = new Map<string, CanonicalField>();
  for (const field of CANONICAL_FIELDS) {
    const header = mapping[field];
    if (header) fieldByHeader.set(header, field);
  }

  return headers.map((header) => ({
    headerKey: headerKey(header),
    headerSample: header,
    field: fieldByHeader.get(header) ?? null,
    source,
  }));
}
