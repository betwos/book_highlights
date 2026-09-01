import { getProvider, sumUsage, type ProviderMessage, type Usage } from "./provider";
import { MAP_SYSTEM, REDUCE_SYSTEM } from "./prompts";
import { CandidateThemesSchema, TakeawaysSchema, type CandidateTheme, type Takeaway } from "./schemas";
import {
  buildLookup,
  renderHighlights,
  invalidCitations,
  citationRetryMessage,
  dropInvalidCitations,
  type HighlightLookup,
  type PromptHighlight,
} from "./citations";
import { renderBookHeader, type BookMeta } from "./types";

/** Above this many input tokens the single call is replaced by map-reduce. */
export const MAP_REDUCE_TOKEN_THRESHOLD = Number(
  process.env.MAP_REDUCE_TOKEN_THRESHOLD ?? 120_000,
);
export const CHUNK_SIZE = 50;

/** Real token count via the provider — never a character-count heuristic. */
export async function countPromptTokens(system: string, userText: string): Promise<number> {
  return getProvider().countTokens(system, userText);
}

export function chunkHighlights<T>(
  highlights: T[],
  size = CHUNK_SIZE,
): { items: T[]; offset: number }[] {
  const chunks: { items: T[]; offset: number }[] = [];
  for (let i = 0; i < highlights.length; i += size) {
    chunks.push({ items: highlights.slice(i, i + size), offset: i });
  }
  return chunks;
}

async function mapChunk(
  book: BookMeta,
  chunk: PromptHighlight[],
  offset: number,
): Promise<{ candidates: CandidateTheme[]; usage: Usage }> {
  const { value, usage } = await getProvider().generateStructured({
    system: MAP_SYSTEM,
    messages: [
      {
        role: "user",
        content: `${renderBookHeader(book)}\n\nHighlights in this chunk:\n\n${renderHighlights(chunk, offset)}`,
      },
    ],
    schema: CandidateThemesSchema,
  });

  if (!value) return { candidates: [], usage };

  // A chunk only ever sees its own ids; silently discard anything else.
  const chunkLookup = buildLookup(chunk, offset);
  return { candidates: dropInvalidCitations(value.candidates, chunkLookup), usage };
}

function renderCandidates(candidates: CandidateTheme[]): string {
  return candidates
    .map((c, i) => `${i + 1}. [${c.theme}] ${c.claim}\n   Cites: ${c.highlightIds.join(", ")}`)
    .join("\n\n");
}

async function reduce(
  book: BookMeta,
  candidates: CandidateTheme[],
  lookup: HighlightLookup,
): Promise<{ takeaways: Takeaway[]; usage: Usage }> {
  const provider = getProvider();
  const usages: Usage[] = [];
  const messages: ProviderMessage[] = [
    {
      role: "user",
      content: `${renderBookHeader(book)}\n\nCandidate themes:\n\n${renderCandidates(candidates)}`,
    },
  ];

  for (let attempt = 0; attempt < 2; attempt++) {
    // The reduce output is the largest of the run — stream it so a long
    // generation cannot hit the request timeout.
    const { value, usage } = await provider.generateStructured({
      system: REDUCE_SYSTEM,
      messages,
      schema: TakeawaysSchema,
      stream: true,
    });
    usages.push(usage);

    if (!value) throw new Error("The model returned no parseable takeaways.");

    const invalid = invalidCitations(value.takeaways, lookup);
    if (invalid.length === 0) return { takeaways: value.takeaways, usage: sumUsage(usages) };

    if (attempt === 0) {
      messages.push(
        { role: "assistant", content: JSON.stringify(value) },
        { role: "user", content: citationRetryMessage(invalid, lookup) },
      );
      continue;
    }

    return { takeaways: dropInvalidCitations(value.takeaways, lookup), usage: sumUsage(usages) };
  }

  throw new Error("Unreachable");
}

/**
 * MAP over chunks of ~50 highlights, then REDUCE the candidates into 3–5
 * takeaways with citations preserved verbatim (SPEC 9.6).
 */
export async function takeawaysViaMapReduce(
  book: BookMeta,
  highlights: PromptHighlight[],
  lookup: HighlightLookup,
): Promise<{ takeaways: Takeaway[]; usage: Usage }> {
  const chunks = chunkHighlights(highlights);
  const usages: Usage[] = [];
  const candidates: CandidateTheme[] = [];

  // The first chunk writes the cached MAP prefix; run it alone so the rest read it.
  const [first, ...rest] = chunks;
  const firstResult = await mapChunk(book, first.items, first.offset);
  candidates.push(...firstResult.candidates);
  usages.push(firstResult.usage);

  const restResults = await Promise.all(rest.map((c) => mapChunk(book, c.items, c.offset)));
  for (const r of restResults) {
    candidates.push(...r.candidates);
    usages.push(r.usage);
  }

  if (candidates.length === 0) {
    throw new Error("No themes could be extracted from these highlights.");
  }

  const candidateLookup: HighlightLookup = new Map();
  for (const c of candidates) {
    for (const token of c.highlightIds) {
      const id = lookup.get(token);
      if (id) candidateLookup.set(token, id);
    }
  }

  const reduced = await reduce(book, candidates, candidateLookup);
  usages.push(reduced.usage);

  return { takeaways: reduced.takeaways, usage: sumUsage(usages) };
}
