# Book Highlights — codebase handoff

Written for an AI agent picking this repo up cold. Current as of `main` @ `c63c7f6`.

`SPEC.md` is the original v1 specification and still the best explanation of *why*
the design is what it is. It is no longer a complete description of *what exists* —
see [§5](#5-where-the-code-has-moved-past-specmd).

---

## 1. What the app does

A personal web app for readers. You import the highlights you saved while reading
(CSV / Readwise export), attach book metadata and a cover, and the app produces:

1. **Takeaways** — 3–5 points about the book, derived *only* from your highlights,
   each citing the highlight ids it came from. This is the personalized artifact.
2. **Chapter outline** — a chapter-by-chapter summary from the model's own knowledge
   of the book, produced **without** ever seeing your highlights, so you can see what
   you skipped.

Domain objects, in dependency order: **Book** → **Highlight** → **Analysis**.

## 2. Stack and commands

Next.js 15 (App Router) · React 19 · TypeScript strict · Prisma 6 / Postgres ·
Tailwind v4 · Auth.js v5 · vitest · papaparse · sharp · Vercel Blob.

| Command | Notes |
|---|---|
| `npm run dev` | Dev server. |
| `npm run lint` | `tsc --noEmit`. No ESLint in this repo. |
| `npm test` | vitest, 81 tests, no DB or API key needed. |
| `npm run build` | `prisma generate` then `next build`. **Does not migrate.** |
| `npm run seed` | Fixture data, owned by `userId "local"`. |
| `npx tsx scripts/try-analysis.ts` | Exercises the AI layer alone. Costs real tokens. |
| `npx tsx scripts/claim-library.ts <email>` | Moves pre-account data to an account. |

## 3. Architecture — the load-bearing decisions

Do not "simplify" these away without saying why. Each is deliberate.

- **Two model calls, never one.** Takeaways are *grounded* (highlights only);
  chapters are *recalled* (model knowledge only, highlights never in context).
  Merging them silently turns the outline into a summary of what the reader
  happened to highlight, which defeats its purpose. `src/lib/ai/run.ts` runs both
  under `Promise.allSettled`; chapters failing must never cost the user takeaways.
- **Every takeaway cites highlight ids**, validated server-side against the ids
  actually sent (`src/lib/ai/citations.ts`). An unknown id triggers one retry that
  names the offenders, then dropping, then failing the job.
- **`bookRecognized: false` is a success, not an error** (`src/lib/ai/chapters.ts`).
  A fabricated outline for an obscure book is the fastest way to make the app
  untrustworthy. Never retry it.
- **Analyses are append-only and content-addressed** by
  `(bookId, highlightSetHash, promptVersion, model)`. Regeneration is a free cache
  hit; editing a highlight changes the hash and marks the analysis stale with no
  invalidation logic anywhere.
- **Imports are idempotent by construction** — `sha256(normalizeForHash(text))`
  behind `@@unique([bookId, contentHash])`, inserted with `skipDuplicates`.
  Re-importing an unchanged file inserts exactly zero rows.
- **Generation is a job row, not a request/response.** `POST /api/books/:id/analysis`
  inserts `status: "queued"`, schedules `after(() => runAnalysis(id))`, returns 202;
  the client polls `GET /api/analyses/:id`.
- **Server Components read, Server Actions write, Route Handlers do the rest.**
  No fetch layer, no DTOs. Route handlers exist only for multipart upload, the CSV
  preview/commit pair, and the analysis job + poll.
- **The model API sits behind one seam** — `src/lib/ai/provider.ts` defines
  `AiProvider`; `providers/anthropic.ts` and `providers/gemini.ts` implement it.
  Everything above that line is provider-neutral.
- **Prompts are frozen strings with a cached prefix.** Editing a prompt **requires**
  bumping `PROMPT_VERSION` in `src/lib/ai/prompts.ts` — it is part of the analysis
  cache key, and editing without bumping silently serves old-prompt output.

## 4. Repo map

```
prisma/          schema.prisma, migrations/, seed.ts
fixtures/        readwise-sample.csv, quote-export-sample.csv
scripts/         try-analysis.ts, claim-library.ts
src/auth.config.ts   edge-safe auth config (middleware imports only this)
src/auth.ts          Auth.js + Credentials provider (bcrypt + Prisma; Node only)
src/middleware.ts    the access gate
src/app/             routes, pages, API route handlers
src/actions/         Server Actions: books, highlights, auth
src/components/      UI; import/ holds the CSV flow
src/lib/             db, user, hash, storage, accounts, verification, email,
                     auth-constants, analysis, csv/, ai/
tests/               vitest (9 files, 81 tests)
```

## 5. Where the code has moved past SPEC.md

An audit against `SPEC.md` found the v1 spec **fully implemented**. Four things then
grew beyond it. None are documented in `SPEC.md`; treat this section as the addendum.

1. **Provider seam.** SPEC §5/§9.1 specify a flat `lib/ai/client.ts` exporting an
   Anthropic client. Reality is the `AiProvider` interface plus two implementations.
2. **LLM-assisted CSV column mapping.** SPEC §8.3 describes header detection only.
   Reality is three passes: header detection → remembered `ColumnAlias` rows → one
   model call for whatever is still unrecognized, written back as a `user` alias.
   `src/lib/csv/resolve.ts`, `src/lib/ai/columns.ts`.
3. **Multi-file import.** SPEC §11 describes one file through four steps. Reality
   accepts many files, previews each, and only demands column approval for files
   with headers that are neither mapped nor deliberately ignored.
4. **Accounts and multi-tenancy.** SPEC §15 lists auth and multi-user as explicitly
   out of scope. Both now exist. See §6.

Known gap against the spec's own text: **`/books/new` has no cover uploader**
(SPEC §11 lists one). Only `/books/[id]/edit` does. Blocked on sequencing — the
cover route needs a `bookId` that does not exist until `createBook` runs.

## 6. Recent changes (newest first)

| Commit | What |
|---|---|
| `c63c7f6` | Keep tsx scripts clear of the auth runtime. |
| `8f3e46f` | Replace the single-account gate with email/password accounts. |
| `3363254` | Gate the app behind a single-account sign-in; deploy prep. |
| `4a9835a` | Import many CSVs at once, asking only about unsettled columns. |

### Accounts (`8f3e46f`) — the big one

Anyone can register with email + password; **each account has a private library**.
`userId` was already on `Book` and `ColumnAlias` (SPEC §4.10 put it there for exactly
this), so multi-tenancy became a change to what `currentUserId()` *returns* — but it
now reads the session and is therefore **async at all 13 call sites**.

Email must be confirmed before sign-in. A single-use 6-digit code (CSPRNG), 10-minute
expiry, dead after 5 wrong guesses, reissuable once a minute. **Only a sha256 is
stored**, so the database never holds a live code. `src/lib/verification.ts` holds the
pure rules; `src/actions/auth.ts` the persistence.

Auth.js is split in two because middleware runs on the **edge** where bcrypt and
Prisma cannot go: `src/auth.config.ts` (edge-safe) vs `src/auth.ts` (full).

Rows predating accounts carry `userId "local"` and are invisible to every account —
not deleted. `scripts/claim-library.ts <email>` hands them to a confirmed account.

## 7. Open work, most important first

### 7.1 ~~SECURITY — import commit accepts any batch id~~ — FIXED

`ImportBatch` now carries `userId` (migration `20260902000000_import_batch_owner`,
defaulting to `'local'` like `Book` and `ColumnAlias`). The preview route stamps the
owner on the batch; the commit route looks it up with
`findFirst({ where: { id, userId } })`, so another account's batch reads as 404. The
stale-batch sweep in the preview route is scoped to the caller too, instead of
deleting everyone's expired pending batches.

The migration is written but **not applied** — apply it with `prisma migrate deploy`
against the direct/unpooled `DATABASE_URL` before deploying.

### 7.2 Open registration bills one shared key

Deliberate, chosen by the owner after the tradeoff was raised. Every account's
analysis runs bill to the single configured provider key, so a public deployment is a
publicly usable API key. Mitigations if this becomes a problem: invite codes, a domain
allowlist, per-user cost caps, or users supplying their own key.

### 7.3 Deployment is prepared but not done

`README.md` § Deploying has the full sequence. Nothing is provisioned yet. Watch:
`STORAGE_DRIVER` must be `blob` (serverless filesystems are ephemeral and read-only);
`RESEND_API_KEY` must be set or confirmation codes only reach a server log nobody
reads, and no signup can complete; `maxDuration = 300` on the analysis route needs
Fluid Compute on Vercel Hobby.

### 7.4 Smaller items

- Column-matcher token usage is discarded — `matchColumns()` in
  `src/lib/ai/columns.ts` returns `usage`; `src/lib/csv/resolve.ts` destructures only
  `{ assignments }`. A cost blind spot; persisting it needs a new `ImportBatch` field.
- No cover uploader on `/books/new` (§5).
- `SPEC.md` has no section covering §5's four divergences. The spec's own closing note
  says changes like these should get one.
- No password reset flow exists.

## 8. Gotchas that will bite you

- **`currentUserId()` is async.** `await` it. It **throws** when there is no session
  rather than falling back — a query that ran unscoped would leak another account's
  library.
- **`src/lib/auth-constants.ts` must import nothing.** Two kinds of caller depend on
  it: client components (which cannot take `node:crypto` or bcrypt into the browser
  bundle) and standalone `tsx` scripts (which would otherwise boot Auth.js). Importing
  `verification.ts` into a client component **fails the build**; both mistakes have
  already been made once here.
- **Windows: `prisma generate` fails with `EPERM`** renaming
  `query_engine-windows.dll.node` while a dev server is running — the DLL is mapped.
  Stop the dev server first.
- **Migrations are never automatic.** `npm run build` runs `prisma generate` only.
  Apply with `prisma migrate deploy`, never `migrate dev`, and point `DATABASE_URL`
  at the **direct/unpooled** string — migrations cannot run through a
  transaction-mode pooler.
- **`after()` is not a queue.** The analysis job runs inside the request function, so
  a platform timeout kills the process outright and `run.ts`'s catch never fires.
  `GET /api/analyses/:id` sweeps rows stalled in `queued`/`running` past 10 minutes.
- **Every page is dynamic (`ƒ`)** because the root layout reads the session. Expected.
- **Switching `AI_PROVIDER` marks existing analyses stale** — `model` is part of the
  cache key. That is intended, not a bug.
- Locally, confirmation codes are printed to the `npm run dev` terminal when
  `RESEND_API_KEY` is unset. No mail vendor needed for development.

## 9. Verifying a change

```bash
npm run lint     # tsc --noEmit
npm test         # 81 tests, no DB or key needed
npm run build    # catches client/server bundle violations the others miss
```

Run all three. The build is the only one that catches a Node-only import reaching a
client component, and `tsc` alone will happily let that through.

For an end-to-end check: apply migrations, `npm run seed`, register at `/signup`, read
the code off the dev terminal, confirm, then
`npx tsx scripts/claim-library.ts <your-email>` to see the seeded books.
