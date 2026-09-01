import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
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
import { TAKEAWAYS_SYSTEM } from "./prompts";
import { TakeawaysSchema, type Takeaway } from "./schemas";
import {
  buildLookup,
  renderHighlights,
  invalidCitations,
  citationRetryMessage,
  dropInvalidCitations,
  resolveCitations,
  type HighlightLookup,
  type PromptHighlight,
} from "./citations";
import { renderBookHeader, type BookMeta } from "./types";
import { countPromptTokens, MAP_REDUCE_TOKEN_THRESHOLD, takeawaysViaMapReduce } from "./map-reduce";

export const MIN_TAKEAWAYS = 3;

export class TakeawaysError extends Error {}

function userMessage(book: BookMeta, highlights: PromptHighlight[]): string {
  return `${renderBookHeader(book)}\n\nThe reader's highlights:\n\n${renderHighlights(highlights)}`;
}

async function singleCall(
  book: BookMeta,
  highlights: PromptHighlight[],
  lookup: HighlightLookup,
): Promise<{ takeaways: Takeaway[]; usage: Usage }> {
  const usages: Usage[] = [];
  const messages: Parameters<typeof anthropic.messages.parse>[0]["messages"] = [
    { role: "user", content: userMessage(book, highlights) },
  ];

  for (let attempt = 0; attempt < 2; attempt++) {
    const message = await anthropic.messages.parse({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      thinking: THINKING,
      // System block first, cached — the retry shares this prefix.
      system: [{ type: "text", text: TAKEAWAYS_SYSTEM, cache_control: { type: "ephemeral" } }],
      output_config: { effort: OUTPUT_EFFORT, format: zodOutputFormat(TakeawaysSchema) },
      messages,
    });
    usages.push(usageFrom(message.usage));

    const parsed = message.parsed_output;
    if (!parsed) throw new TakeawaysError("The model returned no parseable takeaways.");

    const invalid = invalidCitations(parsed.takeaways, lookup);
    if (invalid.length === 0) return { takeaways: parsed.takeaways, usage: sumUsage(usages) };

    if (attempt === 0) {
      // Retry once, naming the offending ids and repeating the constraint.
      messages.push(
        { role: "assistant", content: JSON.stringify(parsed) },
        { role: "user", content: citationRetryMessage(invalid, lookup) },
      );
      continue;
    }

    // Second failure: drop the invalid ids, then the takeaways left with none.
    return { takeaways: dropInvalidCitations(parsed.takeaways, lookup), usage: sumUsage(usages) };
  }

  throw new TakeawaysError("Unreachable");
}

/**
 * Takeaways are grounded: their only permitted evidence is the reader's
 * highlights (SPEC 4.1). The returned `highlightIds` are real database ids.
 */
export async function generateTakeaways(
  book: BookMeta,
  highlights: PromptHighlight[],
): Promise<{ takeaways: Takeaway[]; usage: Usage }> {
  if (highlights.length === 0) {
    throw new TakeawaysError("This book has no highlights to analyze.");
  }

  const lookup = buildLookup(highlights);
  const tokens = await countPromptTokens(TAKEAWAYS_SYSTEM, userMessage(book, highlights));

  const result =
    tokens > MAP_REDUCE_TOKEN_THRESHOLD
      ? await takeawaysViaMapReduce(book, highlights, lookup)
      : await singleCall(book, highlights, lookup);

  if (result.takeaways.length < MIN_TAKEAWAYS) {
    throw new TakeawaysError(
      `Only ${result.takeaways.length} takeaway(s) survived citation validation; at least ${MIN_TAKEAWAYS} are required.`,
    );
  }

  return { takeaways: resolveCitations(result.takeaways, lookup), usage: result.usage };
}
