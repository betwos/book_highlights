"use client";

import { useActionState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/primitives";
import { Field, Input } from "@/components/ui/field";
import { register, signInWithPassword, type AuthState } from "@/actions/auth";
// Constants only — importing from accounts.ts would drag bcrypt into the
// client bundle.
import { MIN_PASSWORD_LENGTH } from "@/lib/auth-constants";

const EMPTY: AuthState = {};

function Message({ state }: { state: AuthState }) {
  if (state.error) return <p className="text-sm text-[var(--danger)]">{state.error}</p>;
  return null;
}

export function SignUpForm() {
  const [state, action, pending] = useActionState(register, EMPTY);

  return (
    <Card className="space-y-4 p-5">
      <form action={action} className="space-y-4">
        <Field label="Email" htmlFor="email">
          <Input id="email" name="email" type="email" autoComplete="email" required />
        </Field>

        <Field
          label="Password"
          htmlFor="password"
          hint={`At least ${MIN_PASSWORD_LENGTH} characters, with a letter and a number.`}
        >
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete="new-password"
            required
          />
        </Field>

        <Message state={state} />

        <Button type="submit" disabled={pending}>
          {pending ? "Creating…" : "Create account"}
        </Button>
      </form>

      <p className="text-sm text-[var(--muted-foreground)]">
        Already have an account?{" "}
        <Link href="/signin" className="text-[var(--accent)] underline underline-offset-4">
          Sign in
        </Link>
      </p>
    </Card>
  );
}

export function SignInForm() {
  const [state, action, pending] = useActionState(signInWithPassword, EMPTY);

  return (
    <Card className="space-y-4 p-5">
      <form action={action} className="space-y-4">
        <Field label="Email" htmlFor="email">
          <Input id="email" name="email" type="email" autoComplete="email" required />
        </Field>

        <Field label="Password" htmlFor="password">
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
          />
        </Field>

        <Message state={state} />

        <Button type="submit" disabled={pending}>
          {pending ? "Signing in…" : "Sign in"}
        </Button>
      </form>

      <p className="text-sm text-[var(--muted-foreground)]">
        No account yet?{" "}
        <Link href="/signup" className="text-[var(--accent)] underline underline-offset-4">
          Create one
        </Link>
      </p>
    </Card>
  );
}
