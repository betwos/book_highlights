import { describe, it, expect } from "vitest";
import { normalizeForHash, contentHash, highlightSetHash } from "@/lib/hash";

describe("normalizeForHash", () => {
  it("collapses whitespace, smart quotes, and a trailing ellipsis to one hash", () => {
    const variants = [
      "The mind is a machine for jumping to conclusions.",
      "The  mind is a machine\n  for jumping to conclusions.",
      "“The mind is a machine for jumping to conclusions.”…",
    ];

    const hashes = new Set(variants.map(contentHash));
    expect(hashes.size).toBe(1);
  });

  it("unifies dashes and lowercases", () => {
    expect(normalizeForHash("Slow—thinking")).toBe(normalizeForHash("slow-thinking"));
  });

  it("strips a leading ellipsis", () => {
    expect(normalizeForHash("…and then it stops")).toBe(normalizeForHash("and then it stops"));
  });

  it("keeps genuinely different text distinct", () => {
    expect(contentHash("losses loom larger")).not.toBe(contentHash("losses loom large"));
  });
});

describe("highlightSetHash", () => {
  it("is order-independent", () => {
    const a = ["c", "a", "b"].map(contentHash);
    const b = ["b", "c", "a"].map(contentHash);
    expect(highlightSetHash(a)).toBe(highlightSetHash(b));
  });

  it("is text-sensitive", () => {
    const base = ["one", "two", "three"].map(contentHash);
    const edited = ["one", "two", "three!"].map(contentHash);
    expect(highlightSetHash(base)).not.toBe(highlightSetHash(edited));
  });

  it("changes when a highlight is added", () => {
    const base = ["one", "two"].map(contentHash);
    expect(highlightSetHash(base)).not.toBe(highlightSetHash([...base, contentHash("three")]));
  });
});
