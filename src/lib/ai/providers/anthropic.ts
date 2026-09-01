import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type {
  AiProvider,
  Pricing,
  StructuredRequest,
  StructuredResult,
  Usage,
} from "../provider";
import { EMPTY_USAGE } from "../provider";

export const DEFAULT_MODEL = "claude-opus-5";

const MAX_TOKENS = 32000;
const EFFORT = "high" as const;
const THINKING = { type: "adaptive" } as const;

/** US dollars per million tokens, input / output. */
const LIST_PRICES: Record<string, [number, number]> = {
  "claude-opus-5": [5, 25],
  "claude-opus-4-8": [5, 25],
  "claude-sonnet-5": [2, 10],
  "claude-haiku-4-5": [1, 5],
  "claude-fable-5": [10, 50],
};

function pricingFor(model: string): Pricing {
  const [input, output] = LIST_PRICES[model] ?? LIST_PRICES[DEFAULT_MODEL];
  return {
    inputPerMTok: input,
    outputPerMTok: output,
    // Cached reads bill at ~0.1x input; cache writes at ~1.25x.
    cacheReadPerMTok: input * 0.1,
    cacheWritePerMTok: input * 1.25,
  };
}

function usageFrom(usage: Anthropic.Usage | undefined | null): Usage {
  if (!usage) return { ...EMPTY_USAGE };
  return {
    tokensIn: usage.input_tokens ?? 0,
    tokensOut: usage.output_tokens ?? 0,
    cacheReadTokens: usage.cache_read_input_tokens ?? 0,
    cacheCreationTokens: usage.cache_creation_input_tokens ?? 0,
  };
}

export function createAnthropicProvider(): AiProvider {
  const model = process.env.ANTHROPIC_MODEL?.trim() || DEFAULT_MODEL;

  // Constructed lazily: `new Anthropic()` throws without an API key, and the
  // library page reads `provider.model` for the analysis cache key. Browsing
  // the app must not require a key — only generating does.
  let sdk: Anthropic | null = null;
  const client = () => (sdk ??= new Anthropic());

  return {
    id: "anthropic",
    model,
    pricing: pricingFor(model),

    async generateStructured<T>(request: StructuredRequest<T>): Promise<StructuredResult<T>> {
      const params = {
        model,
        max_tokens: request.maxTokens ?? MAX_TOKENS,
        thinking: THINKING,
        // System block first and cached, so retries and later map chunks read
        // the same prefix instead of paying for it again.
        system: [
          {
            type: "text" as const,
            text: request.system,
            cache_control: { type: "ephemeral" as const },
          },
        ],
        output_config: {
          effort: EFFORT,
          format: zodOutputFormat(request.schema as Parameters<typeof zodOutputFormat>[0]),
        },
        messages: request.messages,
      };

      if (request.stream) {
        const message = await client().messages.stream(params).finalMessage();
        return {
          value: (message.parsed_output as T | null) ?? null,
          usage: usageFrom(message.usage),
        };
      }

      const message = await client().messages.parse(params);
      return {
        value: (message.parsed_output as T | null) ?? null,
        usage: usageFrom(message.usage),
      };
    },

    async countTokens(system: string, text: string): Promise<number> {
      const res = await client().messages.countTokens({
        model,
        system: [{ type: "text", text: system }],
        messages: [{ role: "user", content: text }],
      });
      return res.input_tokens;
    },

    describeError(err: unknown): string {
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
    },
  };
}
