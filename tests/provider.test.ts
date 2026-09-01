import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { z } from "zod";
import { getProvider, resetProvider, sumUsage, EMPTY_USAGE, type Pricing } from "@/lib/ai/provider";
import { costCents, costDollars } from "@/lib/ai/cost";

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => resetProvider());

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  resetProvider();
});

describe("provider selection", () => {
  it("defaults to anthropic with the spec's model", () => {
    delete process.env.AI_PROVIDER;
    delete process.env.ANTHROPIC_MODEL;

    const provider = getProvider();
    expect(provider.id).toBe("anthropic");
    expect(provider.model).toBe("claude-opus-5");
  });

  it("does not need an API key to report its model", () => {
    // The library page reads `currentModel()` for the stale badge; browsing the
    // app must not require credentials.
    delete process.env.ANTHROPIC_API_KEY;
    expect(() => getProvider().model).not.toThrow();
  });

  it("honours ANTHROPIC_MODEL and prices it correctly", () => {
    process.env.ANTHROPIC_MODEL = "claude-sonnet-5";

    const provider = getProvider();
    expect(provider.model).toBe("claude-sonnet-5");
    expect(provider.pricing.inputPerMTok).toBe(2);
    expect(provider.pricing.outputPerMTok).toBe(10);
  });

  it("rejects an unknown provider by name", () => {
    process.env.AI_PROVIDER = "definitely-not-a-provider";
    expect(() => getProvider()).toThrow(/definitely-not-a-provider/);
  });

  it("prices cached reads below fresh input", () => {
    const { pricing } = getProvider();
    expect(pricing.cacheReadPerMTok).toBeLessThan(pricing.inputPerMTok);
    expect(pricing.cacheWritePerMTok).toBeGreaterThan(pricing.inputPerMTok);
  });
});

describe("gemini provider", () => {
  beforeEach(() => {
    process.env.AI_PROVIDER = "gemini";
    delete process.env.GEMINI_MODEL;
  });

  it("is selected by AI_PROVIDER and carries its own default model", () => {
    const provider = getProvider();
    expect(provider.id).toBe("gemini");
    expect(provider.model).toBe("gemini-3.5-flash");
  });

  it("honours GEMINI_MODEL and prices it correctly", () => {
    process.env.GEMINI_MODEL = "gemini-2.5-pro";
    resetProvider();

    const provider = getProvider();
    expect(provider.model).toBe("gemini-2.5-pro");
    expect(provider.pricing.inputPerMTok).toBe(1.25);
    expect(provider.pricing.outputPerMTok).toBe(10);
    expect(provider.pricing.cacheReadPerMTok).toBeCloseTo(0.125, 6);
  });

  it("falls back to the default model's prices for an unknown model id", () => {
    process.env.GEMINI_MODEL = "gemini-from-the-future";
    resetProvider();

    expect(getProvider().pricing.inputPerMTok).toBe(1.5);
  });

  it("charges no premium to fill the cache — implicit caching is free", () => {
    // Unlike Anthropic, where a cache write costs 1.25x input.
    const { pricing } = getProvider();
    expect(pricing.cacheWritePerMTok).toBe(pricing.inputPerMTok);
    expect(pricing.cacheReadPerMTok).toBeLessThan(pricing.inputPerMTok);
  });

  it("reports its model without a key, and names the missing key when asked to generate", async () => {
    delete process.env.GEMINI_API_KEY;
    const provider = getProvider();

    expect(provider.model).toBe("gemini-3.5-flash");
    await expect(
      provider.generateStructured({
        system: "s",
        messages: [{ role: "user", content: "u" }],
        schema: z.object({ ok: z.boolean() }),
      }),
    ).rejects.toThrow(/GEMINI_API_KEY/);
  });
});

describe("cost", () => {
  const pricing: Pricing = {
    inputPerMTok: 5,
    outputPerMTok: 25,
    cacheReadPerMTok: 0.5,
    cacheWritePerMTok: 6.25,
  };

  it("bills each token class at its own rate", () => {
    const dollars = costDollars(
      { tokensIn: 1_000_000, tokensOut: 1_000_000, cacheReadTokens: 1_000_000, cacheCreationTokens: 0 },
      pricing,
    );
    expect(dollars).toBeCloseTo(30.5, 6);
  });

  it("rounds up to whole cents", () => {
    const usage = { ...EMPTY_USAGE, tokensIn: 1 };
    expect(costCents(usage, pricing)).toBe(1);
  });

  it("costs nothing when nothing was used", () => {
    expect(costCents(EMPTY_USAGE, pricing)).toBe(0);
  });
});

describe("usage arithmetic", () => {
  it("sums every token class across calls", () => {
    const total = sumUsage([
      { tokensIn: 10, tokensOut: 1, cacheReadTokens: 100, cacheCreationTokens: 5 },
      { tokensIn: 20, tokensOut: 2, cacheReadTokens: 200, cacheCreationTokens: 0 },
    ]);

    expect(total).toEqual({
      tokensIn: 30,
      tokensOut: 3,
      cacheReadTokens: 300,
      cacheCreationTokens: 5,
    });
  });

  it("returns an empty usage for no calls", () => {
    expect(sumUsage([])).toEqual(EMPTY_USAGE);
  });
});
