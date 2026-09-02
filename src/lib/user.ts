import { NextResponse } from "next/server";
import { auth } from "@/auth";

/**
 * The owner id of rows created before accounts existed (SPEC 4.10's single-user
 * default). Nobody signs in as it — it survives only so the seed and
 * scripts/claim-library.ts can still address that data.
 */
export const LOCAL_USER_ID = "local";

/**
 * The signed-in reader's id. Every query scopes by this, and that scoping is the
 * whole of the privacy model.
 *
 * Throws rather than falling back to a default: a query that quietly ran
 * unscoped would serve one account another account's library, and a thrown
 * error is a far better failure than that.
 */
export async function currentUserId(): Promise<string> {
  const session = await auth();
  const id = session?.user?.id;
  if (!id) throw new Error("Not signed in.");

  return id;
}

/**
 * Defence in depth behind the middleware gate, for route handlers.
 * Returns a 401 response when there is no session, or null to continue —
 * so an expired session reads as 401 rather than a 500 from `currentUserId`.
 */
export async function unauthorized(): Promise<NextResponse | null> {
  const session = await auth();
  if (session?.user?.id) return null;

  return NextResponse.json({ error: "Not signed in." }, { status: 401 });
}

/** The same check for Server Actions, where throwing is the idiomatic refusal. */
export async function requireSession() {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Not signed in.");

  return session;
}
