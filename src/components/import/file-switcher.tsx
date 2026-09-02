"use client";

import { Badge } from "@/components/ui/primitives";
import { plural } from "@/lib/utils";

/** What the reader still has to do about one uploaded file. */
export type FileState = "loading" | "needs-review" | "settled" | "failed";

export type SwitcherFile = {
  id: string;
  filename: string;
  state: FileState;
  /** Unreviewed column count, for the "needs review" files. */
  unassignedCount?: number;
};

const STATE_LABEL: Record<FileState, string> = {
  loading: "reading…",
  "needs-review": "needs review",
  settled: "ready",
  failed: "could not be read",
};

function optionLabel(file: SwitcherFile): string {
  if (file.state === "needs-review" && file.unassignedCount) {
    return `${file.filename} — ${plural(file.unassignedCount, "column")} to review`;
  }
  return `${file.filename} — ${STATE_LABEL[file.state]}`;
}

/**
 * One file is edited at a time. The dropdown is the way between them, and it
 * carries each file's state so the reader can see at a glance which files are
 * still waiting on them without opening each one.
 */
export function FileSwitcher({
  files,
  selectedId,
  onSelect,
}: {
  files: SwitcherFile[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const reviewCount = files.filter((f) => f.state === "needs-review").length;
  const failedCount = files.filter((f) => f.state === "failed").length;

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <label htmlFor="import-file" className="text-sm font-medium">
          {plural(files.length, "file")} uploaded
        </label>
        <div className="flex items-center gap-2">
          {reviewCount > 0 ? (
            <Badge tone="warn">{reviewCount} needing review</Badge>
          ) : (
            <Badge tone="accent">All columns settled</Badge>
          )}
          {failedCount > 0 ? <Badge tone="danger">{failedCount} unreadable</Badge> : null}
        </div>
      </div>

      <select
        id="import-file"
        value={selectedId ?? ""}
        onChange={(e) => onSelect(e.target.value)}
        className="h-9 w-full rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] px-2 text-sm"
      >
        {files.map((file) => (
          <option key={file.id} value={file.id}>
            {optionLabel(file)}
          </option>
        ))}
      </select>
    </div>
  );
}
