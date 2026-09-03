# Book Highlights — codebase handoff

Written for an AI agent picking this repo up cold. Current as of `main` @ `592ef6a`.

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
| `npm test` | vitest, 66 tests, no DB or API key needed. |
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
src/lib/             db, user, hash, storage, accounts, auth-constants,
                     analysis, csv/, ai/
tests/               vitest (9 files, 66 tests)
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
| `592ef6a` | Drop email confirmation — registration is one step, no mail vendor. |
| `4448596` | Give staged imports an owner — closes the import-commit ownership hole. |
| `c63c7f6` | Keep tsx scripts clear of the auth runtime. |
| `8f3e46f` | Replace the single-account gate with email/password accounts. |
| `3363254` | Gate the app behind a single-account sign-in; deploy prep. |
| `4a9835a` | Import many CSVs at once, asking only about unsettled columns. |

### Accounts (`8f3e46f`) — the big one

Anyone can register with email + password; **each account has a private library**.
`userId` was already on `Book` and `ColumnAlias` (SPEC §4.10 put it there for exactly
this), so multi-tenancy became a change to what `currentUserId()` *returns* — but it
now reads the session and is therefore **async at all 13 call sites**.

Auth.js is split in two because middleware runs on the **edge** where bcrypt and
Prisma cannot go: `src/auth.config.ts` (edge-safe) vs `src/auth.ts` (full).

Rows predating accounts carry `userId "local"` and are invisible to every account —
not deleted. `scripts/claim-library.ts <email>` hands them to a registered account.

### No email confirmation (`592ef6a`)

There was a confirmation step — a single-use 6-digit code, hashed at rest — and it is
gone. `register` now creates the account and signs it in within the one request;
`authorize` checks the password and nothing else. Deleted with it: `lib/verification.ts`,
`lib/email.ts`, `/verify`, `VerifyForm`, the `resend` dependency, and the
`VerificationCode` table and `User.emailVerified` column
(`20260903000000_drop_email_confirmation`, destructive both ways).

**What this costs, stated plainly.** An address used to be proven before it could be a
login. Nothing proves it now, so a stored address is a login and not a way to reach
anyone — and `isEmailShaped` in `accounts.ts`, written as a cheap typo check standing in
front of the real validation, *is* the validation now. Reintroducing anything that mails
a user (a password reset, most obviously) means bringing a mail vendor back from zero.

### Import batch ownership (`4448596`)

`ImportBatch` now carries `userId` (default `"local"`, index on
`(userId, status, createdAt)`). This closed a real hole: the commit route matched a
batch on **id alone**, so any signed-in account that knew a pending batch's cuid could
import another account's staged highlight text into its own books. Preview now stamps
the owner, commit looks the batch up with `findFirst({ where: { id, userId } })` — so
someone else's batch reads as 404, not as importable — and the 24h stale-batch
housekeeping is scoped to the caller instead of deleting everyone's expired batches.

The migration is `20260902000000_import_batch_user`, and it is additive: `ADD COLUMN
... DEFAULT 'local'` plus the index, no data rewritten.

## 7. Open work, most important first

### 7.1 Deployment is prepared but not done

`README.md` § Deploying has the full sequence. Nothing is provisioned on Vercel yet.

**The database is the exception, and it is not what the README's step 1 assumes.** The
Neon database in `.env` is no longer a scratch DB — it holds the owner's real library
(one verified account, 19 books, 2362 highlights, 22 analyses, zero rows owned by
`"local"`), and **all four migrations are already applied to it**. The intent is to
promote that database to production rather than provision a second one, which makes
README steps 3 and 5 no-ops here. Two consequences worth knowing before you touch it:

- Never run `npm run seed` or `prisma migrate dev` against `DATABASE_URL` as it stands.
  `migrate dev` can reset data, and seeding injects fixture rows into a live library.
- `scripts/claim-library.ts` has nothing to claim — there are no `"local"`-owned rows.

Still genuinely outstanding: import the repo as a Vercel project, add a Blob store, and
set the environment. (No mail vendor — the app sends no email since `592ef6a`.) The
variables that fail *silently* rather than loudly:

- `STORAGE_DRIVER` must be `blob` — serverless filesystems are ephemeral and read-only,
  so covers would vanish. (No covers exist yet, so nothing needs migrating into Blob.)
- The provider key must match `AI_PROVIDER`. This deployment runs `gemini`, so
  `GEMINI_API_KEY` is the one that matters; an `ANTHROPIC_API_KEY` alone leaves every
  analysis run broken.
- `AUTH_SECRET` must be real (`npx auth secret`) and stable. A fresh one is safe —
  passwords are bcrypt rows in the database — it only signs existing sessions out.

Also confirm **Fluid Compute** is on: the analysis route declares `maxDuration = 300`
and classic Hobby serverless caps at 60s.

### 7.2 Open registration bills one shared key

Deliberate, chosen by the owner after the tradeoff was raised. Every account's
analysis runs bill to the single configured provider key, so a public deployment is a
publicly usable API key. Cheaper to abuse since `592ef6a` removed address confirmation:
signing up no longer costs an attacker even a working mailbox. Mitigations if this becomes a problem: invite codes, a domain
allowlist, per-user cost caps, or users supplying their own key.

### 7.3 Smaller items

- Column-matcher token usage is discarded — `matchColumns()` in
  `src/lib/ai/columns.ts` returns `usage`; `src/lib/csv/resolve.ts` destructures only
  `{ assignments }`. A cost blind spot; persisting it needs a new `ImportBatch` field.
- No cover uploader on `/books/new` (§5).
- `SPEC.md` has no section covering §5's four divergences. The spec's own closing note
  says changes like these should get one.
- No password reset flow exists, and since `592ef6a` there is no mail vendor to build one
  on. Sharper than it reads: the only account is the owner's, so a forgotten password
  means a manual database edit, not a support ticket.

## 8. Gotchas that will bite you

- **`currentUserId()` is async.** `await` it. It **throws** when there is no session
  rather than falling back — a query that ran unscoped would leak another account's
  library.
- **`src/lib/auth-constants.ts` must import nothing.** Two kinds of caller depend on
  it: client components (which cannot take bcrypt into the browser bundle) and
  standalone `tsx` scripts (which would otherwise boot Auth.js). Importing `accounts.ts`
  into a client component **fails the build**; that mistake has been made once here.
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

## 9. Verifying a change

```bash
npm run lint     # tsc --noEmit
npm test         # 66 tests, no DB or key needed
npm run build    # catches client/server bundle violations the others miss
```

Run all three. The build is the only one that catches a Node-only import reaching a
client component, and `tsc` alone will happily let that through.

For an end-to-end check: apply migrations, `npm run seed`, register at `/signup` — which
lands you signed in — then `npx tsx scripts/claim-library.ts <your-email>` to see the
seeded books.
