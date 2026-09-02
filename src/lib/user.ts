import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { LOCAL_USER_ID } from "./auth-constants";

// Re-exported for callers already importing it from here. Scripts should take it
// from auth-constants directly — this module pulls in Auth.js.
export { LOCAL_USER_ID };

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
