"use client";

import { useMemo, useState } from "react";
import { BookCard, type AnalysisBadge } from "@/components/book-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { filterLibraryBooks, type LibraryFilter, type LibrarySort } from "@/lib/library-filter";

type LibraryBook = {
  id: string;
  title: string;
  author: string;
  coverUrl: string | null;
  highlightCount: number;
  badge: AnalysisBadge;
};

const FILTERS: { id: LibraryFilter; label: string }[] = [
  { id: "all", label: "All books" },
  { id: "needs-attention", label: "Needs attention" },
  { id: "analyzed", label: "Analyzed" },
  { id: "analyzing", label: "Analyzing" },
];

export function LibraryBrowser({ books }: { books: LibraryBook[] }) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<LibraryFilter>("all");
  const [sort, setSort] = useState<LibrarySort>("recent");

  const visibleBooks = useMemo(
    () => filterLibraryBooks(books, query, filter, sort),
    [books, query, filter, sort],
  );
  const hasFilters = query.trim().length > 0 || filter !== "all" || sort !== "recent";

  const reset = () => {
    setQuery("");
    setFilter("all");
    setSort("recent");
  };

  return (
    <section aria-label="Search and filter your library" className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="min-w-0 flex-1">
          <Input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search by book title or author"
            aria-label="Search books by title or author"
          />
        </div>
        <label className="flex shrink-0 items-center gap-2 text-sm text-[var(--muted-foreground)]">
          <span>Sort</span>
          <select
            value={sort}
            onChange={(event) => setSort(event.target.value as LibrarySort)}
            className="h-9 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] px-3 text-sm text-[var(--foreground)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
            aria-label="Sort books"
          >
            <option value="recent">Recently updated</option>
            <option value="title">Title (A–Z)</option>
          </select>
        </label>
      </div>

      <div className="flex flex-wrap items-center gap-2" aria-label="Filter by analysis status">
        {FILTERS.map(({ id, label }) => (
          <Button
            key={id}
            type="button"
            size="sm"
            variant={filter === id ? "default" : "outline"}
            aria-pressed={filter === id}
            onClick={() => setFilter(id)}
          >
            {label}
          </Button>
        ))}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-[var(--muted-foreground)]" aria-live="polite">
          Showing {visibleBooks.length} of {books.length} {books.length === 1 ? "book" : "books"}
        </p>
        {hasFilters ? (
          <Button type="button" size="sm" variant="ghost" onClick={reset}>
            Clear filters
          </Button>
        ) : null}
      </div>

      {visibleBooks.length > 0 ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {visibleBooks.map((book) => <BookCard key={book.id} book={book} />)}
        </div>
      ) : (
        <div className="rounded-[var(--radius)] border border-dashed border-[var(--border)] px-6 py-12 text-center">
          <p className="font-medium">No books found</p>
          <p className="mt-1 text-sm text-[var(--muted-foreground)]">
            Try a different search or analysis filter.
          </p>
          <Button type="button" variant="outline" size="sm" className="mt-4" onClick={reset}>
            Reset library view
          </Button>
        </div>
      )}
    </section>
  );
}
