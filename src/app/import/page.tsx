"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, Badge } from "@/components/ui/primitives";
import { Dropzone } from "@/components/import/dropzone";
import { ColumnMapper } from "@/components/import/column-mapper";
import { FileSwitcher, type SwitcherFile } from "@/components/import/file-switcher";
import { GroupReview, type GroupDecision, type PreviewGroup } from "@/components/import/group-review";
import { isMappingValid, unassignedHeaders, type Mapping } from "@/lib/csv/detect";
import type { MappingSources } from "@/lib/csv/aliases";
import { plural } from "@/lib/utils";

type PreviewResponse = {
  importBatchId: string;
  filename: string;
  rowCount: number;
  headers: string[];
  mapping: Mapping;
  mappingSources?: MappingSources;
  ignoredHeaders?: string[];
  aiError?: string | null;
  groups: PreviewGroup[];
};

type ImportFile =
  | { id: string; filename: string; state: "loading" }
  | { id: string; filename: string; state: "failed"; error: string }
  | {
      id: string;
      filename: string;
      state: "ready";
      importBatchId: string;
      rowCount: number;
      headers: string[];
      mapping: Mapping;
      mappingSources?: MappingSources;
      ignoredHeaders: string[];
      aiError?: string | null;
      groups: PreviewGroup[];
      decisions: Record<string, GroupDecision>;
      /** Set once the reader signs off on this file's columns. */
      approved: boolean;
    };

type ReadyFile = Extract<ImportFile, { state: "ready" }>;

type CommitResult = {
  books: { bookId: string; title: string; imported: number; skipped: number }[];
  totals: { imported: number; skipped: number };
};

function defaultDecisions(groups: PreviewGroup[]): Record<string, GroupDecision> {
  return Object.fromEntries(
    groups.map((g): [string, GroupDecision] => [
      g.key,
      g.matchedBookId
        ? { action: "merge", bookId: g.matchedBookId }
        : { action: "new", title: g.title, author: g.author },
    ]),
  );
}

function pendingColumns(file: ReadyFile): string[] {
  return unassignedHeaders(file.headers, file.mapping, file.ignoredHeaders);
}

/** A file blocks the import while it has undecided columns the reader hasn't signed off on. */
function needsReview(file: ImportFile): boolean {
  if (file.state !== "ready") return false;
  return !file.approved && pendingColumns(file).length > 0;
}

export default function ImportPage() {
  const [files, setFiles] = useState<ImportFile[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editingColumns, setEditingColumns] = useState<Record<string, boolean>>({});
  const [result, setResult] = useState<CommitResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fall back to the first file so the panel is never blank while files remain.
  const selected = files.find((f) => f.id === selectedId) ?? files[0] ?? null;

  const switcherFiles: SwitcherFile[] = useMemo(
    () =>
      files.map((file) => {
        if (file.state === "loading") return { id: file.id, filename: file.filename, state: "loading" };
        if (file.state === "failed") return { id: file.id, filename: file.filename, state: "failed" };
        const pending = pendingColumns(file);
        return needsReview(file)
          ? {
              id: file.id,
              filename: file.filename,
              state: "needs-review",
              unassignedCount: pending.length,
            }
          : { id: file.id, filename: file.filename, state: "settled" };
      }),
    [files],
  );

  function patchFile(id: string, patch: Partial<ReadyFile>) {
    setFiles((prev) =>
      prev.map((f) => (f.id === id && f.state === "ready" ? { ...f, ...patch } : f)),
    );
  }

  async function upload(chosen: File[]) {
    const entries: ImportFile[] = chosen.map((file, i) => ({
      id: `${Date.now()}-${i}-${file.name}`,
      filename: file.name,
      state: "loading",
    }));

    setFiles((prev) => [...prev, ...entries]);
    setSelectedId((prev) => prev ?? entries[0]?.id ?? null);
    setBusy(true);
    setError(null);
    setResult(null);

    const settled: ReadyFile[] = [];

    // Sequential: the preview endpoint may call the model to match leftover
    // columns, and firing a whole drop of files at it at once is needless load.
    for (const [i, file] of chosen.entries()) {
      const id = entries[i].id;
      try {
        const body = new FormData();
        body.append("file", file);
        const res = await fetch("/api/imports/preview", { method: "POST", body });
        const json = await res.json();

        if (!res.ok) {
          setFiles((prev) =>
            prev.map((f) =>
              f.id === id
                ? { id, filename: file.name, state: "failed", error: json.error ?? "That file could not be read." }
                : f,
            ),
          );
          continue;
        }

        const preview = json as PreviewResponse;
        const ignored = preview.ignoredHeaders ?? [];
        const ready: ReadyFile = {
          id,
          filename: preview.filename,
          state: "ready",
          importBatchId: preview.importBatchId,
          rowCount: preview.rowCount,
          headers: preview.headers,
          mapping: preview.mapping,
          mappingSources: preview.mappingSources,
          ignoredHeaders: ignored,
          aiError: preview.aiError,
          groups: preview.groups,
          decisions: defaultDecisions(preview.groups),
          // Only ever set by an explicit sign-off. A file with nothing left
          // undecided is never asked about, so it does not need this flag.
          approved: false,
        };
        settled.push(ready);
        setFiles((prev) => prev.map((f) => (f.id === id ? ready : f)));
      } catch {
        setFiles((prev) =>
          prev.map((f) =>
            f.id === id ? { id, filename: file.name, state: "failed", error: "Upload failed." } : f,
          ),
        );
      }
    }

    setBusy(false);

    // Land the reader on the first file that actually wants their attention.
    const firstPending = settled.find(needsReview);
    if (firstPending) setSelectedId(firstPending.id);
  }

  const readyFiles = files.filter((f): f is ReadyFile => f.state === "ready");
  const blocked = files.filter(needsReview);
  const invalid = readyFiles.filter((f) => !isMappingValid(f.mapping));
  const importable = readyFiles.filter((f) =>
    Object.values(f.decisions).some((d) => d.action !== "skip"),
  );

  const readyToCommit =
    !busy && blocked.length === 0 && invalid.length === 0 && importable.length > 0;

  async function commit() {
    setBusy(true);
    setError(null);

    const books: CommitResult["books"] = [];
    let imported = 0;
    let skipped = 0;
    const failures: string[] = [];
    const failedIds = new Set<string>();

    for (const file of importable) {
      try {
        const res = await fetch(`/api/imports/${file.importBatchId}/commit`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            mapping: file.mapping,
            groups: file.groups.map((g) => {
              const d = file.decisions[g.key] ?? { action: "skip" as const };
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
          failures.push(`${file.filename}: ${json.error ?? "could not be committed"}`);
          failedIds.add(file.id);
          continue;
        }

        const partial = json as CommitResult;
        books.push(...partial.books);
        imported += partial.totals.imported;
        skipped += partial.totals.skipped;
      } catch {
        failures.push(`${file.filename}: the import could not be committed`);
        failedIds.add(file.id);
      }
    }

    setBusy(false);

    // Report whatever landed; a file that failed leaves the rest imported.
    if (books.length > 0 || failures.length === 0) {
      setResult({ books, totals: { imported, skipped } });
      // Keep the files that did not land — their staged rows are still pending,
      // so dismissing the summary brings them back ready to retry.
      setFiles((prev) => prev.filter((f) => failedIds.has(f.id)));
      setSelectedId((prev) => (prev && failedIds.has(prev) ? prev : null));
      setEditingColumns({});
    }
    if (failures.length > 0) setError(failures.join(" · "));
  }

  function reset() {
    setFiles([]);
    setSelectedId(null);
    setEditingColumns({});
    setError(null);
  }

  const showMapper =
    selected?.state === "ready" && (needsReview(selected) || editingColumns[selected.id]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-medium tracking-tight">Import highlights</h1>
        <p className="text-sm text-[var(--muted-foreground)]">
          CSV or Readwise exports. Duplicate highlights are skipped automatically.
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

          {error ? <p className="text-sm text-[var(--danger)]">{error}</p> : null}

          <div className="flex gap-2">
            <Button asChild>
              <Link href="/">Back to the library</Link>
            </Button>
            <Button variant="outline" onClick={() => setResult(null)}>
              Import more files
            </Button>
          </div>
        </div>
      ) : files.length === 0 ? (
        <Dropzone onFiles={upload} busy={busy} error={error} />
      ) : (
        <div className="space-y-5">
          <FileSwitcher
            files={switcherFiles}
            selectedId={selected?.id ?? null}
            onSelect={setSelectedId}
          />

          {selected?.state === "loading" ? (
            <Card className="p-5 text-sm text-[var(--muted-foreground)]">
              Reading {selected.filename}…
            </Card>
          ) : null}

          {selected?.state === "failed" ? (
            <Card className="p-5 text-sm text-[var(--danger)]">
              {selected.filename} could not be read. {selected.error}
            </Card>
          ) : null}

          {selected?.state === "ready" ? (
            <div className="space-y-5">
              <p className="text-sm text-[var(--muted-foreground)]">
                <span className="font-medium text-[var(--foreground)]">{selected.filename}</span> —{" "}
                {plural(selected.rowCount, "row")}
              </p>

              {showMapper ? (
                <div className="space-y-3">
                  <ColumnMapper
                    headers={selected.headers}
                    mapping={selected.mapping}
                    sources={selected.mappingSources}
                    aiError={selected.aiError}
                    unassigned={pendingColumns(selected)}
                    onChange={(mapping) => patchFile(selected.id, { mapping })}
                  />
                  {needsReview(selected) ? (
                    <Button
                      variant="outline"
                      disabled={!isMappingValid(selected.mapping)}
                      onClick={() => patchFile(selected.id, { approved: true })}
                    >
                      Approve these columns
                    </Button>
                  ) : (
                    <Button
                      variant="ghost"
                      onClick={() =>
                        setEditingColumns((prev) => ({ ...prev, [selected.id]: false }))
                      }
                    >
                      Done with columns
                    </Button>
                  )}
                </div>
              ) : (
                <Card className="flex flex-wrap items-center justify-between gap-3 p-4">
                  <div className="flex items-center gap-2 text-sm">
                    <Badge tone="accent">Columns settled</Badge>
                    <span className="text-[var(--muted-foreground)]">
                      {pendingColumns(selected).length > 0
                        ? `You approved these columns; ${plural(
                            pendingColumns(selected).length,
                            "column",
                          )} left out of the import.`
                        : "Every column in this file is either mapped or deliberately left out."}
                    </span>
                  </div>
                  <Button
                    variant="ghost"
                    onClick={() => setEditingColumns((prev) => ({ ...prev, [selected.id]: true }))}
                  >
                    Edit columns
                  </Button>
                </Card>
              )}

              <GroupReview
                groups={selected.groups}
                decisions={selected.decisions}
                onChange={(key, decision) =>
                  patchFile(selected.id, {
                    decisions: { ...selected.decisions, [key]: decision },
                  })
                }
              />
            </div>
          ) : null}

          {error ? <p className="text-sm text-[var(--danger)]">{error}</p> : null}

          {blocked.length > 0 ? (
            <p className="text-sm text-[var(--muted-foreground)]">
              {plural(blocked.length, "file")} still need column approval before you can import.
            </p>
          ) : null}

          <div className="flex flex-wrap gap-2">
            <Button onClick={commit} disabled={!readyToCommit}>
              {busy
                ? "Importing…"
                : `Import ${plural(importable.length, "file")}`}
            </Button>
            <Button variant="ghost" onClick={reset}>
              Start over
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
