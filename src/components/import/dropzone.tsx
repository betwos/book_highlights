"use client";

import { useRef, useState, type DragEvent } from "react";
import { Button } from "@/components/ui/button";

export function Dropzone({
  onFiles,
  busy,
  error,
}: {
  onFiles: (files: File[]) => void;
  busy: boolean;
  error: string | null;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  function handleDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragging(false);
    const files = Array.from(e.dataTransfer.files ?? []);
    if (files.length > 0) onFiles(files);
  }

  return (
    <div className="space-y-2">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        className={`flex flex-col items-center gap-3 rounded-[var(--radius)] border border-dashed px-6 py-14 text-center transition-colors ${
          dragging ? "border-[var(--accent)] bg-[var(--accent-soft)]" : "border-[var(--border)]"
        }`}
      >
        <p className="text-sm font-medium">Drop your Readwise or CSV exports here</p>
        <p className="max-w-prose text-sm text-[var(--muted-foreground)]">
          Drop as many files as you like. Each one can hold a whole library — you choose per book
          what happens next, and you are only asked about files whose columns aren&rsquo;t already
          settled. Re-importing a file you already imported adds nothing.
        </p>
        <Button type="button" disabled={busy} onClick={() => inputRef.current?.click()}>
          {busy ? "Reading…" : "Choose CSV files"}
        </Button>
        <input
          ref={inputRef}
          type="file"
          accept=".csv,text/csv"
          multiple
          className="hidden"
          onChange={(e) => {
            const files = Array.from(e.target.files ?? []);
            if (files.length > 0) onFiles(files);
            e.target.value = "";
          }}
        />
      </div>

      {error ? <p className="text-sm text-[var(--danger)]">{error}</p> : null}
    </div>
  );
}
