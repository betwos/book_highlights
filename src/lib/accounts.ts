import bcrypt from "bcryptjs";
import { MIN_PASSWORD_LENGTH } from "./auth-constants";

export { MIN_PASSWORD_LENGTH };

/**
 * Account rules, kept out of the auth config so they can be unit tested without
 * standing up Auth.js or a database.
 */

/** Cost factor. High enough to be slow for an attacker, fast enough for a login. */
const BCRYPT_ROUNDS = 12;

/** Addresses are stored and compared in this form, so casing never splits an account. */
export function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

/**
 * Deliberately loose. Real validation is the confirmation code — an address that
 * cannot receive mail never becomes an account, whatever its shape. This only
 * catches the obvious typo before we bother sending.
 */
export function isEmailShaped(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/** Returns the reason a password is unacceptable, or null when it is fine. */
export function passwordProblem(password: string): string | null {
  if (password.length < MIN_PASSWORD_LENGTH) {
    return `Use at least ${MIN_PASSWORD_LENGTH} characters.`;
  }
  if (!/[a-zA-Z]/.test(password) || !/[0-9]/.test(password)) {
    return "Use at least one letter and one number.";
  }

  return null;
}

export function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_ROUNDS);
}

export function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}
