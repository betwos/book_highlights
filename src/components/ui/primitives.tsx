import * as React from "react";
import { cn } from "@/lib/utils";

export function Card({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)]",
        className,
      )}
      {...props}
    />
  );
}

export function Badge({
  className,
  tone = "muted",
  ...props
}: React.ComponentProps<"span"> & { tone?: "muted" | "accent" | "warn" | "danger" }) {
  const tones = {
    muted: "bg-[var(--surface-muted)] text-[var(--muted-foreground)]",
    accent: "bg-[var(--accent-soft)] text-[var(--accent)]",
    warn: "bg-[var(--accent-soft)] text-[var(--accent)] border border-[var(--accent)]",
    danger: "bg-[var(--danger)]/10 text-[var(--danger)]",
  } as const;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium",
        tones[tone],
        className,
      )}
      {...props}
    />
  );
}

export function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn("animate-pulse rounded-[var(--radius)] bg-[var(--surface-muted)]", className)}
      {...props}
    />
  );
}

export function EmptyState({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-[var(--radius)] border border-dashed border-[var(--border)] px-6 py-14 text-center">
      <h2 className="text-base font-medium">{title}</h2>
      {description ? (
        <p className="max-w-prose text-sm text-[var(--muted-foreground)]">{description}</p>
      ) : null}
      {children ? <div className="mt-2 flex flex-wrap justify-center gap-2">{children}</div> : null}
    </div>
  );
}
