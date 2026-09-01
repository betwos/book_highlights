"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/primitives";
import { Dropzone } from "@/components/import/dropzone";
import { ColumnMapper } from "@/components/import/column-mapper";
import { GroupReview, type GroupDecision, type PreviewGroup } from "@/components/import/group-review";
import { emptyMapping, type Mapping } from "@/lib/csv/detect";
import { plural } from "@/lib/utils";

type Preview = {
  importBatchId: string;
  filename: string;
  rowCount: number;
  headers: string[];
  mapping: Mapping;
  groups: PreviewGroup[];
};

type CommitResult = {
  books: { bookId: string; title: string; imported: number; skipped: number }[];
  totals: { imported: number; skipped: number };
};

export default function ImportPage() {
  const [preview, setPreview] = useState<Preview | null>(null);
  const [mapping, setMapping] = useState<Mapping>(emptyMapping());
  const [decisions, setDecisions] = useState<Record<string, GroupDecision>>({});
  const [result, setResult] = useState<CommitResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function upload(file: File) {
    setBusy(true);
    setError(null);
    setResult(null);

    try {
      const body = new FormData();
      body.append("file", file);
      const res = await fetch("/api/imports/preview", { method: "POST", body });
      const json = await res.json();

      if (!res.ok) {
        setError(json.error ?? "That file could not be read.");
        return;
      }

      setPreview(json);
      setMapping(json.mapping);
      setDecisions(
        Object.fromEntries(
          (json.groups as PreviewGroup[]).map((g): [string, GroupDecision] => [
            g.key,
            g.matchedBookId
              ? { action: "merge", bookId: g.matchedBookId }
              : { action: "new", title: g.title, author: g.author },
          ]),
        ),
      );
    } catch {
      setError("Upload failed.");
    } finally {
      setBusy(false);
    }
  }

  async function commit() {
    if (!preview) return;
    setBusy(true);
    setError(null);

    try {
      const res = await fetch(`/api/imports/${preview.importBatchId}/commit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mapping,
          groups: preview.groups.map((g) => {
            const d = decisions[g.key] ?? { action: "skip" as const };
            if (d.action === "new") {
              return { key: g.key, action: "new", book: { title: d.title, author: d.author } };
            }
            if (d.action === "merge") return { key: g.key, action: "merge", bookId: d.bookId };
            return { key: g.key, action: "skip" };
          }),
        }),
      });
      const json = await res.json();

      if (!res.ok) {
        setError(json.error ?? "The import could not be committed.");
        return;
      }

      setResult(json);
      setPreview(null);
    } catch {
      setError("The import could not be committed.");
    } finally {
      setBusy(false);
    }
  }

  const readyToCommit =
    Boolean(preview) &&
    Boolean(mapping.text) &&
    Object.values(decisions).some((d) => d.action !== "skip");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-medium tracking-tight">Import highlights</h1>
        <p className="text-sm text-[var(--muted-foreground)]">
          CSV or Readwise export. Duplicate highlights are skipped automatically.
        </p>
      </div>

      {result ? (
        <div className="space-y-4">
          <Card className="space-y-3 p-5">
            <h2 className="font-medium">
              Imported {plural(result.totals.imported, "highlight")}
              {result.totals.skipped > 0
                ? `, skipped ${result.totals.skipped} already in your library`
                : ""}
              .
            </h2>
            <ul className="space-y-2 text-sm">
              {result.books.map((b) => (
                <li key={b.bookId} className="flex flex-wrap items-center justify-between gap-2">
                  <Link
                    href={`/books/${b.bookId}`}
                    className="text-[var(--accent)] underline underline-offset-4"
                  >
                    {b.title}
                  </Link>
                  <span className="text-[var(--muted-foreground)]">
                    {b.imported} imported · {b.skipped} skipped
                  </span>
                </li>
              ))}
            </ul>
          </Card>

          <div className="flex gap-2">
            <Button asChild>
              <Link href="/">Back to the library</Link>
            </Button>
            <Button variant="outline" onClick={() => setResult(null)}>
              Import another file
            </Button>
          </div>
        </div>
      ) : !preview ? (
        <Dropzone onFile={upload} busy={busy} error={error} />
      ) : (
        <div className="space-y-5">
          <p className="text-sm text-[var(--muted-foreground)]">
            <span className="font-medium text-[var(--foreground)]">{preview.filename}</span> —{" "}
            {plural(preview.rowCount, "row")}
          </p>

          <ColumnMapper headers={preview.headers} mapping={mapping} onChange={setMapping} />

          <GroupReview
            groups={preview.groups}
            decisions={decisions}
            onChange={(key, decision) => setDecisions((prev) => ({ ...prev, [key]: decision }))}
          />

          {error ? <p className="text-sm text-[var(--danger)]">{error}</p> : null}

          <div className="flex flex-wrap gap-2">
            <Button onClick={commit} disabled={!readyToCommit || busy}>
              {busy ? "Importing…" : "Import"}
            </Button>
            <Button
              variant="ghost"
              onClick={() => {
                setPreview(null);
                setError(null);
              }}
            >
              Start over
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
