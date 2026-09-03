import type { Metadata } from "next";
import Link from "next/link";
import { Analytics } from "@vercel/analytics/next";
import { auth } from "@/auth";
import { signOutAction } from "@/actions/auth";
import "./globals.css";

export const metadata: Metadata = {
  title: "Book Highlights",
  description: "Personalized takeaways from the passages you saved.",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Drives the header only. Every query is scoped independently by
  // `currentUserId()`, so this is presentation, not access control.
  const session = await auth();
  const email = session?.user?.email ?? null;

  return (
    <html lang="en">
      <body>
        <div className="mx-auto flex min-h-dvh max-w-5xl flex-col px-4 sm:px-6">
          <header className="flex flex-wrap items-center justify-between gap-3 py-6">
            <Link href="/" className="text-lg font-medium tracking-tight">
              Book Highlights
            </Link>
            {email ? (
              <nav className="flex items-center gap-4 text-sm text-[var(--muted-foreground)]">
                <Link href="/import" className="hover:text-[var(--foreground)]">
                  Import
                </Link>
                <Link href="/books/new" className="hover:text-[var(--foreground)]">
                  Add a book
                </Link>
                <span className="hidden sm:inline" title={email}>
                  {email}
                </span>
                <form action={signOutAction}>
                  <button type="submit" className="hover:text-[var(--foreground)]">
                    Sign out
                  </button>
                </form>
              </nav>
            ) : null}
          </header>
          <main className="flex-1 pb-16">{children}</main>
          <footer className="border-t border-[var(--border)] py-6 text-xs text-[var(--muted-foreground)]">
            Takeaways come from your highlights. Chapter outlines come from the model&rsquo;s
            knowledge of the book.
          </footer>
        </div>
        <Analytics />
      </body>
    </html>
  );
}
