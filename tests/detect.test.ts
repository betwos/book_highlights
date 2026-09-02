import { describe, it, expect } from "vitest";
import {
  detectMapping,
  isMappingValid,
  emptyMapping,
  unassignedHeaders,
} from "@/lib/csv/detect";

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

describe("unassignedHeaders", () => {
  it("reports headers that are neither mapped nor deliberately ignored", () => {
    const mapping = detectMapping(READWISE_HEADERS);

    // Detection alone leaves two of Readwise's own columns undecided.
    expect(unassignedHeaders(READWISE_HEADERS, mapping)).toEqual([
      "Amazon Book ID",
      "Document tags",
    ]);
  });

  it("treats a remembered 'never import' header as decided", () => {
    const mapping = detectMapping(READWISE_HEADERS);

    expect(
      unassignedHeaders(READWISE_HEADERS, mapping, ["Amazon Book ID", "Document tags"]),
    ).toEqual([]);
  });

  it("ignores case and spacing when matching a header to its decision", () => {
    const mapping = { ...emptyMapping(), text: "highlight_text" };

    expect(unassignedHeaders(["Highlight Text", "Extra"], mapping)).toEqual(["Extra"]);
    expect(unassignedHeaders(["Extra"], mapping, ["  EXTRA  "])).toEqual([]);
  });

  it("returns every header when nothing has been decided", () => {
    expect(unassignedHeaders(["A", "B"], emptyMapping())).toEqual(["A", "B"]);
  });
});
