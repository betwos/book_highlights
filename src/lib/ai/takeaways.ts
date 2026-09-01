import { getProvider, sumUsage, type ProviderMessage, type Usage } from "./provider";
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
  const provider = getProvider();
  const usages: Usage[] = [];
  const messages: ProviderMessage[] = [
    { role: "user", content: userMessage(book, highlights) },
  ];

  for (let attempt = 0; attempt < 2; attempt++) {
    const { value, usage } = await provider.generateStructured({
      system: TAKEAWAYS_SYSTEM,
      messages,
      schema: TakeawaysSchema,
    });
    usages.push(usage);

    if (!value) throw new TakeawaysError("The model returned no parseable takeaways.");

    const invalid = invalidCitations(value.takeaways, lookup);
    if (invalid.length === 0) return { takeaways: value.takeaways, usage: sumUsage(usages) };

    if (attempt === 0) {
      // Retry once, naming the offending ids and repeating the constraint.
      messages.push(
        { role: "assistant", content: JSON.stringify(value) },
        { role: "user", content: citationRetryMessage(invalid, lookup) },
      );
      continue;
    }

    // Second failure: drop the invalid ids, then the takeaways left with none.
    return { takeaways: dropInvalidCitations(value.takeaways, lookup), usage: sumUsage(usages) };
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
