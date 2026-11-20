import { describe, expect, it } from "vitest";
import { matchesHighlightQuery } from "@/lib/highlight-search";

const highlight = {
  text: "The map is not the territory.",
  note: "A reminder about models.",
  location: "Chapter 4, page 82",
  locationType: "page",
  tags: ["epistemology", "models"],
};

describe("matchesHighlightQuery", () => {
  it("matches highlight text and personal notes", () => {
    expect(matchesHighlightQuery(highlight, "territory")).toBe(true);
    expect(matchesHighlightQuery(highlight, "reminder")).toBe(true);
  });

  it("matches saved locations, location types, and tags", () => {
    expect(matchesHighlightQuery(highlight, "page 82")).toBe(true);
    expect(matchesHighlightQuery(highlight, "page")).toBe(true);
    expect(matchesHighlightQuery(highlight, "epistemology")).toBe(true);
  });

  it("ignores surrounding whitespace and letter case", () => {
    expect(matchesHighlightQuery(highlight, "  TERRITORY ")).toBe(true);
    expect(matchesHighlightQuery(highlight, "  ")).toBe(true);
  });

  it("returns false when no field matches", () => {
    expect(matchesHighlightQuery(highlight, "unrelated")).toBe(false);
  });
});
