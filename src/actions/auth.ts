"use server";

import { redirect } from "next/navigation";
import { AuthError } from "next-auth";
import { prisma } from "@/lib/db";
import { signIn, signOut } from "@/auth";
import {
  hashPassword,
  isEmailShaped,
  normalizeEmail,
  passwordProblem,
} from "@/lib/accounts";
import {
  checkCode,
  expiryFrom,
  generateCode,
  hashCode,
  resendWaitMs,
} from "@/lib/verification";
import { sendVerificationCode } from "@/lib/email";

export type AuthState = { error?: string; notice?: string };

/** Issues a fresh code, stores only its hash, and mails it. */
async function issueCode(userId: string, email: string): Promise<void> {
  const code = generateCode();

  await prisma.verificationCode.create({
    data: { userId, codeHash: hashCode(code), expiresAt: expiryFrom() },
  });

  await sendVerificationCode(email, code);
}

export async function register(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const email = normalizeEmail(String(formData.get("email") ?? ""));
  const password = String(formData.get("password") ?? "");

  if (!isEmailShaped(email)) return { error: "Enter a valid email address." };

  const problem = passwordProblem(password);
  if (problem) return { error: problem };

  const existing = await prisma.user.findUnique({
    where: { email },
    select: { id: true, emailVerified: true },
  });

  if (existing?.emailVerified) {
    return { error: "That address already has an account. Sign in instead." };
  }

  if (existing) {
    // Registered but never confirmed. Let them continue rather than stranding
    // the address: reset the password to the one just given, and send a code.
    await prisma.user.update({
      where: { id: existing.id },
      data: { passwordHash: await hashPassword(password) },
    });
    await issueCode(existing.id, email);
  } else {
    const user = await prisma.user.create({
      data: { email, passwordHash: await hashPassword(password) },
      select: { id: true },
    });
    await issueCode(user.id, email);
  }

  redirect(`/verify?email=${encodeURIComponent(email)}`);
}

export async function verifyEmail(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const email = normalizeEmail(String(formData.get("email") ?? ""));
  const submitted = String(formData.get("code") ?? "").trim();

  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, emailVerified: true },
  });
  if (!user) return { error: "No account for that address." };
  if (user.emailVerified) redirect("/signin?verified=1");

  const record = await prisma.verificationCode.findFirst({
    where: { userId: user.id, consumedAt: null },
    orderBy: { createdAt: "desc" },
  });
  if (!record) return { error: "That code has expired. Request a new one." };

  const verdict = checkCode(record, submitted);

  if (verdict !== "ok") {
    // Count the miss, so a wrong code cannot be guessed indefinitely.
    if (verdict === "mismatch") {
      await prisma.verificationCode.update({
        where: { id: record.id },
        data: { attempts: { increment: 1 } },
      });
    }

    const message: Record<typeof verdict, string> = {
      mismatch: "That code is not right.",
      expired: "That code has expired. Request a new one.",
      consumed: "That code has already been used.",
      "too-many-attempts": "Too many wrong attempts. Request a new code.",
    };
    return { error: message[verdict] };
  }

  await prisma.$transaction([
    prisma.verificationCode.update({
      where: { id: record.id },
      data: { consumedAt: new Date() },
    }),
    prisma.user.update({
      where: { id: user.id },
      data: { emailVerified: new Date() },
    }),
  ]);

  // Sign-in is a separate step: the password is not in this form, and asking for
  // it once more is a small price for not holding it across two requests.
  redirect("/signin?verified=1");
}

export async function resendCode(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const email = normalizeEmail(String(formData.get("email") ?? ""));

  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, emailVerified: true },
  });
  if (!user) return { error: "No account for that address." };
  if (user.emailVerified) redirect("/signin?verified=1");

  const last = await prisma.verificationCode.findFirst({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true },
  });

  const wait = resendWaitMs(last?.createdAt ?? null);
  if (wait !== null) {
    return { error: `Wait ${Math.ceil(wait / 1000)} more seconds before requesting another code.` };
  }

  await issueCode(user.id, email);
  return { notice: "A new code is on its way." };
}

export async function signInWithPassword(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const email = normalizeEmail(String(formData.get("email") ?? ""));
  const password = String(formData.get("password") ?? "");

  // An unconfirmed address fails `authorize` exactly like a bad password, so
  // check first — "confirm your email" beats a misleading "wrong password".
  const user = await prisma.user.findUnique({
    where: { email },
    select: { emailVerified: true },
  });
  if (user && !user.emailVerified) {
    redirect(`/verify?email=${encodeURIComponent(email)}`);
  }

  try {
    await signIn("credentials", { email, password, redirectTo: "/" });
  } catch (err) {
    // signIn signals success by throwing a redirect; only auth failures are ours.
    if (err instanceof AuthError) return { error: "That email and password do not match." };
    throw err;
  }

  return {};
}

export async function signOutAction(): Promise<void> {
  await signOut({ redirectTo: "/signin" });
}
