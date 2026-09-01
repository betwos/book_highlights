import Anthropic from "@anthropic-ai/sdk";

export const anthropic = new Anthropic(); // reads ANTHROPIC_API_KEY

export const MODEL = "claude-opus-5";

/** Shared request knobs for every call in this app (SPEC 9.1). */
export const MAX_TOKENS = 32000;
export const OUTPUT_EFFORT = "high" as const;
export const THINKING = { type: "adaptive" } as const;

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

export function usageFrom(usage: Anthropic.Usage | undefined | null): Usage {
  if (!usage) return { ...EMPTY_USAGE };
  return {
    tokensIn: usage.input_tokens ?? 0,
    tokensOut: usage.output_tokens ?? 0,
    cacheReadTokens: usage.cache_read_input_tokens ?? 0,
    cacheCreationTokens: usage.cache_creation_input_tokens ?? 0,
  };
}

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

/** Human-readable message for the SDK's typed errors — never string-matched. */
export function describeApiError(err: unknown): string {
  if (err instanceof Anthropic.RateLimitError) {
    return "Rate limited by the Anthropic API. Try again in a minute.";
  }
  if (err instanceof Anthropic.AuthenticationError) {
    return "Anthropic API authentication failed — check ANTHROPIC_API_KEY.";
  }
  if (err instanceof Anthropic.APIConnectionError) {
    return "Could not reach the Anthropic API.";
  }
  if (err instanceof Anthropic.APIError) {
    return `Anthropic API error ${err.status ?? ""}: ${err.message}`.trim();
  }
  if (err instanceof Error) return err.message;
  return String(err);
}
