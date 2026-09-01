"use client";

import { useRef, useState, type DragEvent } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

const MAX_BYTES = 5 * 1024 * 1024;
const ACCEPTED = ["image/jpeg", "image/png", "image/webp"];

export function CoverUploader({
  bookId,
  coverUrl,
}: {
  bookId: string;
  coverUrl: string | null;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(coverUrl);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);

  async function upload(file: File) {
    setError(null);

    if (!ACCEPTED.includes(file.type)) {
      setError("Use a JPEG, PNG, or WebP image.");
      return;
    }
    if (file.size > MAX_BYTES) {
      setError("Cover images must be under 5 MB.");
      return;
    }

    const localPreview = URL.createObjectURL(file);
    setPreview(localPreview);
    setBusy(true);

    try {
      const body = new FormData();
      body.append("file", file);
      const res = await fetch(`/api/books/${bookId}/cover`, { method: "POST", body });
      const json = await res.json();

      if (!res.ok) {
        setError(json.error ?? "Upload failed.");
        setPreview(coverUrl);
        return;
      }

      setPreview(json.coverUrl);
      router.refresh();
    } catch {
      setError("Upload failed.");
      setPreview(coverUrl);
    } finally {
      setBusy(false);
      URL.revokeObjectURL(localPreview);
    }
  }

  function onDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) void upload(file);
  }

  return (
    <div className="space-y-2">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={`flex flex-col items-center gap-3 rounded-[var(--radius)] border border-dashed p-4 text-center transition-colors ${
          dragging ? "border-[var(--accent)] bg-[var(--accent-soft)]" : "border-[var(--border)]"
        }`}
      >
        <div className="h-40 w-28 overflow-hidden rounded-md bg-[var(--surface-muted)]">
          {preview ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={preview} alt="Cover preview" className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-xs text-[var(--muted-foreground)]">
              No cover
            </div>
          )}
        </div>

        <p className="text-xs text-[var(--muted-foreground)]">
          Drop an image here, or choose one. Resized to 600px WebP.
        </p>

        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={busy}
          onClick={() => inputRef.current?.click()}
        >
          {busy ? "Uploading…" : preview ? "Replace cover" : "Choose image"}
        </Button>

        <input
          ref={inputRef}
          type="file"
          accept={ACCEPTED.join(",")}
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void upload(file);
            e.target.value = "";
          }}
        />
      </div>

      {error ? <p className="text-xs text-[var(--danger)]">{error}</p> : null}
    </div>
  );
}
