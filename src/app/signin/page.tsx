import { SignInForm } from "@/components/auth-forms";

export const metadata = { title: "Sign in" };

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ verified?: string }>;
}) {
  const { verified } = await searchParams;

  return (
    <div className="mx-auto max-w-md space-y-6">
      <div>
        <h1 className="text-2xl font-medium tracking-tight">Sign in</h1>
        <p className="text-sm text-[var(--muted-foreground)]">
          Your highlights, and the takeaways drawn from them.
        </p>
      </div>

      <SignInForm verified={verified === "1"} />
    </div>
  );
}
