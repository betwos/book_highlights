import { NextResponse } from "next/server";
import { auth, authEnforced } from "@/auth";

/**
 * Single-user v1 (SPEC 4.10). Every query is written scoped by this value so that
 * adding auth later is a change of this function body, not a migration plus an
 * audit of every query.
 *
 * Authentication (src/auth.ts) deliberately did NOT change this: it gates who may
 * reach the app rather than partitioning data, so rows keep `userId: "local"` and
 * this stays synchronous.
 */
export const LOCAL_USER_ID = "local";

export function currentUserId(): string {
  return LOCAL_USER_ID;
}

/**
 * Defence in depth behind the middleware gate, for route handlers.
 * Returns a 401 response when there is no session, or null to continue.
 */
export async function unauthorized(): Promise<NextResponse | null> {
  if (!authEnforced()) return null;

  const session = await auth();
  if (session?.user) return null;

  return NextResponse.json({ error: "Not signed in." }, { status: 401 });
}

/** The same check for Server Actions, where throwing is the idiomatic refusal. */
export async function requireSession() {
  if (!authEnforced()) return null;

  const session = await auth();
  if (!session?.user) throw new Error("Not signed in.");

  return session;
}
