import { describe, it, expect } from "vitest";
import {
  TakeawaysSchema,
  ChapterOutlineSchema,
  parseStoredTakeaways,
} from "@/lib/ai/schemas";

function takeaway(n: number) {
  return {
    title: `Takeaway ${n}`,
    body: "You keep marking the same idea in different clothes.",
    theme: "attention",
    highlightIds: [`H${n}`],
  };
}

describe("TakeawaysSchema", () => {
  it("rejects an empty highlightIds array", () => {
    const result = TakeawaysSchema.safeParse({
      takeaways: [{ ...takeaway(1), highlightIds: [] }, takeaway(2), takeaway(3)],
    });
    expect(result.success).toBe(false);
  });

  it("rejects 2 takeaways", () => {
    expect(TakeawaysSchema.safeParse({ takeaways: [takeaway(1), takeaway(2)] }).success).toBe(false);
  });

  it("rejects 6 takeaways", () => {
    const six = [1, 2, 3, 4, 5, 6].map(takeaway);
    expect(TakeawaysSchema.safeParse({ takeaways: six }).success).toBe(false);
  });

  it("accepts 3 through 5", () => {
    for (const n of [3, 4, 5]) {
      const list = Array.from({ length: n }, (_, i) => takeaway(i + 1));
      expect(TakeawaysSchema.safeParse({ takeaways: list }).success).toBe(true);
    }
  });

  it("rejects a title over 80 characters", () => {
    const bad = { ...takeaway(1), title: "x".repeat(81) };
    expect(TakeawaysSchema.safeParse({ takeaways: [bad, takeaway(2), takeaway(3)] }).success).toBe(
      false,
    );
  });
});

describe("stored payload parsing", () => {
  it("returns null for a payload an older prompt version wrote", () => {
    expect(parseStoredTakeaways({ points: ["a", "b"] })).toBeNull();
  });

  it("round-trips a valid payload", () => {
    const payload = { takeaways: [takeaway(1), takeaway(2), takeaway(3)] };
    expect(parseStoredTakeaways(payload)).toHaveLength(3);
  });
});

describe("ChapterOutlineSchema", () => {
  it("treats an unrecognized book with no chapters as valid", () => {
    const result = ChapterOutlineSchema.safeParse({
      bookRecognized: false,
      chapters: [],
      caveat: "I do not reliably know this book.",
    });
    expect(result.success).toBe(true);
  });

  it("requires a confidence level on every chapter", () => {
    const result = ChapterOutlineSchema.safeParse({
      bookRecognized: true,
      chapters: [{ number: 1, title: "One", summary: "...", keyIdeas: [] }],
      caveat: null,
    });
    expect(result.success).toBe(false);
  });

  it("allows a null chapter number for front matter", () => {
    const result = ChapterOutlineSchema.safeParse({
      bookRecognized: true,
      chapters: [
        { number: null, title: "Preface", summary: "...", keyIdeas: ["a"], confidence: "low" },
      ],
      caveat: null,
    });
    expect(result.success).toBe(true);
  });
});
