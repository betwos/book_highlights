/**
 * Auth values that callers outside the server runtime need.
 *
 * **Nothing here may import anything.** Two kinds of caller depend on that:
 * client components, which cannot take `node:crypto` (verification.ts) or
 * bcrypt (accounts.ts) into the browser bundle; and standalone `tsx` scripts,
 * which would otherwise boot Auth.js and Next just to read a constant.
 */

export const CODE_LENGTH = 6;

export const MIN_PASSWORD_LENGTH = 10;

/**
 * The owner id of rows created before accounts existed (SPEC 4.10's single-user
 * default). Nobody signs in as it — it survives so the seed and
 * scripts/claim-library.ts can still address that data.
 */
export const LOCAL_USER_ID = "local";
