import { getProvider, type Usage } from "./provider";
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
  const { value, usage } = await getProvider().generateStructured({
    system: CHAPTERS_SYSTEM,
    messages: [{ role: "user", content: renderBookHeader(book, true) }],
    schema: ChapterOutlineSchema,
  });

  if (!value) throw new ChaptersError("The model returned no parseable chapter outline.");

  // Belt and braces: an unrecognized book never carries chapters.
  const outline = value.bookRecognized ? value : { ...value, chapters: [] };

  return { outline, usage };
}
