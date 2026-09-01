import * as React from "react";
import { cn } from "@/lib/utils";

const control =
  "flex w-full rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm placeholder:text-[var(--muted-foreground)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-50";

export const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, ...props }, ref) => (
    <input ref={ref} className={cn(control, "h-9", className)} {...props} />
  ),
);
Input.displayName = "Input";

export const Textarea = React.forwardRef<HTMLTextAreaElement, React.ComponentProps<"textarea">>(
  ({ className, ...props }, ref) => (
    <textarea ref={ref} className={cn(control, "min-h-20 resize-y", className)} {...props} />
  ),
);
Textarea.displayName = "Textarea";

export function Label({ className, ...props }: React.ComponentProps<"label">) {
  return (
    <label
      className={cn("text-sm font-medium text-[var(--foreground)]", className)}
      {...props}
    />
  );
}

export function FieldError({ messages }: { messages?: string[] }) {
  if (!messages?.length) return null;
  return <p className="text-xs text-[var(--danger)]">{messages[0]}</p>;
}

export function Field({
  label,
  htmlFor,
  errors,
  hint,
  children,
}: {
  label: string;
  htmlFor: string;
  errors?: string[];
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {hint ? <p className="text-xs text-[var(--muted-foreground)]">{hint}</p> : null}
      <FieldError messages={errors} />
    </div>
  );
}
