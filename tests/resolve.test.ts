import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  matchColumns: vi.fn(),
  loadAliases: vi.fn(),
  rememberAliases: vi.fn(),
  costDollars: vi.fn(),
  describeError: vi.fn(),
}));

vi.mock("@/lib/ai/columns", () => ({ matchColumns: mocks.matchColumns }));
vi.mock("@/lib/ai/cost", () => ({ costDollars: mocks.costDollars }));
vi.mock("@/lib/ai/provider", () => ({
  getProvider: () => ({ model: "test-model", describeError: mocks.describeError }),
}));
vi.mock("@/lib/csv/alias-store", () => ({
  loadAliases: mocks.loadAliases,
  rememberAliases: mocks.rememberAliases,
}));

import { resolveMapping } from "@/lib/csv/resolve";

describe("resolveMapping usage tracking", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.loadAliases.mockResolvedValue([]);
    mocks.rememberAliases.mockResolvedValue(undefined);
    mocks.costDollars.mockReturnValue(0.00042);
    mocks.describeError.mockImplementation((err: unknown) =>
      err instanceof Error ? err.message : String(err),
    );
  });

  it("returns and prices usage when AI fills an unrecognized header", async () => {
    const usage = {
      tokensIn: 120,
      tokensOut: 35,
      cacheReadTokens: 10,
      cacheCreationTokens: 0,
    };
    mocks.matchColumns.mockResolvedValue({
      assignments: [
        { header: "mystery passage", field: "text", confidence: "high", reason: "Contains prose" },
      ],
      usage,
    });

    const result = await resolveMapping("reader-1", ["mystery passage"], [
      { "mystery passage": "A sentence worth remembering." },
    ]);

    expect(result.mapping.text).toBe("mystery passage");
    expect(result.mappingUsage).toEqual({
      ...usage,
      model: "test-model",
      estimatedCostDollars: 0.00042,
    });
    expect(mocks.costDollars).toHaveBeenCalledWith(usage);
  });

  it("does not report usage or call the model when headers are already recognized", async () => {
    const result = await resolveMapping("reader-1", ["Highlight", "Title"], [
      { Highlight: "A sentence.", Title: "A book" },
    ]);

    expect(result.mappingUsage).toBeNull();
    expect(mocks.matchColumns).not.toHaveBeenCalled();
  });

  it("keeps imports usable and reports no cost estimate when AI matching fails", async () => {
    mocks.matchColumns.mockRejectedValue(new Error("provider unavailable"));

    const result = await resolveMapping("reader-1", ["mystery passage"], [
      { "mystery passage": "A sentence worth remembering." },
    ]);

    expect(result.aiError).toBe("provider unavailable");
    expect(result.mappingUsage).toBeNull();
  });
});
