"use client";

import { useActionState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/primitives";
import { Field, Input } from "@/components/ui/field";
import {
  register,
  resendCode,
  signInWithPassword,
  verifyEmail,
  type AuthState,
} from "@/actions/auth";
// Constants only — importing from accounts.ts or verification.ts would drag
// bcrypt and node:crypto into the client bundle.
import { CODE_LENGTH, MIN_PASSWORD_LENGTH } from "@/lib/auth-constants";

const EMPTY: AuthState = {};

function Message({ state }: { state: AuthState }) {
  if (state.error) return <p className="text-sm text-[var(--danger)]">{state.error}</p>;
  if (state.notice) return <p className="text-sm text-[var(--muted-foreground)]">{state.notice}</p>;
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

export function SignInForm({ verified }: { verified: boolean }) {
  const [state, action, pending] = useActionState(signInWithPassword, EMPTY);

  return (
    <Card className="space-y-4 p-5">
      {verified ? (
        <p className="text-sm text-[var(--muted-foreground)]">
          Your email is confirmed. Sign in to continue.
        </p>
      ) : null}

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

export function VerifyForm({ email }: { email: string }) {
  const [state, action, pending] = useActionState(verifyEmail, EMPTY);
  const [resendState, resend, resending] = useActionState(resendCode, EMPTY);

  return (
    <Card className="space-y-4 p-5">
      <p className="text-sm text-[var(--muted-foreground)]">
        We sent a {CODE_LENGTH}-digit code to{" "}
        <span className="font-medium text-[var(--foreground)]">{email || "your address"}</span>. It
        can be used once and expires shortly.
      </p>

      <form action={action} className="space-y-4">
        <input type="hidden" name="email" value={email} />

        <Field label="Confirmation code" htmlFor="code">
          <Input
            id="code"
            name="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern={`\\d{${CODE_LENGTH}}`}
            maxLength={CODE_LENGTH}
            placeholder={"0".repeat(CODE_LENGTH)}
            required
          />
        </Field>

        <Message state={state} />

        <Button type="submit" disabled={pending}>
          {pending ? "Checking…" : "Confirm email"}
        </Button>
      </form>

      <form action={resend} className="space-y-2 border-t border-[var(--border)] pt-4">
        <input type="hidden" name="email" value={email} />
        <Message state={resendState} />
        <Button type="submit" variant="ghost" disabled={resending}>
          {resending ? "Sending…" : "Send a new code"}
        </Button>
      </form>
    </Card>
  );
}
