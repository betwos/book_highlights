import { describe, it, expect } from "vitest";
import { detectMapping, isMappingValid, emptyMapping } from "@/lib/csv/detect";

const READWISE_HEADERS = [
  "Highlight",
  "Book Title",
  "Book Author",
  "Amazon Book ID",
  "Note",
  "Color",
  "Tags",
  "Location Type",
  "Location",
  "Highlighted at",
  "Document tags",
];

describe("detectMapping", () => {
  it("maps a real Readwise header row", () => {
    const mapping = detectMapping(READWISE_HEADERS);

    expect(mapping.text).toBe("Highlight");
    expect(mapping.title).toBe("Book Title");
    expect(mapping.author).toBe("Book Author");
    expect(mapping.note).toBe("Note");
    expect(mapping.color).toBe("Color");
    expect(mapping.tags).toBe("Tags");
    expect(mapping.location).toBe("Location");
    expect(mapping.locationType).toBe("Location Type");
    expect(mapping.highlightedAt).toBe("Highlighted at");
  });

  it("is case- and space-insensitive", () => {
    const mapping = detectMapping(["  highlight ", "document_title", "DOCUMENT AUTHOR"]);
    expect(mapping.text).toBe("  highlight ");
    expect(mapping.title).toBe("document_title");
    expect(mapping.author).toBe("DOCUMENT AUTHOR");
  });

  it("returns null for fields with no recognized header", () => {
    const mapping = detectMapping(["Quote", "Sprocket", "Widget Count"]);

    expect(mapping.text).toBe("Quote");
    expect(mapping.title).toBeNull();
    expect(mapping.author).toBeNull();
    expect(mapping.note).toBeNull();
    expect(mapping.tags).toBeNull();
  });

  it("requires a text mapping to be valid", () => {
    expect(isMappingValid(emptyMapping())).toBe(false);
    expect(isMappingValid(detectMapping(["Title", "Author"]))).toBe(false);
    expect(isMappingValid(detectMapping(["Text"]))).toBe(true);
  });
});
