import { GoogleGenAI, ApiError } from "@google/genai";
import { z } from "zod";
import type {
  AiProvider,
  Pricing,
  StructuredRequest,
  StructuredResult,
  Usage,
} from "../provider";
import { EMPTY_USAGE } from "../provider";

export const DEFAULT_MODEL = "gemini-3.5-flash";

const MAX_TOKENS = 32000;

/**
 * US dollars per million tokens, input / output, standard tier list price.
 * A model missing from this table falls back to the default's prices — the cost
 * column is then an estimate, which is better than a crash or a zero.
 */
const LIST_PRICES: Record<string, [number, number]> = {
  "gemini-3.1-pro-preview": [2.0, 12.0],
  "gemini-3.5-flash": [1.5, 9.0],
  "gemini-3.5-flash-lite": [0.3, 2.5],
  "gemini-3.1-flash-lite": [0.25, 1.5],
  "gemini-2.5-pro": [1.25, 10.0],
  "gemini-2.5-flash": [0.3, 2.5],
  "gemini-2.5-flash-lite": [0.1, 0.4],
};

function pricingFor(model: string): Pricing {
  const [input, output] = LIST_PRICES[model] ?? LIST_PRICES[DEFAULT_MODEL];
  return {
    inputPerMTok: input,
    outputPerMTok: output,
    // Cached input bills at 0.1x, as on Anthropic. Unlike Anthropic there is no
    // write premium: implicit caching is automatic and costs nothing to fill,
    // so a "cache creation" token is just an input token.
    cacheReadPerMTok: input * 0.1,
    cacheWritePerMTok: input,
  };
}

/**
 * Gemini reports thinking tokens separately from the visible answer, but they
 * are billed as output, so they belong in `tokensOut`. `promptTokenCount`
 * already includes the cached tokens, so the cached share is subtracted out to
 * keep `tokensIn` the tokens actually billed at full rate.
 */
function usageFrom(usage: { [k: string]: unknown } | undefined): Usage {
  if (!usage) return { ...EMPTY_USAGE };

  const prompt = Number(usage.promptTokenCount ?? 0);
  const cached = Number(usage.cachedContentTokenCount ?? 0);
  const candidates = Number(usage.candidatesTokenCount ?? 0);
  const thoughts = Number(usage.thoughtsTokenCount ?? 0);

  return {
    tokensIn: Math.max(prompt - cached, 0),
    tokensOut: candidates + thoughts,
    cacheReadTokens: cached,
    cacheCreationTokens: 0,
  };
}

/**
 * Gemini takes a JSON Schema rather than a zod schema. `$schema` and the draft
 * keywords zod emits alongside it are rejected by the API, so they are stripped.
 */
function jsonSchemaFor(schema: z.ZodType): unknown {
  const json = z.toJSONSchema(schema, { target: "draft-7", io: "output" }) as Record<
    string,
    unknown
  >;
  const { $schema, ...rest } = json;
  void $schema;
  return rest;
}

export function createGeminiProvider(): AiProvider {
  const model = process.env.GEMINI_MODEL?.trim() || DEFAULT_MODEL;

  // Lazy, like the Anthropic provider: browsing the app must not require a key,
  // only generating does. The library page reads `provider.model` on every render.
  let sdk: GoogleGenAI | null = null;
  const client = () => {
    if (sdk) return sdk;
    const apiKey = process.env.GEMINI_API_KEY?.trim();
    if (!apiKey) throw new Error("GEMINI_API_KEY is not set.");
    return (sdk = new GoogleGenAI({ apiKey }));
  };

  return {
    id: "gemini",
    model,
    pricing: pricingFor(model),

    async generateStructured<T>(request: StructuredRequest<T>): Promise<StructuredResult<T>> {
      const response = await client().models.generateContent({
        model,
        // The seam's message list is text-only, which maps onto Gemini's
        // user/model turn roles one for one.
        contents: request.messages.map((m) => ({
          role: m.role === "assistant" ? "model" : "user",
          parts: [{ text: m.content }],
        })),
        config: {
          // Gemini caches long prefixes implicitly, so the frozen system prompt
          // needs no explicit cache_control marker to get the discount.
          systemInstruction: request.system,
          maxOutputTokens: request.maxTokens ?? MAX_TOKENS,
          responseMimeType: "application/json",
          responseJsonSchema: jsonSchemaFor(request.schema),
        },
      });

      const usage = usageFrom(response.usageMetadata as Record<string, unknown> | undefined);
      const text = response.text;
      if (!text) return { value: null, usage };

      // Schema-constrained decoding still has to survive a truncated response,
      // so parse defensively: a null value is a handled outcome upstream.
      let parsed: unknown;
      try {
        parsed = JSON.parse(text);
      } catch {
        return { value: null, usage };
      }

      const result = request.schema.safeParse(parsed);
      return { value: result.success ? result.data : null, usage };
    },

    async countTokens(system: string, text: string): Promise<number> {
      const response = await client().models.countTokens({
        model,
        contents: [{ role: "user", parts: [{ text: `${system}\n\n${text}` }] }],
      });
      return response.totalTokens ?? 0;
    },

    describeError(err: unknown): string {
      if (err instanceof ApiError) {
        if (err.status === 429) return "Rate limited by the Gemini API. Try again in a minute.";
        if (err.status === 401 || err.status === 403) {
          return "Gemini API authentication failed — check GEMINI_API_KEY.";
        }
        return `Gemini API error ${err.status}: ${err.message}`;
      }
      if (err instanceof Error) return err.message;
      return String(err);
    },
  };
}
