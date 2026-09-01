import type { ZodType } from "zod";

/**
 * The seam between this app and whichever model API it talks to.
 *
 * Everything above this file — prompts, schemas, citation validation, the
 * map-reduce orchestration, the job row, the UI — is provider-neutral. Adding a
 * second provider means writing one implementation and registering it in
 * `FACTORIES` below; nothing else should need to change.
 */

export type Usage = {
  tokensIn: number;
  tokensOut: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
};

export const EMPTY_USAGE: Usage = {
  tokensIn: 0,
  tokensOut: 0,
  cacheReadTokens: 0,
  cacheCreationTokens: 0,
};

export function addUsage(a: Usage, b: Usage): Usage {
  return {
    tokensIn: a.tokensIn + b.tokensIn,
    tokensOut: a.tokensOut + b.tokensOut,
    cacheReadTokens: a.cacheReadTokens + b.cacheReadTokens,
    cacheCreationTokens: a.cacheCreationTokens + b.cacheCreationTokens,
  };
}

export function sumUsage(usages: Usage[]): Usage {
  return usages.reduce(addUsage, { ...EMPTY_USAGE });
}

/** US dollars per million tokens. */
export type Pricing = {
  inputPerMTok: number;
  outputPerMTok: number;
  cacheReadPerMTok: number;
  cacheWritePerMTok: number;
};

export type ProviderMessage = { role: "user" | "assistant"; content: string };

export type StructuredRequest<T> = {
  /**
   * Frozen prefix — no interpolated dates, ids, or counts. A provider that
   * supports prefix caching should mark this cacheable; one that does not can
   * send it as an ordinary system prompt.
   */
  system: string;
  messages: ProviderMessage[];
  schema: ZodType<T>;
  maxTokens?: number;
  /**
   * Hint that this output is the largest in the run. Providers that support
   * streaming should use it so a long generation cannot hit a request timeout.
   */
  stream?: boolean;
};

/** `value` is null when the model returned nothing that parsed. */
export type StructuredResult<T> = { value: T | null; usage: Usage };

export interface AiProvider {
  readonly id: string;
  readonly model: string;
  readonly pricing: Pricing;

  generateStructured<T>(request: StructuredRequest<T>): Promise<StructuredResult<T>>;

  /**
   * Real token count for a prompt. Used to decide whether the highlight block
   * needs map-reduce — never a character-count heuristic.
   */
  countTokens(system: string, text: string): Promise<number>;

  /** Human-readable message for this provider's typed errors. */
  describeError(err: unknown): string;
}

import { createAnthropicProvider } from "./providers/anthropic";
import { createGeminiProvider } from "./providers/gemini";

const FACTORIES: Record<string, () => AiProvider> = {
  anthropic: createAnthropicProvider,
  gemini: createGeminiProvider,
};

let cached: AiProvider | null = null;

export function getProvider(): AiProvider {
  if (cached) return cached;

  const id = (process.env.AI_PROVIDER ?? "anthropic").trim().toLowerCase();
  const factory = FACTORIES[id];
  if (!factory) {
    throw new Error(
      `Unknown AI_PROVIDER "${id}". Known providers: ${Object.keys(FACTORIES).join(", ")}.`,
    );
  }

  cached = factory();
  return cached;
}

/** Test seam — forget the memoized provider so env changes take effect. */
export function resetProvider(): void {
  cached = null;
}
