import { describe, expect, it } from "vitest";
import { filterLibraryBooks, type LibraryBookSummary } from "@/lib/library-filter";

const books: LibraryBookSummary[] = [
  { id: "1", title: "Thinking, Fast and Slow", author: "Daniel Kahneman", badge: "ready" },
  { id: "2", title: "The Design of Everyday Things", author: "Don Norman", badge: "none" },
  { id: "3", title: "Atomic Habits", author: "James Clear", badge: "stale" },
  { id: "4", title: "Deep Work", author: "Cal Newport", badge: "running" },
  { id: "5", title: "The Black Swan", author: "Nassim Taleb", badge: "failed" },
];

describe("filterLibraryBooks", () => {
  it("searches title and author without case sensitivity or surrounding whitespace", () => {
    expect(filterLibraryBooks(books, "  kahneman ", "all", "recent").map((b) => b.id)).toEqual(["1"]);
    expect(filterLibraryBooks(books, "DESIGN", "all", "recent").map((b) => b.id)).toEqual(["2"]);
  });

  it("groups unanalyzed, stale, and failed books as needing attention", () => {
    expect(filterLibraryBooks(books, "", "needs-attention", "recent").map((b) => b.id)).toEqual(["2", "3", "5"]);
  });

  it("filters analyzed and currently analyzing books independently", () => {
    expect(filterLibraryBooks(books, "", "analyzed", "recent").map((b) => b.id)).toEqual(["1"]);
    expect(filterLibraryBooks(books, "", "analyzing", "recent").map((b) => b.id)).toEqual(["4"]);
  });

  it("combines text and status filters", () => {
    expect(filterLibraryBooks(books, "the", "needs-attention", "recent").map((b) => b.id)).toEqual(["2", "5"]);
  });

  it("sorts alphabetically without mutating the original list", () => {
    const result = filterLibraryBooks(books, "", "all", "title");
    expect(result.map((b) => b.title)).toEqual([
      "Atomic Habits",
      "Deep Work",
      "The Black Swan",
      "The Design of Everyday Things",
      "Thinking, Fast and Slow",
    ]);
    expect(books[0].title).toBe("Thinking, Fast and Slow");
  });

  it("preserves newest-first input order when recent sorting is selected", () => {
    expect(filterLibraryBooks(books, "", "all", "recent")).toEqual(books);
  });
});
