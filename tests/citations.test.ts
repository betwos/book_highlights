import { describe, it, expect } from "vitest";
import {
  buildLookup,
  renderHighlights,
  invalidCitations,
  citationRetryMessage,
  dropInvalidCitations,
  resolveCitations,
} from "@/lib/ai/citations";

const highlights = [
  { id: "clx_a", text: "Losses loom larger than gains.", note: null, location: "3320", locationType: "location" },
  { id: "clx_b", text: "Coherence is not evidence.", note: "Write this down.", location: null, locationType: null },
  { id: "clx_c", text: "Intuition is recognition.", note: null, location: "12", locationType: "page" },
];

const lookup = buildLookup(highlights);

describe("renderHighlights", () => {
  it("numbers highlights as [H<n>] with location and note", () => {
    const rendered = renderHighlights(highlights);
    expect(rendered).toContain("[H1] Losses loom larger than gains. (loc 3320)");
    expect(rendered).toContain("[H2] Coherence is not evidence.\nNote: Write this down.");
    expect(rendered).toContain("[H3] Intuition is recognition. (p. 12)");
  });

  it("offsets ids for a map-reduce chunk", () => {
    expect(renderHighlights(highlights.slice(0, 1), 50)).toContain("[H51]");
  });
});

describe("citation validation", () => {
  it("rejects an unknown H<n> id and produces the retry message", () => {
    const takeaways = [
      { highlightIds: ["H1", "H2"] },
      { highlightIds: ["H9", "H2"] },
      { highlightIds: ["H42"] },
    ];

    const invalid = invalidCitations(takeaways, lookup);
    expect(invalid).toEqual(["H9", "H42"]);

    const message = citationRetryMessage(invalid, lookup);
    expect(message).toContain("H9");
    expect(message).toContain("H42");
    expect(message).toContain("H1 through H3");
    expect(message).toMatch(/never cite an id that was not provided/i);
  });

  it("accepts a fully valid citation set", () => {
    expect(invalidCitations([{ highlightIds: ["H1", "H3"] }], lookup)).toEqual([]);
  });

  it("drops invalid ids and then takeaways left with none", () => {
    const kept = dropInvalidCitations(
      [
        { title: "keeps one", highlightIds: ["H1", "H9"] },
        { title: "loses all", highlightIds: ["H9", "H42"] },
      ],
      lookup,
    );

    expect(kept).toHaveLength(1);
    expect(kept[0].highlightIds).toEqual(["H1"]);
  });

  it("resolves H<n> tokens to real database ids before persisting", () => {
    const resolved = resolveCitations([{ highlightIds: ["H1", "H3"] }], lookup);
    expect(resolved[0].highlightIds).toEqual(["clx_a", "clx_c"]);
  });
});
