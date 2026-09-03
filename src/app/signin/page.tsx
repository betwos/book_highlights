import { SignInForm } from "@/components/auth-forms";

export const metadata = { title: "Sign in" };

export default function SignInPage() {
  return (
    <div className="mx-auto max-w-md space-y-6">
      <div>
        <h1 className="text-2xl font-medium tracking-tight">Sign in</h1>
        <p className="text-sm text-[var(--muted-foreground)]">
          Your highlights, and the takeaways drawn from them.
        </p>
      </div>

      <SignInForm />
    </div>
  );
}
