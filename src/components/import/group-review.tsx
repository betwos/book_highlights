"use client";

import { Card, Badge } from "@/components/ui/primitives";
import { Input } from "@/components/ui/field";
import { plural } from "@/lib/utils";

export type PreviewGroup = {
  key: string;
  title: string;
  author: string;
  rowCount: number;
  sampleTexts: string[];
  matchedBookId?: string;
};

export type GroupDecision =
  | { action: "new"; title: string; author: string }
  | { action: "merge"; bookId: string }
  | { action: "skip" };

/** Each book in the export is independently create / merge / skip (SPEC 4.8). */
export function GroupReview({
  groups,
  decisions,
  onChange,
}: {
  groups: PreviewGroup[];
  decisions: Record<string, GroupDecision>;
  onChange: (key: string, decision: GroupDecision) => void;
}) {
  return (
    <div className="space-y-3">
      <div>
        <h2 className="text-sm font-medium">Books in this file</h2>
        <p className="text-sm text-[var(--muted-foreground)]">
          {plural(groups.length, "book")} found. Choose what happens to each.
        </p>
      </div>

      {groups.map((group) => {
        const decision = decisions[group.key];
        return (
          <Card key={group.key} className="space-y-3 p-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="font-medium">{group.title}</p>
                <p className="text-sm text-[var(--muted-foreground)]">{group.author}</p>
              </div>
              <div className="flex items-center gap-2">
                <Badge tone="muted">{plural(group.rowCount, "row")}</Badge>
                {group.matchedBookId ? <Badge tone="accent">Already in your library</Badge> : null}
              </div>
            </div>

            {group.sampleTexts[0] ? (
              <p className="prose-reading line-clamp-2 text-sm text-[var(--muted-foreground)]">
                “{group.sampleTexts[0]}”
              </p>
            ) : null}

            <div className="flex flex-wrap gap-3 text-sm">
              {group.matchedBookId ? (
                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    name={`g-${group.key}`}
                    checked={decision?.action === "merge"}
                    onChange={() =>
                      onChange(group.key, { action: "merge", bookId: group.matchedBookId! })
                    }
                  />
                  Merge into the existing book
                </label>
              ) : null}

              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name={`g-${group.key}`}
                  checked={decision?.action === "new"}
                  onChange={() =>
                    onChange(group.key, {
                      action: "new",
                      title: group.title,
                      author: group.author,
                    })
                  }
                />
                Create a new book
              </label>

              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name={`g-${group.key}`}
                  checked={decision?.action === "skip"}
                  onChange={() => onChange(group.key, { action: "skip" })}
                />
                Skip
              </label>
            </div>

            {decision?.action === "new" ? (
              <div className="grid gap-2 sm:grid-cols-2">
                <Input
                  value={decision.title}
                  onChange={(e) =>
                    onChange(group.key, { ...decision, title: e.target.value })
                  }
                  placeholder="Title"
                />
                <Input
                  value={decision.author}
                  onChange={(e) =>
                    onChange(group.key, { ...decision, author: e.target.value })
                  }
                  placeholder="Author"
                />
              </div>
            ) : null}
          </Card>
        );
      })}
    </div>
  );
}
