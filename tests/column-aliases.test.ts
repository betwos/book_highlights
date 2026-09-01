import { describe, it, expect } from "vitest";
import { detectMapping, headerKey } from "@/lib/csv/detect";
import {
  aliasMap,
  aliasesToRemember,
  applyAliases,
  mergeAiAssignments,
  unresolvedHeaders,
  type StoredAlias,
} from "@/lib/csv/aliases";

const HEADERS = ["timestamp", "chapter", "percent", "color", "quote"];

function alias(header: string, field: StoredAlias["field"], source: StoredAlias["source"] = "llm") {
  return { headerKey: headerKey(header), headerSample: header, field, source };
}

describe("applyAliases", () => {
  it("keeps what the header detector already knows and leaves the rest open", () => {
    const resolved = applyAliases(HEADERS, detectMapping(HEADERS), aliasMap([]));

    expect(resolved.mapping.text).toBe("quote"); // a known alias of "Highlight"
    expect(resolved.sources.text).toBe("detected");
    expect(resolved.mapping.highlightedAt).toBeNull(); // "timestamp" is not
    expect(resolved.mapping.location).toBeNull();
  });

  it("maps remembered headers the detector does not know", () => {
    const aliases = aliasMap([alias("timestamp", "highlightedAt"), alias("percent", "location")]);
    const resolved = applyAliases(HEADERS, detectMapping(HEADERS), aliases);

    expect(resolved.mapping.highlightedAt).toBe("timestamp");
    expect(resolved.sources.highlightedAt).toBe("learned");
    expect(resolved.mapping.location).toBe("percent");
  });

  it("remembers a column as never imported", () => {
    const resolved = applyAliases(
      HEADERS,
      detectMapping(HEADERS),
      aliasMap([alias("color", null, "user")]),
    );

    expect(resolved.mapping.color).toBeNull();
    expect(resolved.sources.color).toBeUndefined();
    expect(resolved.ignoredHeaders).toEqual(["color"]);
  });

  it("lets a user's correction beat detection and the model", () => {
    const headers = ["Highlight", "Quote"];
    const aliases = aliasMap([alias("Quote", "text", "user"), alias("Highlight", "note", "llm")]);
    const resolved = applyAliases(headers, detectMapping(headers), aliases);

    expect(resolved.mapping.text).toBe("Quote");
    expect(resolved.mapping.note).toBe("Highlight");
  });
});

describe("unresolvedHeaders", () => {
  it("asks only about headers that are neither mapped nor remembered", () => {
    const aliases = aliasMap([alias("timestamp", "highlightedAt")]);
    const resolved = applyAliases(HEADERS, detectMapping(HEADERS), aliases);

    // "quote" is detected, "timestamp" is remembered, "color" is detected.
    expect(unresolvedHeaders(HEADERS, resolved, aliases)).toEqual(["chapter", "percent"]);
  });

  it("is empty for a fully remembered file — no model call needed", () => {
    const aliases = aliasMap([
      alias("timestamp", "highlightedAt"),
      alias("chapter", null),
      alias("percent", "location"),
      alias("color", "color"),
      alias("quote", "text"),
    ]);
    const resolved = applyAliases(HEADERS, detectMapping(HEADERS), aliases);

    expect(unresolvedHeaders(HEADERS, resolved, aliases)).toEqual([]);
    expect(resolved.mapping.text).toBe("quote");
  });
});

describe("mergeAiAssignments", () => {
  it("fills the holes the detector left", () => {
    const headers = ["timestamp", "chapter", "percent", "the bit I saved"];
    const resolved = applyAliases(headers, detectMapping(headers), aliasMap([]));
    const merged = mergeAiAssignments(resolved, [
      { header: "the bit I saved", field: "text" },
      { header: "timestamp", field: "highlightedAt" },
      { header: "percent", field: "location" },
      { header: "chapter", field: null },
    ]);

    expect(merged.mapping.text).toBe("the bit I saved");
    expect(merged.sources.text).toBe("ai");
    expect(merged.mapping.location).toBe("percent");
    expect(merged.mapping.title).toBeNull();
  });

  it("never moves a column detection or memory already placed", () => {
    const headers = ["Highlight", "passage"];
    const resolved = applyAliases(headers, detectMapping(headers), aliasMap([]));
    const merged = mergeAiAssignments(resolved, [{ header: "passage", field: "text" }]);

    expect(merged.mapping.text).toBe("Highlight");
    expect(merged.sources.text).toBe("detected");
  });

  it("keeps the first assignment when the model names one field twice", () => {
    const headers = ["passage", "snippet"];
    const resolved = applyAliases(headers, detectMapping(headers), aliasMap([]));
    const merged = mergeAiAssignments(resolved, [
      { header: "passage", field: "text" },
      { header: "snippet", field: "text" },
    ]);

    expect(merged.mapping.text).toBe("passage");
  });
});

describe("aliasesToRemember", () => {
  it("records both the mapped columns and the ones left out", () => {
    const resolved = mergeAiAssignments(applyAliases(HEADERS, detectMapping(HEADERS), aliasMap([])), [
      { header: "timestamp", field: "highlightedAt" },
    ]);

    const remembered = aliasesToRemember(HEADERS, resolved.mapping, "user");
    const byKey = new Map(remembered.map((a) => [a.headerKey, a]));

    expect(byKey.get("quote")?.field).toBe("text");
    expect(byKey.get("chapter")?.field).toBeNull();
    expect(byKey.get("quote")?.source).toBe("user");
    expect(remembered).toHaveLength(HEADERS.length);
  });
});
