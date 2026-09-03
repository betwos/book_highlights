import type { NextAuthConfig } from "next-auth";

/**
 * The edge-safe half of the auth config.
 *
 * `src/middleware.ts` runs on the edge runtime, where bcrypt and the Prisma
 * client cannot go. So the provider list — which needs both to check a password —
 * lives in `src/auth.ts` instead, and only this half is what the middleware
 * imports. Splitting them is the documented Auth.js v5 pattern for credentials.
 */

/** Reachable without a session. Everything else needs one. */
const PUBLIC_PREFIXES = ["/signin", "/signup"];

export const authConfig = {
  pages: { signIn: "/signin" },

  // Real providers are attached in src/auth.ts.
  providers: [],

  callbacks: {
    authorized({ auth: session, request }) {
      const { pathname } = request.nextUrl;
      if (PUBLIC_PREFIXES.some((prefix) => pathname.startsWith(prefix))) return true;

      return Boolean(session?.user);
    },

    /** Carry the database id on the token; it is what scopes every query. */
    jwt({ token, user }) {
      if (user?.id) token.sub = user.id;
      return token;
    },

    session({ session, token }) {
      if (token.sub) session.user.id = token.sub;
      return session;
    },
  },
} satisfies NextAuthConfig;
