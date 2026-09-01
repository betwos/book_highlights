"use client";

import { useRef, useState, type DragEvent } from "react";
import { Button } from "@/components/ui/button";

export function Dropzone({
  onFile,
  busy,
  error,
}: {
  onFile: (file: File) => void;
  busy: boolean;
  error: string | null;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  function handleDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) onFile(file);
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
        <p className="text-sm font-medium">Drop a Readwise or CSV export here</p>
        <p className="max-w-prose text-sm text-[var(--muted-foreground)]">
          One file can hold your whole library — you choose per book what happens next. Re-importing
          a file you already imported adds nothing.
        </p>
        <Button type="button" disabled={busy} onClick={() => inputRef.current?.click()}>
          {busy ? "Reading…" : "Choose a CSV"}
        </Button>
        <input
          ref={inputRef}
          type="file"
          accept=".csv,text/csv"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) onFile(file);
            e.target.value = "";
          }}
        />
      </div>

      {error ? <p className="text-sm text-[var(--danger)]">{error}</p> : null}
    </div>
  );
}
