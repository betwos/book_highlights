import { matchColumns } from "@/lib/ai/columns";
import { getProvider } from "@/lib/ai/provider";
import { detectMapping, headerKey } from "./detect";
import {
  aliasMap,
  aliasesToRemember,
  applyAliases,
  mergeAiAssignments,
  unresolvedHeaders,
  type ResolvedMapping,
} from "./aliases";
import { loadAliases, rememberAliases } from "./alias-store";
import type { CsvRow } from "./parse";

/**
 * Provider-aware error text that still works when the provider itself cannot be
 * constructed (an unknown `AI_PROVIDER`), the same guard `runAnalysis` uses.
 */
function describeError(err: unknown): string {
  try {
    return getProvider().describeError(err);
  } catch {
    return err instanceof Error ? err.message : String(err);
  }
}

export type ResolveResult = ResolvedMapping & {
  /** Non-fatal: the model was unreachable, so only detection and memory applied. */
  aiError: string | null;
};

/**
 * Three passes, cheapest first (SPEC 8.3):
 *
 * 1. Header detection — free, deterministic, handles Readwise and Kindle exports.
 * 2. Remembered aliases — one row per header this reader has already resolved,
 *    so "quote" costs a model call exactly once, ever.
 * 3. One model call for whatever is left, whose answers are then remembered.
 *
 * The result is a starting point, not a decision: the import UI always renders
 * the mapping and lets the reader change any row of it.
 */
export async function resolveMapping(
  userId: string,
  headers: string[],
  rows: CsvRow[],
): Promise<ResolveResult> {
  const aliases = aliasMap(await loadAliases(userId, headers.map(headerKey)));
  const resolved = applyAliases(headers, detectMapping(headers), aliases);

  const unknown = unresolvedHeaders(headers, resolved, aliases);
  if (unknown.length === 0) return { ...resolved, aiError: null };

  let assignments;
  try {
    ({ assignments } = await matchColumns(unknown, rows));
  } catch (err) {
    // An import must still be possible with the API down — the reader maps by hand.
    return { ...resolved, aiError: describeError(err) };
  }

  const merged = mergeAiAssignments(resolved, assignments);

  // Remember what the model decided, including its "not a field I know" answers:
  // both spare the next import the same call.
  await rememberAliases(userId, aliasesToRemember(unknown, merged.mapping, "llm")).catch(
    () => undefined,
  );

  return { ...merged, aiError: null };
}
