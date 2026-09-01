import type { Usage } from "./client";

/** claude-opus-5 list pricing, US dollars per million tokens. */
export const INPUT_PER_MTOK = 5.0;
export const OUTPUT_PER_MTOK = 25.0;
/** Cached reads bill at ~0.1x input; cache writes at ~1.25x. */
export const CACHE_READ_PER_MTOK = INPUT_PER_MTOK * 0.1;
export const CACHE_WRITE_PER_MTOK = INPUT_PER_MTOK * 1.25;

export function costDollars(usage: Usage): number {
  return (
    (usage.tokensIn * INPUT_PER_MTOK +
      usage.tokensOut * OUTPUT_PER_MTOK +
      usage.cacheReadTokens * CACHE_READ_PER_MTOK +
      usage.cacheCreationTokens * CACHE_WRITE_PER_MTOK) /
    1_000_000
  );
}

/** Integer cents, rounded up — a run always costs at least one cent on record. */
export function costCents(usage: Usage): number {
  return Math.ceil(costDollars(usage) * 100);
}
