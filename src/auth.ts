import NextAuth from "next-auth";
import GitHub from "next-auth/providers/github";

/**
 * Single-user access control.
 *
 * SPEC §15 puts authentication out of scope for v1, and this does not walk that
 * back: the data model is still single-user and every query stays scoped by
 * `currentUserId()`, which still returns LOCAL_USER_ID. This exists only because
 * a public deployment lets anyone spend the project's model credits. It answers
 * "is this the owner?" — never "which user is this?".
 *
 * Sessions are JWT (no database adapter), which keeps the middleware gate
 * runnable on the edge.
 */

/** The one account allowed in. Compared case-insensitively. */
const ownerEmail = () => process.env.OWNER_EMAIL?.trim().toLowerCase() || null;

/**
 * Enforced in production only, so `npm run dev` needs no OAuth app and the unit
 * suite needs no session. Note that a local production build (`npm run build &&
 * npm start`) does enforce it, and will need the AUTH_* variables set.
 */
export const authEnforced = () => process.env.NODE_ENV === "production";

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [GitHub],
  callbacks: {
    /**
     * Fails closed. With OWNER_EMAIL unset nobody gets in — an accidentally
     * unconfigured deployment is locked, not wide open.
     */
    signIn({ profile }) {
      const owner = ownerEmail();
      if (!owner) return false;

      const email = profile?.email?.trim().toLowerCase();
      return Boolean(email) && email === owner;
    },

    /** Consulted by the middleware export in src/middleware.ts. */
    authorized({ auth: session }) {
      if (!authEnforced()) return true;

      return Boolean(session?.user);
    },
  },
});
