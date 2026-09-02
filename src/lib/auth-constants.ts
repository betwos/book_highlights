/**
 * The handful of auth values the browser also needs — for input length, pattern,
 * and hint text.
 *
 * They live apart from verification.ts and accounts.ts because those import
 * `node:crypto` and bcrypt: pulling either into a client component breaks the
 * build outright. Nothing here may import anything Node-only.
 */

export const CODE_LENGTH = 6;

export const MIN_PASSWORD_LENGTH = 10;
