"use server";

import { AuthError } from "next-auth";
import { prisma } from "@/lib/db";
import { signIn, signOut } from "@/auth";
import {
  hashPassword,
  isEmailShaped,
  normalizeEmail,
  passwordProblem,
} from "@/lib/accounts";

export type AuthState = { error?: string };

/**
 * Registration is one step: the account exists and is usable immediately.
 *
 * There is no address confirmation, so an email is a login and nothing more —
 * it is never checked that the person registering can receive mail there.
 */
export async function register(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const email = normalizeEmail(String(formData.get("email") ?? ""));
  const password = String(formData.get("password") ?? "");

  if (!isEmailShaped(email)) return { error: "Enter a valid email address." };

  const problem = passwordProblem(password);
  if (problem) return { error: problem };

  const existing = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  if (existing) {
    return { error: "That address already has an account. Sign in instead." };
  }

  await prisma.user.create({
    data: { email, passwordHash: await hashPassword(password) },
    select: { id: true },
  });

  // Straight into a session: the password is already in hand this request, so
  // making them retype it on /signin would buy nothing.
  return signInOrError(email, password);
}

export async function signInWithPassword(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const email = normalizeEmail(String(formData.get("email") ?? ""));
  const password = String(formData.get("password") ?? "");

  return signInOrError(email, password);
}

/**
 * `signIn` signals success by throwing a redirect, so only an AuthError is
 * ours to report — anything else has to keep travelling.
 */
async function signInOrError(email: string, password: string): Promise<AuthState> {
  try {
    await signIn("credentials", { email, password, redirectTo: "/" });
  } catch (err) {
    if (err instanceof AuthError) return { error: "That email and password do not match." };
    throw err;
  }

  return {};
}

export async function signOutAction(): Promise<void> {
  await signOut({ redirectTo: "/signin" });
}
