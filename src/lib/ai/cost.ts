import { getProvider, type Pricing, type Usage } from "./provider";

export function costDollars(usage: Usage, pricing: Pricing = getProvider().pricing): number {
  return (
    (usage.tokensIn * pricing.inputPerMTok +
      usage.tokensOut * pricing.outputPerMTok +
      usage.cacheReadTokens * pricing.cacheReadPerMTok +
      usage.cacheCreationTokens * pricing.cacheWritePerMTok) /
    1_000_000
  );
}

/** Integer cents, rounded up — a run always costs at least one cent on record. */
export function costCents(usage: Usage, pricing?: Pricing): number {
  return Math.ceil(costDollars(usage, pricing) * 100);
}
