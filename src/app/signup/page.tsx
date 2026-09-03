import { SignUpForm } from "@/components/auth-forms";

export const metadata = { title: "Create an account" };

export default function SignUpPage() {
  return (
    <div className="mx-auto max-w-md space-y-6">
      <div>
        <h1 className="text-2xl font-medium tracking-tight">Create an account</h1>
        <p className="text-sm text-[var(--muted-foreground)]">
          Your library is your own — the books and highlights you import are visible only to you.
        </p>
      </div>

      <SignUpForm />
    </div>
  );
}
