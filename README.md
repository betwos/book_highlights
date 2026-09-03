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
| `ANTHROPIC_API_KEY` | Analysis generation, when `AI_PROVIDER=anthropic`. |
| `GEMINI_API_KEY` | Analysis generation, when `AI_PROVIDER=gemini`. Set the key that matches the provider — the other one is ignored. |
| `STORAGE_DRIVER` | `local` (writes to `public/uploads/`, gitignored) or `blob`. |
| `BLOB_READ_WRITE_TOKEN` | Only when `STORAGE_DRIVER=blob`. |
| `AI_PROVIDER` | Optional, defaults to `anthropic`. `anthropic` or `gemini`. |
| `ANTHROPIC_MODEL` | Optional, defaults to `claude-opus-5`. Pricing follows the model. |
| `GEMINI_MODEL` | Optional, defaults to `gemini-3.5-flash`. Pricing follows the model. |
| `MAP_REDUCE_TOKEN_THRESHOLD` | Optional, defaults to `120000`. Lower it to exercise map-reduce. |
| `AUTH_SECRET` | Session signing key — `npx auth secret`. Required everywhere, including locally. |
| `RESEND_API_KEY` | Optional locally: with it unset, confirmation codes are printed to the server log instead of emailed. |
| `EMAIL_FROM` | Sender for confirmation emails. Needs a domain verified with Resend. |
| `AUTH_URL` | Production only — the deployed URL. |

## Accounts

Anyone can register with an email and a password, and each account gets its own
library: books, highlights, and remembered column mappings are scoped by `userId`
(SPEC 4.10 put that column there from day one for exactly this).

An address must be confirmed before it can sign in. Registering issues a
single-use six-digit code that expires in ten minutes; only a sha256 of it is
stored, so the database never holds a live code. Five wrong guesses kill it, and
a new one can be requested once a minute.

Locally you do not need a mail vendor. With `RESEND_API_KEY` unset the code is
written to the terminal running `npm run dev` — sign up, copy it from there, and
carry on.

Data created before accounts existed belongs to `userId` `"local"` and is
invisible to every account. It is not deleted; hand it to a registered address
with `npx tsx scripts/claim-library.ts you@example.com`.

Note that registration is open by design. Every account's analysis runs are billed
to the same provider key, so if the deployment is reachable publicly, that key is
exposed to whoever signs up.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Next dev server. |
| `npm run build` | `prisma generate` then a production build. |
| `npm test` | Vitest unit suite (no database or API key needed). |
| `npm run lint` | `tsc --noEmit`. |
| `npm run seed` | Imports the fixture CSV into the database. |
| `npx tsx scripts/try-analysis.ts` | Runs the AI layer against the fixture, no database, no UI. Costs real tokens. |
| `npx tsx scripts/claim-library.ts <email>` | Moves pre-account data (`userId` `"local"`) to a registered account. |

## Deploying

Vercel, with Postgres on Neon or Supabase and covers in Vercel Blob.

**1. Provision.** Import the repo as a Vercel project, add a Blob store (which issues
`BLOB_READ_WRITE_TOKEN`), and create a Resend API key with a verified sender domain.

For the database, decide which case you are in. A *separate* production database is the default —
dev seed data should not ship. But if the database you have been developing against already holds
data you intend to keep, promote **that one** rather than provisioning a second and migrating rows
across; see `HANDOFF.md` §7.1, which records that this is the situation here. The cost of promoting
it is that `DATABASE_URL` becomes production: no `npm run seed`, no `prisma migrate dev` against it
afterwards, ever. Either way, note both the pooled and direct (unpooled) connection strings.

**2. Configure.** Set every variable from the table above in the Vercel project. Four are easy to
get wrong:

- `STORAGE_DRIVER` **must** be `blob`. The `local` driver writes to `public/uploads/`, and a
  serverless filesystem is ephemeral and read-only — covers would vanish or fail to save.
- `RESEND_API_KEY` **must** be set. Without it the app falls back to logging confirmation codes to
  the server console, which in production means nobody can ever complete a signup.
- `AUTH_SECRET` must be a real generated secret (`npx auth secret`), and stable — changing it signs
  everyone out.
- The provider key must match `AI_PROVIDER`: `GEMINI_API_KEY` for `gemini`, `ANTHROPIC_API_KEY` for
  `anthropic`. Setting only the other one fails at analysis time, not at boot.

**3. Migrate.** `npm run build` runs `prisma generate`, not `migrate` — schema changes should not
fire on every deploy. Apply them once, by hand, pointing `DATABASE_URL` at the **direct** string,
because migrations cannot run through a transaction-mode pooler:

```bash
DATABASE_URL="<direct-unpooled-url>" npx prisma migrate status   # check first
DATABASE_URL="<direct-unpooled-url>" npx prisma migrate deploy
```

Use `migrate deploy`, never `migrate dev` — the latter can reset data. On a promoted database
(step 1) `status` will likely report everything already applied and `deploy` is a no-op.

**4. Check the function limit.** The analysis route declares `maxDuration = 300`. On Vercel Hobby
that needs Fluid Compute (the default for new projects); classic serverless caps at 60s. If a long
map-reduce is being cut short, either raise the limit or lower `MAP_REDUCE_TOKEN_THRESHOLD` so each
call does less work.

**5. Claim pre-account data, if there is any.** Books created before accounts existed belong to
`userId` `"local"` and no account can see them. Register, confirm the address, then run
`npx tsx scripts/claim-library.ts you@example.com` against the production database. Skip this
entirely when no such rows exist — on a promoted database whose books already belong to a real
account, the script has nothing to move.

Registration is open to anyone who can receive email. Analysis runs are billed to the single
provider key configured above, so a publicly reachable deployment is a publicly usable API key.

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
- **Column mapping is learned once, then free.** An import resolves headers in three passes:
  header detection, then decisions remembered in `ColumnAlias`, then one model call for whatever
  is still unrecognized. Whatever you press Import with is written back as a `user` alias, so a
  file whose highlight column is called `quote` (or `percent`, or `timestamp`) asks the model
  exactly once and maps itself from then on. The mapping is always shown and always editable —
  each field is tagged *from header*, *remembered*, or *matched by AI* — and if the API is down,
  detection and memory still apply and you map the rest by hand.
- **The model API sits behind one seam.** `src/lib/ai/provider.ts` defines an `AiProvider`
  interface — `generateStructured`, `countTokens`, `describeError`, plus a pricing table —
  and `src/lib/ai/providers/{anthropic,gemini}.ts` implement it. Everything above that line is
  provider-neutral: prompts, schemas, citation validation, map-reduce, the job row, the UI.
  Switch with `AI_PROVIDER=gemini` plus `GEMINI_API_KEY`; adding a third means writing one file
  and registering it in `FACTORIES`. Note that `model` is part of the analysis cache key, so
  switching provider marks existing analyses stale rather than serving another model's output.
  Worth knowing before you do: prompt caching (the frozen system prefix), adaptive thinking, and
  the effort setting have no clean cross-provider equivalent, so a second implementation either
  gives up the cache saving or approximates it, and token counting is provider-specific.
- **Editing a prompt requires bumping `PROMPT_VERSION`** in `src/lib/ai/prompts.ts`. It is part of
  the analysis cache key; editing a prompt without bumping it serves output from the old prompt.

## Layout

```
prisma/          schema, migrations, seed
fixtures/        readwise-sample.csv — 2 books, 40 highlights
                 quote-export-sample.csv — non-Readwise headers, exercises column matching
scripts/         try-analysis.ts — exercise the AI layer alone
src/auth.config.ts  edge-safe auth config (what middleware imports)
src/auth.ts      Auth.js + the credentials provider (bcrypt, Prisma)
src/middleware.ts  the access gate
src/app/         routes and route handlers
src/actions/     Server Actions (books, highlights)
src/components/  UI
src/lib/         db, hash, storage, csv/
src/lib/ai/      provider.ts (the seam) + providers/, prompts, schemas, citations, run
tests/           vitest
```
