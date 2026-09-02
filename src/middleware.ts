import NextAuth from "next-auth";
import { authConfig } from "@/auth.config";

/**
 * The access gate. Uses the edge-safe half of the config only — pulling in
 * src/auth.ts would drag bcrypt and Prisma into the edge bundle.
 *
 * Not the only check: the route handlers and server actions that read or write
 * a library resolve the session again through `currentUserId()`, so a bypass
 * here cannot reach another account's data.
 */
export const { auth: middleware } = NextAuth(authConfig);

export const config = {
  matcher: ["/((?!api/auth|_next/static|_next/image|favicon.ico|uploads).*)"],
};
