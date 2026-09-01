"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/field";
import type { ActionState } from "@/actions/books";

export type BookValues = {
  title?: string | null;
  subtitle?: string | null;
  author?: string | null;
  isbn?: string | null;
  publisher?: string | null;
  publishedYear?: number | null;
  pageCount?: number | null;
  notes?: string | null;
};

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Saving…" : label}
    </Button>
  );
}

/** Shared by /books/new and /books/[id]/edit — same Zod schema as the action. */
export function MetadataForm({
  action,
  values,
  submitLabel,
  cancelHref,
}: {
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  values?: BookValues;
  submitLabel: string;
  cancelHref: string;
}) {
  const [state, formAction] = useActionState<ActionState, FormData>(action, {});
  const errors = state.fieldErrors ?? {};

  return (
    <form action={formAction} className="space-y-4">
      <Field label="Title" htmlFor="title" errors={errors.title}>
        <Input id="title" name="title" defaultValue={values?.title ?? ""} required />
      </Field>

      <Field label="Subtitle" htmlFor="subtitle" errors={errors.subtitle}>
        <Input id="subtitle" name="subtitle" defaultValue={values?.subtitle ?? ""} />
      </Field>

      <Field label="Author" htmlFor="author" errors={errors.author}>
        <Input id="author" name="author" defaultValue={values?.author ?? ""} required />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Publisher" htmlFor="publisher" errors={errors.publisher}>
          <Input id="publisher" name="publisher" defaultValue={values?.publisher ?? ""} />
        </Field>
        <Field label="ISBN" htmlFor="isbn" errors={errors.isbn}>
          <Input id="isbn" name="isbn" defaultValue={values?.isbn ?? ""} />
        </Field>
        <Field
          label="Published year"
          htmlFor="publishedYear"
          errors={errors.publishedYear}
          hint="Helps the model identify the right edition."
        >
          <Input
            id="publishedYear"
            name="publishedYear"
            inputMode="numeric"
            defaultValue={values?.publishedYear ?? ""}
          />
        </Field>
        <Field label="Page count" htmlFor="pageCount" errors={errors.pageCount}>
          <Input
            id="pageCount"
            name="pageCount"
            inputMode="numeric"
            defaultValue={values?.pageCount ?? ""}
          />
        </Field>
      </div>

      <Field label="Notes" htmlFor="notes" errors={errors.notes}>
        <Textarea id="notes" name="notes" defaultValue={values?.notes ?? ""} rows={3} />
      </Field>

      {state.error ? <p className="text-sm text-[var(--danger)]">{state.error}</p> : null}

      <div className="flex items-center gap-2">
        <SubmitButton label={submitLabel} />
        <Button asChild variant="ghost">
          <Link href={cancelHref}>Cancel</Link>
        </Button>
      </div>
    </form>
  );
}
