export type LibraryAnalysisStatus = "none" | "ready" | "stale" | "failed" | "running";
export type LibraryBookSummary = { id: string; title: string; author: string; badge: LibraryAnalysisStatus };
export type LibraryFilter = "all" | "needs-attention" | "analyzed" | "analyzing";
export type LibrarySort = "recent" | "title";

export function filterLibraryBooks<T extends LibraryBookSummary>(books: T[], query: string, filter: LibraryFilter, sort: LibrarySort): T[] {
  const normalized = query.trim().toLocaleLowerCase();
  const matches = books.filter((book) => {
    const textMatches = !normalized || book.title.toLocaleLowerCase().includes(normalized) || book.author.toLocaleLowerCase().includes(normalized);
    const statusMatches = filter === "all" ||
      (filter === "needs-attention" && (book.badge === "none" || book.badge === "stale" || book.badge === "failed")) ||
      (filter === "analyzed" && book.badge === "ready") ||
      (filter === "analyzing" && book.badge === "running");
    return textMatches && statusMatches;
  });
  // The incoming order is newest-updated first; preserve it unless alphabetical order is requested.
  return sort === "title" ? [...matches].sort((a, b) => a.title.localeCompare(b.title) || a.author.localeCompare(b.author)) : matches;
}