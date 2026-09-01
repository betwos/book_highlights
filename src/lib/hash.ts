import { createHash } from "node:crypto";

const SMART_QUOTES = /[‘’‚‛′‵]/g;
const SMART_DOUBLE = /[“”„‟″‶]/g;
const DASHES = /[‐‑‒–—―−]/g;
const ELLIPSIS = /…/g;

/**
 * Canonical form used for content hashing and for title/author grouping.
 * NFKC -> smart punctuation to ASCII -> whitespace collapse -> strip surrounding
 * ellipsis and quotes -> trim -> lowercase.
 */
export function normalizeForHash(text: string): string {
  let s = (text ?? "").normalize("NFKC");
  s = s.replace(ELLIPSIS, "...");
  s = s.replace(SMART_QUOTES, "'").replace(SMART_DOUBLE, '"').replace(DASHES, "-");
  s = s.replace(/\s+/g, " ").trim();
  // Strip leading/trailing ellipsis and quote characters, possibly interleaved.
  let previous: string;
  do {
    previous = s;
    s = s.replace(/^[\s"'`.]*\.\.\.\s*/, "").replace(/\s*\.\.\.[\s"'`.]*$/, "");
    s = s.replace(/^["'`]+/, "").replace(/["'`]+$/, "");
    s = s.trim();
  } while (s !== previous);
  return s.toLowerCase();
}

export function sha256(input: string): string {
  return createHash("sha256").update(input, "utf8").digest("hex");
}

export function contentHash(text: string): string {
  return sha256(normalizeForHash(text));
}

/** Order-independent (sorted) but text-sensitive fingerprint of a highlight set. */
export function highlightSetHash(hashes: string[]): string {
  return sha256([...hashes].sort().join("\n"));
}
