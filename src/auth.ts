import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import { authConfig } from "@/auth.config";
import { normalizeEmail } from "@/lib/accounts";

/**
 * Email-and-password accounts, each with its own private library.
 *
 * An address must be confirmed before it can sign in: `authorize` refuses while
 * `emailVerified` is null. It returns null rather than throwing so the caller —
 * the sign-in action — can look up why and send an unconfirmed account to
 * /verify instead of showing "wrong password".
 */
export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  session: { strategy: "jwt" },
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },

      async authorize(credentials) {
        const email = normalizeEmail(String(credentials?.email ?? ""));
        const password = String(credentials?.password ?? "");
        if (!email || !password) return null;

        const user = await prisma.user.findUnique({
          where: { email },
          select: { id: true, email: true, passwordHash: true, emailVerified: true },
        });
        if (!user) return null;

        const ok = await bcrypt.compare(password, user.passwordHash);
        if (!ok) return null;

        // Correct password, unconfirmed address: still not a session.
        if (!user.emailVerified) return null;

        return { id: user.id, email: user.email };
      },
    }),
  ],
});
