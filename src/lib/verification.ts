import { createHash, randomInt } from "node:crypto";
import { CODE_LENGTH } from "./auth-constants";

export { CODE_LENGTH };

/**
 * One-time email confirmation codes.
 *
 * The rules live here as pure functions so they can be tested without a database
 * or a mail vendor; the persistence around them is in src/actions/auth.ts.
 */

export const CODE_TTL_MS = 10 * 60 * 1000;

/** Wrong guesses allowed against one code before it is dead. */
export const MAX_ATTEMPTS = 5;

/** Minimum wait before a new code may be requested, so "resend" is not a mail cannon. */
export const RESEND_INTERVAL_MS = 60 * 1000;

/**
 * `randomInt` is the CSPRNG, not `Math.random` — a guessable confirmation code
 * is the same as no confirmation at all. Zero-padded, so every code is 6 digits.
 */
export function generateCode(): string {
  return String(randomInt(0, 10 ** CODE_LENGTH)).padStart(CODE_LENGTH, "0");
}

/** Only the hash is stored, so a leaked database hands over no live codes. */
export function hashCode(code: string): string {
  return createHash("sha256").update(code.trim()).digest("hex");
}

export function expiryFrom(now: Date = new Date()): Date {
  return new Date(now.getTime() + CODE_TTL_MS);
}

export type CodeRecord = {
  codeHash: string;
  expiresAt: Date;
  consumedAt: Date | null;
  attempts: number;
};

export type CodeVerdict = "ok" | "consumed" | "too-many-attempts" | "expired" | "mismatch";

/**
 * Checked in order of finality: a consumed or exhausted code is rejected before
 * its contents are even compared, so neither can be brute-forced by resubmitting.
 */
export function checkCode(
  record: CodeRecord,
  submitted: string,
  now: Date = new Date(),
): CodeVerdict {
  if (record.consumedAt) return "consumed";
  if (record.attempts >= MAX_ATTEMPTS) return "too-many-attempts";
  if (record.expiresAt.getTime() <= now.getTime()) return "expired";
  if (record.codeHash !== hashCode(submitted)) return "mismatch";

  return "ok";
}

/** Null when a new code may be sent, else how long the caller must wait. */
export function resendWaitMs(lastSentAt: Date | null, now: Date = new Date()): number | null {
  if (!lastSentAt) return null;

  const elapsed = now.getTime() - lastSentAt.getTime();
  return elapsed >= RESEND_INTERVAL_MS ? null : RESEND_INTERVAL_MS - elapsed;
}
