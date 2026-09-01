# Book Highlights → Personalized Takeaways

**Specification v1.0** — implementation-ready. An AI coding agent should be able to build this
end to end from this document alone.

---

## 0. How to use this spec

- Sections 1–3 are context. **Section 4 (Design decisions) is the load-bearing part** — those
  choices are deliberate; do not "simplify" them away without stating the reason back to the user.
- Sections 5–12 are the build contract: schema, APIs, prompts, components.
- Section 13 is the phased build order. Each phase ends in something runnable and verifiable.
- Section 14 is the acceptance checklist. The work is done when every box is checked.
- Section 15 is explicitly out of scope for v1. Do not build it.

Conventions: money is integer cents; hashes are lowercase hex sha256; times are UTC.

---

## 1. What this is

A personal web app for one reader. You import the highlights you saved while reading, attach the
book's metadata and cover, and the app produces two things:

1. **Takeaways** — 3 to 5 points about the whole book, derived *only* from what you highlighted.
   This is the personalized artifact: two people who read the same book and highlighted different
   passages get different takeaways.
2. **Chapter outline** — a chapter-by-chapter summary of the book itself, produced *without*
   reference to your highlights, so you can see what you skipped as well as what you kept.

Three domain concepts, in dependency order: **Book** → **Highlight** → **Analysis**.

## 2. Scope of v1

| In | Out (see §15) |
|---|---|
| CSV / Readwise export import | Paste, Kindle `My Clippings.txt`, OCR |
| Manual metadata entry + cover upload | Open Library / Google Books lookup |
| Single user, no login | Auth, multi-user, sharing |
| Takeaways + chapter outline | Semantic search, cross-book themes, export |

## 3. Stack

| Layer | Choice | Why |
|---|---|---|
| Framework | Next.js 15 App Router, React 19, TypeScript `strict` | One repo, one deploy, server and client share types |
| Database | Postgres (Neon or Supabase free tier) | Relational core + JSONB payloads; see §4.5 |
| ORM | Prisma 6 | Generated types are the contract between DB and UI |
| Styling | Tailwind CSS v4 + shadcn/ui | Copy-in components, no runtime dependency, easy to edit |
| CSV | `papaparse` | Streaming; handles quoted newlines inside highlight text |
| Images | `sharp` (+ `@vercel/blob` in prod) | Re-encode covers, keep payloads small |
| LLM | `@anthropic-ai/sdk`, model `claude-opus-5` | Structured outputs, 1M context, adaptive thinking |
| Validation | `zod` | One schema drives the form, the API body, and the model's output format |
| Tests | `vitest` | Fast, no config; unit-level only in v1 |

Local prerequisites verified: Node 22.13, npm 10.9. **No Docker and no local Postgres** — use a
hosted Postgres connection string in `.env.local`.

---

## 4. Design decisions and rationale

These are the choices with real alternatives. Each says what was chosen, what it buys, what it costs.

### 4.1 Two model calls, not one — the outputs have different truth contracts

The takeaways are **grounded**: their only permitted evidence is the user's highlights. The
chapter outline is **recalled**: it comes from the model's own knowledge of the book and by
definition must not see the highlights.

Folding both into one call saves a request and is wrong in a way that is invisible: the highlights
sit in the context, so the "chapter summary" quietly becomes a summary of the chapters the user
happened to highlight. The point of that second section is to show what you *missed*. Physically
separating the two prompts is the only enforcement that actually holds.

Secondary payoff: each call gets its own schema, retry policy, and failure state — an unrecognized
book degrades the chapter outline without touching the takeaways.

### 4.2 Every takeaway cites the highlights it came from

`TakeawaySchema` requires `highlightIds: string[]` with `min(1)`. After the model responds, the
server checks every cited id against the set actually sent; an unknown id fails validation and
triggers one retry that names the offending ids.

This earns its schema complexity by doing two jobs:

- **Anti-hallucination.** A takeaway that cannot point at a highlight is a takeaway about the book
  in general — exactly the generic output this app exists to avoid.
- **UI affordance.** Citations render as chips; clicking one jumps to the source highlight and
  flashes it. "Personalized" stops being a claim and becomes something you can click.

Cost: the model occasionally over-cites. Accepted — over-citing is harmless, under-citing is not.

### 4.3 The chapter outline is explicitly epistemically labeled

`ChapterOutlineSchema` carries `bookRecognized: boolean` and a per-chapter
`confidence: "high" | "medium" | "low"`. If the model does not reliably know the book, the correct
response is `bookRecognized: false` with an empty `chapters` array — **this is a success, not an
error**, and the pipeline must not retry it.

A personal reading app skews toward obscure books, and a plausible invented outline for a book the
model has never seen is the fastest way to make the whole app untrustworthy. The UI banners this
section: *"Reconstructed from the model's knowledge of this book, not from your highlights —
verify against your copy."*

### 4.4 Analyses are append-only and content-addressed

Every `Analysis` row records `highlightSetHash` (sha256 over the sorted highlight content hashes)
plus `promptVersion` and `model`. A request whose `(bookId, highlightSetHash, promptVersion, model)`
tuple already succeeded returns that row instead of paying for a new generation.

What that buys, none of which needs extra machinery:

- Regeneration is idempotent and free — the "Regenerate" button is safe to spam.
- Adding or editing a highlight changes the hash, which marks the analysis **stale** in the UI
  automatically. There is no invalidation logic to write, or to forget.
- History is kept, so "what changed when I added 20 more highlights" is a diff, not a mystery.
- Editing a prompt bumps `PROMPT_VERSION` and correctly misses the cache, instead of silently
  serving output from the old prompt.

Cost: analyses accumulate. At personal scale that is a rounding error, and old rows are a feature.

### 4.5 Relational core, JSONB payload

Books and highlights are strict relational tables — they get filtered, counted, joined, and
deduped, and they benefit from real constraints. The analysis payload (`takeaways`, `chapters`) is
`Json`, because its shape *is* the model's output schema and changes with every prompt revision.
Normalizing it into five tables buys nothing (it only ever renders as one block) and costs a
migration each time a prompt gains a field.

The Zod schemas in `lib/ai/schemas.ts` are the single source of truth for those JSONB columns: they
constrain the model on write and parse the column on read. A payload written by an older prompt
version that no longer parses renders as "generated by an older version — regenerate", never as a
crash.

### 4.6 Generation is a job row, not a request/response

A map-reduce over several hundred highlights outruns a serverless request budget. So
`POST /api/books/:id/analysis` inserts an `Analysis` with `status: "queued"`, schedules the work
with Next's `after()`, and returns immediately; the client polls `GET /api/analyses/:id`.

Compared with streaming to the browser: the work survives the user navigating away, failures have
somewhere to live (`error` column, retryable in place), and per-run `tokensIn` / `tokensOut` /
`costCents` land in the same row — so cost is a column you can look at rather than a thing you hope
about.

### 4.7 Highlights are deduped by content hash — re-importing is a no-op

`contentHash = sha256(normalizeForHash(text))` with a `@@unique([bookId, contentHash])` constraint.
Normalization collapses whitespace, unifies smart quotes and dashes, strips a trailing ellipsis,
trims, and lowercases.

Readwise exports are cumulative: next month's file is this month's file plus thirty rows. Import has
to be idempotent by construction, not by asking "skip duplicates?" and hoping. Insert with
`skipDuplicates: true` and report the skipped count — re-importing an unchanged file imports exactly
zero rows and says so.

### 4.8 One export file can contain many books

A Readwise CSV is an export of your *library*, not of one book. The importer groups rows by
normalized `(title, author)`, matches each group against existing books, and shows a review screen
where each group is independently "create new" or "merge into existing".

This is in v1 specifically because it is miserable to retrofit: single-book import shapes the schema,
the endpoints, and the UI around an assumption the real data violates on day one.

### 4.9 Storage behind an adapter

`lib/storage.ts` exports `saveImage(buffer, ext) → { url }` and `deleteImage(url)`, with a `local`
driver (writes to `public/uploads/`, gitignored) and a `blob` driver (`@vercel/blob`), selected by
`STORAGE_DRIVER`. Covers are re-encoded to 600px-wide WebP by `sharp` first.

Local development needs no cloud credentials, and swapping storage later touches one file. The
database stores a URL string and knows nothing about either driver.

### 4.10 `userId` exists from day one; auth does not

Every `Book` carries `userId` defaulting to `"local"`, and every query is written scoped by it
(`where: { userId: currentUserId() }`, where `currentUserId()` returns that constant today). Adding
Auth.js later is a middleware plus one function body — not a migration plus an audit of every query
looking for the one you forgot to scope.

### 4.11 Server Components read, Server Actions write, Route Handlers do the rest

- **Reads** happen in Server Components calling Prisma directly. No fetch layer, no client cache, no
  DTOs, no duplicated types — the page renders the Prisma result.
- **Mutations** are Server Actions (`updateBook`, `deleteHighlight`, …) with `revalidatePath`. The
  form's Zod schema is the action's Zod schema.
- **Route Handlers** exist only where that model genuinely does not fit: multipart upload, the CSV
  preview/commit pair, and the analysis job + poll endpoints.

Worth stating explicitly because the default instinct is to build `/api/books` CRUD plus a
client-side fetcher, which in this architecture is three redundant layers.

### 4.12 The frozen-prefix prompt layout

Each prompt is a `const` string with no interpolated dates, ids, or counts. The system block goes
first and carries `cache_control: { type: "ephemeral" }`; everything book-specific goes after it.
Map-reduce chunks and retries then share a cached prefix — `usage.cache_read_input_tokens > 0` on
the second chunk is the check that it is working. `PROMPT_VERSION` lives in the same file and is part
of the analysis cache key from §4.4; editing a prompt without bumping it is the one mistake this
design cannot absorb.

---

## 5. Repository layout

```
book_highlights/
├── prisma/
│   ├── schema.prisma
│   ├── migrations/
│   └── seed.ts
├── fixtures/
│   └── readwise-sample.csv            # 2 books, ~40 highlights; used by seed and tests
├── src/
│   ├── app/
│   │   ├── layout.tsx  globals.css  page.tsx          # library
│   │   ├── import/page.tsx
│   │   ├── books/new/page.tsx
│   │   ├── books/[id]/page.tsx
│   │   ├── books/[id]/edit/page.tsx
│   │   └── api/
│   │       ├── imports/preview/route.ts
│   │       ├── imports/[id]/commit/route.ts
│   │       ├── books/[id]/cover/route.ts
│   │       ├── books/[id]/analysis/route.ts
│   │       └── analyses/[id]/route.ts
│   ├── actions/
│   │   ├── books.ts
│   │   └── highlights.ts
│   ├── components/
│   │   ├── ui/                        # shadcn primitives
│   │   ├── book-card.tsx  cover-uploader.tsx  metadata-form.tsx
│   │   ├── highlight-list.tsx  highlight-item.tsx
│   │   ├── analysis-panel.tsx  takeaway-card.tsx  chapter-accordion.tsx
│   │   └── import/dropzone.tsx  import/column-mapper.tsx  import/group-review.tsx
│   └── lib/
│       ├── db.ts                      # Prisma singleton
│       ├── user.ts                    # currentUserId()
│       ├── hash.ts                    # normalizeForHash, contentHash, highlightSetHash
│       ├── storage.ts                 # local | blob adapter
│       ├── csv/parse.ts  csv/detect.ts  csv/group.ts
│       └── ai/
│           ├── client.ts  prompts.ts  schemas.ts
│           ├── takeaways.ts  chapters.ts  map-reduce.ts
│           ├── cost.ts    run.ts      # run.ts is the job body
├── tests/                             # vitest
├── .env.example
└── SPEC.md
```

## 6. Environment

`.env.example` (copy to `.env.local`):

```
DATABASE_URL="postgresql://..."        # Neon or Supabase pooled connection string
ANTHROPIC_API_KEY="sk-ant-..."
STORAGE_DRIVER="local"                 # local | blob
BLOB_READ_WRITE_TOKEN=""               # only when STORAGE_DRIVER=blob
```

Add `public/uploads/` to `.gitignore`.

---

## 7. Data model — `prisma/schema.prisma`

```prisma
generator client { provider = "prisma-client-js" }
datasource db    { provider = "postgresql"; url = env("DATABASE_URL") }

model Book {
  id            String      @id @default(cuid())
  userId        String      @default("local")
  title         String
  subtitle      String?
  author        String
  isbn          String?
  publisher     String?
  publishedYear Int?
  pageCount     Int?
  coverUrl      String?
  notes         String?
  createdAt     DateTime    @default(now())
  updatedAt     DateTime    @updatedAt
  highlights    Highlight[]
  analyses      Analysis[]

  @@index([userId, updatedAt])
}

model Highlight {
  id            String       @id @default(cuid())
  bookId        String
  book          Book         @relation(fields: [bookId], references: [id], onDelete: Cascade)
  text          String
  note          String?
  location      String?
  locationType  String?      // "page" | "location" | "offset" | null
  color         String?
  tags          String[]     @default([])
  highlightedAt DateTime?
  orderIndex    Int          @default(0)
  contentHash   String
  importBatchId String?
  importBatch   ImportBatch? @relation(fields: [importBatchId], references: [id], onDelete: SetNull)
  createdAt     DateTime     @default(now())
  updatedAt     DateTime     @updatedAt

  @@unique([bookId, contentHash])
  @@index([bookId, orderIndex])
}

model ImportBatch {
  id            String       @id @default(cuid())
  filename      String
  rowCount      Int
  importedCount Int          @default(0)
  skippedCount  Int          @default(0)
  mapping       Json
  stagedRows    Json?
  status        ImportStatus @default(pending)
  createdAt     DateTime     @default(now())
  highlights    Highlight[]
}

model Analysis {
  id               String         @id @default(cuid())
  bookId           String
  book             Book           @relation(fields: [bookId], references: [id], onDelete: Cascade)
  status           AnalysisStatus @default(queued)
  model            String
  promptVersion    String
  highlightSetHash String
  highlightCount   Int
  takeaways        Json?
  chapters         Json?
  chaptersMeta     Json?          // { bookRecognized, caveat? }
  error            String?
  tokensIn         Int?
  tokensOut        Int?
  cachedTokensRead Int?
  costCents        Int?
  createdAt        DateTime       @default(now())
  completedAt      DateTime?

  @@index([bookId, createdAt])
  @@index([bookId, highlightSetHash, promptVersion, model])
}

enum ImportStatus   { pending committed discarded }
enum AnalysisStatus { queued running succeeded failed }
```

Notes for the implementer:

- `stagedRows` holds parsed CSV rows between preview and commit. On each new preview, delete
  `pending` batches older than 24 hours. Committed batches keep `stagedRows = null`.
- `orderIndex` preserves reading order within a book (source row order, or `highlightedAt` when
  present). Sort the highlight list by it, never by `createdAt`.
- Deleting a book cascades to highlights and analyses. Deleting an import batch does not delete
  highlights (`SetNull`) — imports are provenance, not ownership.

---

## 8. Core library functions

### 8.1 `lib/hash.ts`

```ts
normalizeForHash(text: string): string
  // NFKC → smart quotes/dashes to ASCII → collapse all whitespace to single spaces
  // → strip leading/trailing ellipsis and quotes → trim → toLowerCase()

contentHash(text: string): string            // sha256(normalizeForHash(text))
highlightSetHash(hashes: string[]): string   // sha256(sorted(hashes).join("\n"))
```

`highlightSetHash` sorts, so highlight order never changes the analysis cache key — but editing
any highlight's text does. That is the intent.

### 8.2 `lib/storage.ts`

```ts
type StoredImage = { url: string };
saveImage(buffer: Buffer, ext: string): Promise<StoredImage>
deleteImage(url: string): Promise<void>
```

Driver selected by `STORAGE_DRIVER`. `local` writes `public/uploads/{cuid}.{ext}` and returns
`/uploads/{cuid}.{ext}`; `blob` calls `put()` from `@vercel/blob` and returns its URL. Callers pass
an already-processed buffer — `sharp` resizing lives in the route handler, not the adapter.

### 8.3 CSV pipeline — `lib/csv/`

`parse.ts` — `papaparse` with `header: true`, `skipEmptyLines: true`. Returns `{ headers, rows }`.
Reject files over 10 MB or with zero data rows.

`detect.ts` — maps source headers to canonical fields, case- and space-insensitive:

| Canonical | Recognized headers |
|---|---|
| `text` | Highlight, Text, Quote, Highlight Text |
| `title` | Book Title, Title, Document Title |
| `author` | Book Author, Author, Document Author |
| `note` | Note, Annotation, Comment |
| `location` | Location, Page, Position |
| `locationType` | Location Type |
| `color` | Color, Highlight Color |
| `tags` | Tags, Document Tags |
| `highlightedAt` | Highlighted at, Date, Created |

`text` is the only required mapping. **The mapping UI is always shown and always editable, even on
a perfect Readwise match** — a silent auto-map that guesses wrong is the worst failure mode of a
CSV importer, and one extra confirm click is cheap.

`group.ts` — groups rows by `normalizeForHash(title) + "|" + normalizeForHash(author)`. For each
group returns `{ key, title, author, rowCount, sampleTexts, matchedBookId? }`, where `matchedBookId`
is an existing book of the same user with an equal normalized title+author.

---

## 9. AI layer — `lib/ai/`

### 9.1 `client.ts`

```ts
import Anthropic from "@anthropic-ai/sdk";
export const anthropic = new Anthropic();          // reads ANTHROPIC_API_KEY
export const MODEL = "claude-opus-5";
```

All calls use `client.messages.parse()` with `output_config.format: zodOutputFormat(Schema)`,
`thinking: { type: "adaptive" }`, `output_config: { effort: "high" }`, and `max_tokens: 32000`.
Use `client.messages.stream(...)` + `.finalMessage()` for the reduce step, whose output is largest.
Wrap every call in the SDK's typed error classes (`Anthropic.RateLimitError`,
`Anthropic.APIError`); never string-match error messages.

### 9.2 `schemas.ts`

```ts
export const TakeawaySchema = z.object({
  title:        z.string().max(80),
  body:         z.string(),           // 2–4 sentences, second person, concrete
  theme:        z.string().max(40),
  highlightIds: z.array(z.string()).min(1),
});

export const TakeawaysSchema = z.object({
  takeaways: z.array(TakeawaySchema).min(3).max(5),
});

export const ChapterSchema = z.object({
  number:     z.number().int().nullable(),   // null for prefaces, epilogues, parts
  title:      z.string(),
  summary:    z.string(),                    // 2–4 sentences
  keyIdeas:   z.array(z.string()).max(4),
  confidence: z.enum(["high", "medium", "low"]),
});

export const ChapterOutlineSchema = z.object({
  bookRecognized: z.boolean(),
  chapters:       z.array(ChapterSchema),
  caveat:         z.string().nullable(),
});
```

These schemas are also the parsers for the `takeaways` / `chapters` JSONB columns on read
(`safeParse`; on failure render the "older version — regenerate" state).

### 9.3 `prompts.ts`

```ts
export const PROMPT_VERSION = "2026-08-31.1";   // bump on ANY prompt edit
export const TAKEAWAYS_SYSTEM = `...`;          // frozen, no interpolation
export const CHAPTERS_SYSTEM  = `...`;
export const MAP_SYSTEM       = `...`;
```

**`TAKEAWAYS_SYSTEM` must state:**

- The highlights are what one specific reader chose to save. Write for that reader, in second
  person, about what *they* marked — not a review of the book.
- Produce 3–5 takeaways. Fewer is right when the highlights are thin; do not pad to five.
- Every takeaway must cite the ids of the highlights supporting it, using the exact `[H<n>]` ids
  given. Never cite an id that was not provided.
- Synthesize across highlights — prefer a takeaway spanning several to one that restates a single
  highlight. Do not quote a highlight verbatim as the body.
- If the highlights do not support a claim, do not make it. Not knowing something about the book is
  fine; inventing it is not.

**`CHAPTERS_SYSTEM` must state:**

- You are given only title, author, and year. You have not been given the reader's highlights and
  must not speculate about them.
- Reconstruct the chapter structure from your own knowledge of this specific book.
- If you are not confident this is a book you know, set `bookRecognized: false` and return an empty
  `chapters` array. **This is the correct answer, not a failure** — a fabricated outline is far
  worse than none.
- Mark each chapter's `confidence` honestly. Use `low` freely.

### 9.4 `takeaways.ts`

```ts
generateTakeaways(book, highlights): Promise<{ takeaways, usage }>
```

1. Render highlights as a numbered block, ids `H1…Hn` mapped to real highlight ids in a lookup:
   `[H12] The text of the highlight. (loc 1423)` plus `Note: ...` on its own line when present.
2. `messages.parse()` with `TakeawaysSchema`. System block first, with `cache_control`.
3. **Validate citations**: every `highlightIds` entry must exist in the lookup. On failure, retry
   once with a user message naming the invalid ids and repeating the constraint. On a second
   failure, drop the invalid ids; if a takeaway is then left with none, drop the takeaway; if fewer
   than three remain, fail the job with a clear `error`.
4. Map `H<n>` ids back to database highlight ids before persisting. **The stored JSON holds real
   highlight ids**, so the UI can link without a translation table.

### 9.5 `chapters.ts`

```ts
generateChapters(book): Promise<{ outline, usage }>
```

Sends only `title`, `subtitle`, `author`, `publishedYear`, `isbn`. Never highlights (§4.1).
`bookRecognized: false` is a success — persist it and let the UI render the empty state.

### 9.6 `map-reduce.ts`

```ts
countTokens → if the rendered highlight block exceeds 120_000 tokens:
  chunk into groups of ~50 highlights (preserving order)
  MAP:    per chunk → candidate themes, each carrying its own [H<n>] ids
  REDUCE: all candidates → final 3–5 takeaways, citations preserved verbatim
else: single call
```

Use `client.messages.countTokens()` for the check — never a character-count heuristic. The MAP
system prompt is frozen and cached, so chunks after the first should show
`usage.cache_read_input_tokens > 0`.

### 9.7 `cost.ts`

`claude-opus-5`: $5.00 / MTok input, $25.00 / MTok output. Cached reads bill at ~0.1× input.
Sum usage across every call in a run (map chunks, reduce, retries, chapters) and write the total to
`costCents`, rounding up.

### 9.8 `run.ts` — the job body

```ts
runAnalysis(analysisId): Promise<void>
```

1. Set `status: "running"`.
2. Load book + highlights ordered by `orderIndex`.
3. Run `generateTakeaways` and `generateChapters` **concurrently** (`Promise.allSettled`) — they
   are independent by design (§4.1), so this halves wall-clock time.
4. If takeaways failed → `status: "failed"` with the error. If only chapters failed → still
   `succeeded`, with `chaptersMeta = { bookRecognized: false, caveat: <error> }`; a missing chapter
   outline must never cost the user their takeaways.
5. Persist payloads, usage, `costCents`, `completedAt`, `status: "succeeded"`.
6. Catch everything: an unhandled throw inside `after()` must not leave a row stuck in `running`.

---

## 10. API surface

### `POST /api/imports/preview`
Multipart, field `file`. Parses, detects columns, groups by book, creates an `ImportBatch`
(`status: pending`, `stagedRows` populated).

```jsonc
// 200
{ "importBatchId": "...", "filename": "readwise.csv", "rowCount": 412,
  "headers": ["Highlight", "Book Title", "..."],
  "mapping": { "text": "Highlight", "title": "Book Title", "...": null },
  "groups": [ { "key": "...", "title": "Thinking, Fast and Slow",
                "author": "Daniel Kahneman", "rowCount": 87,
                "sampleTexts": ["...", "..."], "matchedBookId": "clx..." } ] }
```
Errors: 400 on non-CSV, >10 MB, zero rows, or no column mappable to `text`.

### `POST /api/imports/:id/commit`
```jsonc
{ "mapping": { "text": "Highlight", "title": "Book Title" },
  "groups": [ { "key": "...", "action": "new",   "book": { "title": "...", "author": "..." } },
              { "key": "...", "action": "merge", "bookId": "clx..." },
              { "key": "...", "action": "skip" } ] }
```
Per group: create or resolve the book, hash each row, `createMany({ skipDuplicates: true })`.
Marks the batch `committed`, clears `stagedRows`.
Returns `{ books: [{ bookId, title, imported, skipped }], totals: { imported, skipped } }`.

### `POST /api/books/:id/cover`
Multipart, field `file`. Accepts jpeg/png/webp up to 5 MB. `sharp` → 600px wide WebP, quality 82 →
`saveImage` → update `coverUrl` → delete the previous image if it was locally stored.

### `POST /api/books/:id/analysis?force=1`
1. Compute `highlightSetHash` from the book's current highlights. 400 if there are none.
2. Unless `force=1`, look for a `succeeded` analysis with the same
   `(highlightSetHash, promptVersion, model)`; if found return `{ analysisId, cached: true }`.
3. Otherwise insert `status: "queued"`, call `after(() => runAnalysis(id))`, return
   `{ analysisId, cached: false }` with 202.

### `GET /api/analyses/:id`
Returns `{ id, status, takeaways, chapters, chaptersMeta, error, costCents, highlightSetHash,
createdAt, completedAt }`. The client polls every 2 s while `queued` or `running`, backing off to
5 s after 60 s, and gives up at 5 minutes with a retry affordance.

### Server Actions
`actions/books.ts` — `createBook`, `updateBook`, `deleteBook`.
`actions/highlights.ts` — `updateHighlight` (recomputes `contentHash`), `deleteHighlight`.
All validate with Zod, scope by `currentUserId()`, and `revalidatePath` the affected route.

---

## 11. Frontend

| Route | Contents |
|---|---|
| `/` | Library grid: cover, title, author, highlight count, analysis badge (none / ready / stale). Empty state points at `/import` and `/books/new`. |
| `/import` | Four steps in one page: dropzone → column mapper → per-book group review → result summary with links to each book. |
| `/books/new` | Metadata form + cover uploader. |
| `/books/[id]` | Header (cover, metadata, Edit) and tabs: **Takeaways** · **Chapters** · **Highlights** (`?tab=` in the URL so citation links are shareable). |
| `/books/[id]/edit` | Metadata form + cover replace + delete book (confirm dialog). |

### Components

- **`AnalysisPanel`** (client) — Generate / Regenerate button, poll loop, status states
  (queued → running with elapsed timer → succeeded / failed with retry). Shows a **Stale** badge
  when the stored `highlightSetHash` differs from the book's current one.
- **`TakeawayCard`** — number, `title`, `body`, `theme` badge, and a row of citation chips
  (`H12`-style labels). Clicking a chip switches to the Highlights tab, scrolls the target into
  view, and flashes its background for ~1.2 s. Implement with an `id={"h-" + highlight.id}` anchor
  plus `scrollIntoView({ block: "center" })` — no scroll library.
- **`ChapterAccordion`** — banner first: *"Reconstructed from the model's knowledge of this book,
  not from your highlights — verify against your copy."* One row per chapter with a confidence dot
  (green / amber / grey). When `bookRecognized` is false, render only an explanatory empty state
  and the `caveat`; never an empty accordion.
- **`HighlightList`** — client-side search box (substring over text and note), count, inline edit
  and delete via Server Actions. Switch to `react-virtuoso` above 300 items.
- **`CoverUploader`** — drag-and-drop, instant local preview, 5 MB client-side guard, uploads to
  the cover route, replaces the preview with the returned URL.
- **`BookCard`**, **`EmptyState`**, **`MetadataForm`** (shared by new and edit; the same Zod schema
  as the server action).

### Visual direction

Reading-first. Serif (`ui-serif, Georgia`) for highlight and takeaway body text, system sans for
chrome. Generous line height (1.7) and a `max-w-[68ch]` measure on prose. Muted palette with a
single accent used only for actions and citation chips. Light and dark via CSS custom properties on
`:root` and `.dark`. Mobile-first: the library grid is one column under 640px, tabs stay horizontal
and scrollable.

---

## 12. Testing

`vitest`, unit level only. Required cases:

1. `detect.ts` maps a real Readwise header row correctly, and returns `null` for unknown fields.
2. `normalizeForHash` collapses whitespace, smart quotes, and a trailing ellipsis so three visually
   different variants of one highlight produce one hash.
3. `group.ts` splits a mixed two-book fixture into exactly two groups and matches an existing book.
4. Re-importing the same fixture into the same book inserts 0 rows and reports the right skipped
   count (against a test database or a mocked `createMany`).
5. `highlightSetHash` is order-independent but text-sensitive.
6. `TakeawaysSchema` rejects an empty `highlightIds`, and rejects 2 or 6 takeaways.
7. The citation validator rejects an unknown `H<n>` id and produces the retry message.

---

## 13. Build order

Each phase ends runnable; do not start the next until the previous one is verified.

1. **Scaffold** — `create-next-app` (TS, Tailwind, App Router, `src/`), shadcn init, `.env.example`,
   `lint` / `test` / `seed` scripts, `public/uploads/` gitignored.
2. **Data layer** — `schema.prisma`, first migration, `lib/db.ts`, `lib/user.ts`, `lib/hash.ts`,
   `fixtures/readwise-sample.csv`, `prisma/seed.ts`.
3. **Books** — library page, `/books/new`, `/books/[id]/edit`, Server Actions, `lib/storage.ts`,
   cover route, `CoverUploader`.
4. **Import** — `lib/csv/*`, preview and commit routes, the four-step `/import` page.
5. **Highlights tab** — list, search, inline edit, delete, virtualization threshold.
6. **AI layer** — `schemas.ts`, `prompts.ts`, `takeaways.ts`, `chapters.ts`, `map-reduce.ts`,
   `cost.ts`, unit tests. Verifiable from a script before any UI exists.
7. **Analysis job** — `run.ts`, analysis + poll routes, `AnalysisPanel`, `TakeawayCard`,
   `ChapterAccordion`, stale detection, cache-hit path.
8. **Polish** — empty states, loading skeletons, `error.tsx` boundaries, README with setup steps.

---

## 14. Acceptance checklist

- [ ] `npx prisma migrate dev && npm run seed` creates 2 books and ~40 highlights from the fixture.
- [ ] `npm test` passes all cases in §12.
- [ ] Importing `fixtures/readwise-sample.csv` shows two groups, and committing creates two books.
- [ ] Importing the same file again imports **0** highlights and reports the skipped count.
- [ ] A cover uploads, is re-encoded to WebP, and renders on both the library and detail pages.
- [ ] Generating an analysis returns 3–5 takeaways, each with at least one working citation chip
      that scrolls to and flashes the right highlight.
- [ ] The chapters section shows the epistemic banner; for an invented title it shows the
      `bookRecognized: false` empty state rather than a fabricated outline.
- [ ] Regenerating without changing highlights returns instantly with `cached: true`.
- [ ] Editing or adding a highlight flips the analysis to **Stale**.
- [ ] `costCents`, `tokensIn`, `tokensOut` are non-null and plausible after a real run.
- [ ] On a map-reduce run (a book with 300+ highlights), `cachedTokensRead > 0`.
- [ ] Killing the chapters call still yields a `succeeded` analysis with takeaways intact.
- [ ] No unhandled rejection leaves an analysis stuck in `running`.

---

## 15. Out of scope for v1

Paste and manual highlight entry · Kindle `My Clippings.txt` · OCR from page photos · Open Library
and Google Books metadata lookup · authentication and multi-user · export to Markdown or Obsidian ·
semantic search over highlights · cross-book theme synthesis · reading-progress tracking.

Anything here that becomes necessary gets a new spec section and a `PROMPT_VERSION` bump if it
touches generation.
