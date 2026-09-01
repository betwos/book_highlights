import {
  anthropic,
  MODEL,
  MAX_TOKENS,
  OUTPUT_EFFORT,
  THINKING,
  sumUsage,
  usageFrom,
  type Usage,
} from "./client";
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
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";

/** Above this many input tokens the single call is replaced by map-reduce. */
export const MAP_REDUCE_TOKEN_THRESHOLD = 120_000;
export const CHUNK_SIZE = 50;

/**
 * Real token count via the API — never a character-count heuristic (SPEC 9.6).
 */
export async function countPromptTokens(system: string, userText: string): Promise<number> {
  const res = await anthropic.messages.countTokens({
    model: MODEL,
    system: [{ type: "text", text: system }],
    messages: [{ role: "user", content: userText }],
  });
  return res.input_tokens;
}

export function chunkHighlights<T>(highlights: T[], size = CHUNK_SIZE): { items: T[]; offset: number }[] {
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
  const message = await anthropic.messages.parse({
    model: MODEL,
    max_tokens: MAX_TOKENS,
    thinking: THINKING,
    // System block first and cached: chunks after the first read the same prefix.
    system: [{ type: "text", text: MAP_SYSTEM, cache_control: { type: "ephemeral" } }],
    output_config: { effort: OUTPUT_EFFORT, format: zodOutputFormat(CandidateThemesSchema) },
    messages: [
      {
        role: "user",
        content: `${renderBookHeader(book)}\n\nHighlights in this chunk:\n\n${renderHighlights(chunk, offset)}`,
      },
    ],
  });

  const usage = usageFrom(message.usage);
  const parsed = message.parsed_output;
  if (!parsed) return { candidates: [], usage };

  // A chunk only ever sees its own ids; silently discard anything else.
  const chunkLookup = buildLookup(chunk, offset);
  const candidates = dropInvalidCitations(parsed.candidates, chunkLookup);
  return { candidates, usage };
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
  const userText = `${renderBookHeader(book)}\n\nCandidate themes:\n\n${renderCandidates(candidates)}`;
  const usages: Usage[] = [];

  const messages: Parameters<typeof anthropic.messages.stream>[0]["messages"] = [
    { role: "user", content: userText },
  ];

  for (let attempt = 0; attempt < 2; attempt++) {
    // The reduce output is the largest of the run; stream it so a long
    // generation cannot hit the request timeout.
    const stream = anthropic.messages.stream({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      thinking: THINKING,
      system: [{ type: "text", text: REDUCE_SYSTEM, cache_control: { type: "ephemeral" } }],
      output_config: { effort: OUTPUT_EFFORT, format: zodOutputFormat(TakeawaysSchema) },
      messages,
    });
    const message = await stream.finalMessage();
    usages.push(usageFrom(message.usage));

    const parsed = message.parsed_output;
    if (!parsed) throw new Error("The model returned no parseable takeaways.");

    const invalid = invalidCitations(parsed.takeaways, lookup);
    if (invalid.length === 0) return { takeaways: parsed.takeaways, usage: sumUsage(usages) };

    if (attempt === 0) {
      messages.push(
        { role: "assistant", content: JSON.stringify(parsed) },
        { role: "user", content: citationRetryMessage(invalid, lookup) },
      );
      continue;
    }

    return { takeaways: dropInvalidCitations(parsed.takeaways, lookup), usage: sumUsage(usages) };
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
