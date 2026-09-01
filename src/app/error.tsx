"use client";

import { Button } from "@/components/ui/button";

export default function Error({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <div className="space-y-4 py-16 text-center">
      <h1 className="text-xl font-medium">Something went wrong</h1>
      <p className="mx-auto max-w-prose text-sm text-[var(--muted-foreground)]">
        {error.message || "An unexpected error occurred."}
      </p>
      <Button onClick={reset}>Try again</Button>
    </div>
  );
}
