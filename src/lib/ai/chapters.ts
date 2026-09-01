import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import {
  anthropic,
  MODEL,
  MAX_TOKENS,
  OUTPUT_EFFORT,
  THINKING,
  usageFrom,
  type Usage,
} from "./client";
import { CHAPTERS_SYSTEM } from "./prompts";
import { ChapterOutlineSchema, type ChapterOutline } from "./schemas";
import { renderBookHeader, type BookMeta } from "./types";

export class ChaptersError extends Error {}

/**
 * The chapter outline is recalled, not grounded: it comes from the model's own
 * knowledge of the book and by definition never sees the highlights (SPEC 4.1).
 * `bookRecognized: false` is a success — persist it and let the UI render the
 * empty state. Never retry it.
 */
export async function generateChapters(
  book: BookMeta,
): Promise<{ outline: ChapterOutline; usage: Usage }> {
  const message = await anthropic.messages.parse({
    model: MODEL,
    max_tokens: MAX_TOKENS,
    thinking: THINKING,
    system: [{ type: "text", text: CHAPTERS_SYSTEM, cache_control: { type: "ephemeral" } }],
    output_config: { effort: OUTPUT_EFFORT, format: zodOutputFormat(ChapterOutlineSchema) },
    messages: [{ role: "user", content: renderBookHeader(book, true) }],
  });

  const outline = message.parsed_output;
  if (!outline) throw new ChaptersError("The model returned no parseable chapter outline.");

  // Belt and braces: an unrecognized book never carries chapters.
  if (!outline.bookRecognized) outline.chapters = [];

  return { outline, usage: usageFrom(message.usage) };
}
