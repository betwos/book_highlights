# Book Highlights → Personalized Takeaways

A personal web app for one reader. Import the highlights you saved while reading, attach the
book's metadata and cover, and get two things back:

- **Takeaways** — 3 to 5 points about the whole book, derived *only* from what you highlighted.
  Every takeaway cites the highlights it came from, and the citation chips are clickable.
- **Chapter outline** — a chapter-by-chapter summary produced *without* reference to your
  highlights, so you can see what you skipped as well as what you kept.

The full design rationale is in [SPEC.md](./SPEC.md).

## Setup

Requires Node 22+ and a hosted Postgres connection string (Neon or Supabase free tier). There is
no Docker and no local Postgres.

```bash
npm install
cp .env.example .env           # fill in DATABASE_URL and ANTHROPIC_API_KEY
npx prisma migrate dev         # applies prisma/migrations
npm run seed                   # 2 books, 40 highlights from fixtures/readwise-sample.csv
npm run dev
```

Use `.env`, not `.env.local`. The Prisma CLI reads only `.env`, while Next.js reads both (with
`.env.local` winning where they overlap), so keeping everything in `.env` means `prisma migrate`
and the running app see the same values. Both files are gitignored.

| Variable | Notes |
|---|---|
| `DATABASE_URL` | Pooled Postgres connection string. |
| `ANTHROPIC_API_KEY` | Used for analysis generation only. |
| `STORAGE_DRIVER` | `local` (writes to `public/uploads/`, gitignored) or `blob`. |
| `BLOB_READ_WRITE_TOKEN` | Only when `STORAGE_DRIVER=blob`. |
| `AI_PROVIDER` | Optional, defaults to `anthropic` — the only implementation today. |
| `ANTHROPIC_MODEL` | Optional, defaults to `claude-opus-5`. Pricing follows the model. |
| `MAP_REDUCE_TOKEN_THRESHOLD` | Optional, defaults to `120000`. Lower it to exercise map-reduce. |

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Next dev server. |
| `npm run build` | `prisma generate` then a production build. |
| `npm test` | Vitest unit suite (no database or API key needed). |
| `npm run lint` | `tsc --noEmit`. |
| `npm run seed` | Imports the fixture CSV into the database. |
| `npx tsx scripts/try-analysis.ts` | Runs the AI layer against the fixture, no database, no UI. Costs real tokens. |

## How it works

- **Reads** happen in Server Components calling Prisma directly. **Mutations** are Server Actions.
  **Route Handlers** exist only for multipart upload, the CSV preview/commit pair, and the
  analysis job plus its poll endpoint.
- **Two model calls, never one.** Takeaways are grounded in your highlights; the chapter outline
  is recalled from the model's own knowledge and never sees them. Folding them together would
  quietly turn the outline into a summary of the chapters you happened to highlight.
- **Analyses are append-only and content-addressed** by `(bookId, highlightSetHash, promptVersion,
  model)`. Regenerating without changing anything is a cache hit and costs nothing; adding or
  editing a highlight changes the hash and marks the analysis **Stale** with no invalidation logic
  anywhere.
- **Imports are idempotent by construction.** Highlights are deduped on
  `sha256(normalizeForHash(text))` behind a unique constraint, so re-importing next month's
  cumulative Readwise export inserts only the new rows.
- **The model API sits behind one seam.** `src/lib/ai/provider.ts` defines an `AiProvider`
  interface — `generateStructured`, `countTokens`, `describeError`, plus a pricing table —
  and `src/lib/ai/providers/anthropic.ts` implements it. Everything above that line is
  provider-neutral: prompts, schemas, citation validation, map-reduce, the job row, the UI.
  Adding a provider means writing one file and registering it in `FACTORIES`.
  Worth knowing before you do: prompt caching (the frozen system prefix), adaptive thinking, and
  the effort setting have no clean cross-provider equivalent, so a second implementation either
  gives up the cache saving or approximates it, and token counting is provider-specific.
- **Editing a prompt requires bumping `PROMPT_VERSION`** in `src/lib/ai/prompts.ts`. It is part of
  the analysis cache key; editing a prompt without bumping it serves output from the old prompt.

## Layout

```
prisma/          schema, migrations, seed
fixtures/        readwise-sample.csv — 2 books, 40 highlights
scripts/         try-analysis.ts — exercise the AI layer alone
src/app/         routes and route handlers
src/actions/     Server Actions (books, highlights)
src/components/  UI
src/lib/         db, hash, storage, csv/
src/lib/ai/      provider.ts (the seam) + providers/, prompts, schemas, citations, run
tests/           vitest
```
