# last-light-armory

_Last updated: 2026-07-19 — update this line whenever the file changes materially._

## Testing Policy (set 2026-07-18, e2e added 2026-07-19)

**Test coverage must stay above 98%**, enforced in CI-runnable commands, not
by convention. `web/` uses Vitest + React Testing Library with v8 coverage
thresholds (statements/branches/functions/lines ≥ 98) wired into
`npm run test:coverage` — the command fails if coverage drops. When
`scoring/` exists, its Go tests are held to the same bar via
`go test -cover ./...`. New code lands with its tests in the same change.

**e2e (Playwright) is a separate signal, not folded into the 98% number.**
`web/e2e/**/*.spec.ts` drives a real headless browser against the actual
production build (`next build` + `next start`, per Next's own testing
guidance — closer to what ships than `next dev`). It runs in its own CI
job (`e2e`, alongside `lint`/`test`/`build` in `web-ci.yml`) and catches
what unit tests structurally can't: real client-side navigation, real
`bungie.net` asset loading, real static-page output for all 2,208
generated routes, real HTTP status codes. Coverage thresholds don't apply
to it — an e2e suite optimizes for a handful of meaningful user flows, not
line coverage. Several e2e specs assert against specific real weapons
(e.g. Fatebringer, Timelines' Vertex) rather than fixtures — same
committed-export coupling as `lib/data.test.ts`; a future re-export that
renames or removes one of those weapons is the expected reason such a
test would need updating, not a mystery flake.

**Every generated endpoint is swept, not sampled.** `e2e/all-weapons.spec.ts`
hits all ~2,208 `/weapons/<hash>` routes plus `/` and an invalid hash,
against the real running production server. It's HTTP-level (Playwright's
`request` fixture), not full `page.goto()` rendering — a deliberate
tradeoff: `app/weapons/[hash]/page.tsx` is a pure Server Component with no
client-only behavior, so asserting the response is 200 and contains that
specific weapon's own (HTML-escaped) name already proves what a full
browser render would for this route shape, at a fraction of the cost
(~9s for all 2,208 in CI, batched for Playwright's own worker
parallelism). Full browser rendering — hydration, real navigation, real
asset loading — stays on the curated specs in `weapon-detail.spec.ts` /
`navigation.spec.ts` for a representative sample rather than repeating
that cost 2,208 times. Verified this sweep actually catches drift, not
just green-by-luck: deliberately mismatched one weapon's index name
against its detail file and confirmed exactly that weapon's batch failed
with a precise message, all others stayed green.

## What This Repo Is

Two genuinely different things living in one repo:

1. **A Next.js (App Router, TypeScript, Tailwind) site, deployed to Vercel.**
   Reads only committed static JSON. No live database access, no API routes
   that touch Postgres, ever.
2. **A scoring job** — code owned by this repo, private-network cron,
   mirroring ingest's operational shape (confirmed 2026-07-06). Never
   deploys to Vercel.

This repo implements Milestones 6–10 of the master spec.

**Scoring job execution: private-network cron, confirmed 2026-07-06.**
Reasoning worth keeping on record: this isn't just "mirror ingest for
consistency" — a cron self-heals. Every time ingest adds new weapons/rolls
(even on its own slow cadence), those rows land with NULL scores. A
scheduled scoring run picks them up automatically; a purely manual job
requires you to remember that ingest ran and go trigger scoring yourself.
One nuance this doesn't need from ingest: **no version-check gate.** Ingest
checks the manifest version first because skipping unchanged work avoids
hammering Bungie's rate-limited API. Scoring has no external API and no
expensive fetch — recomputing all ~101k rolls is a local, cheap operation,
so the job can just unconditionally recompute every run rather than trying
to detect "did anything change" first. Simpler, and nothing to get wrong.
That also means there's no separate manual-override flag needed the way
ingest has `-force` — `go run ./cmd/score` always does a full recompute,
so running it by hand right after tuning a weight and letting the cron run
it later are literally the same command, not two modes.

**Deliberately NOT auto-coupled to publish.** The scoring cron updates
Postgres; it does not itself run `cmd/export` or push anything. Publishing
stays its own step (see Publish Flow below, unchanged from ingest's own
todo.md recommendation) — otherwise every scheduled scoring tick would
trigger a JSON re-export and (eventually) a site rebuild whether or not
you're actually ready to publish new numbers. My call, easy to revisit if
you'd rather they run as one chained job.

## Why This Structure

Per `last-light-armory-ingest`'s CLAUDE.md/README/todo.md (confirmed
2026-07-06): Postgres is self-hosted and never exposed to the public
internet. The only data that ever leaves that network is static JSON baked
by ingest's `cmd/export`. That constraint is what forces the split above —
there is no world where the public Next.js site queries Postgres directly.

## Fix Needed Before the Scoring Job Runs Its First Migration

Verified directly in ingest's code (not assumed): `schema_migrations` is
golang-migrate's default tracking table, and ingest uses that default with
no override anywhere in its codebase. If the scoring job also runs
golang-migrate against the same `DATABASE_URL` with the default name, it
collides with ingest's already-in-use table. Use an explicit, different name
from the start:

```go
migrate.NewWithDatabaseInstance(
    "file://migrations", "postgres", driver,
    database.WithMigrationsTable("last_light_armory_scoring_migrations"),
)
```

This was not addressed on the ingest side — it's still an open gap, not
something already handled.

## Two Things Worth Knowing, Not Blocking Anything

- `last-light-armory-ingest/todo.md` says "13 commits, not yet pushed." That's
  stale — the branch is on the remote right now (20 commits total). Doesn't
  affect anything here, just don't trust that line if you reread it.
- **"Archetype is the weapon type"** (ingest's decision) is a real
  simplification worth being deliberate about. Most of the D2 community
  treats RPM+frame as the archetype — a 140rpm and 180rpm Hand Cannon are
  different archetypes to most players despite sharing `weapon_type`. RPM is
  still stored and filterable, so no data is lost — just flagging it so an
  "Archetype" filter/heading on the site being identical to "Weapon Type" is
  a choice, not a surprise.

## Ownership Split (matches ingest's CLAUDE.md)

| Concern | Owner |
|---|---|
| `weapon`, `perk`, `weapon_perk`, `roll`, `roll_perk` — structure & Bungie-sourced columns | ingest |
| `perk.pve_score` / `pvp_score`, `roll.*_score`, `weapon_ranking.*` | **this repo's scoring job** (writes, not just reads) |
| `scoring_config`, `perk_synergy`, `tier_cutoff`, `roll_variant` — new tables | **this repo's scoring job** |
| Static JSON consumption + rendering | **this repo's Next.js app** |

## The Scoring Job

**Pipeline (runs on its own cron, decoupled from export/publish — see above)**:
read weapon/perk/roll identity data (written by ingest) plus this repo's own
`scoring_config` / `perk_synergy` tables → compute every roll's
PvE/PvP/overall score → compute weapon-level ranking (best single roll
represents the weapon — confirmed, see trade-off note below) → write
`roll.*` and `weapon_ranking.*`. Stops there — exporting and publishing are
separate, manually-triggered steps (see Publish Flow), not chained onto this
job.

**"Best single roll" trade-off, on record**: this ranks on ceiling, not
consistency. A weapon with one exceptional roll and an otherwise mediocre
pool ranks identically to one where every roll is solid. Confirmed choice,
not an accident.

**Weights and cutoffs: database-driven, not code.** The spec's own "keep the
scoring engine modular" and "adjust after testing" both describe a tuning
loop you'll repeat often — a DB table means an `UPDATE`, a code/config-file
approach means a rebuild and redeploy every time a number changes. The
formula's *shape* stays in Go code; the *numbers* live in Postgres.

Starting weights (placeholder — tune after testing):

```
column1_weight = 0.10   column2_weight = 0.10   column3_weight = 0.30
column4_weight = 0.30   column5_weight = 0.20
```

**"Weapon/frame modifiers" is still undefined** — the spec names it, doesn't
say what it modifies or by how much. Needs a concrete rule before this job
is written for real.

**Exotics and non-craftable Legendaries (confirmed 2026-07-06)**: included,
scored on base perks as their ceiling — same `preferEnhanced()` fallback
ingest's code already does when no enhanced variant exists, unchanged. These
weapons flow through the identical scoring/expansion pipeline as any
craftable weapon; no special-casing needed anywhere here.

### New tables (this repo's own migrations)

```sql
CREATE TABLE scoring_config (
    id             SMALLINT PRIMARY KEY DEFAULT 1,
    column1_weight NUMERIC(4,3) NOT NULL DEFAULT 0.10,
    column2_weight NUMERIC(4,3) NOT NULL DEFAULT 0.10,
    column3_weight NUMERIC(4,3) NOT NULL DEFAULT 0.30,
    column4_weight NUMERIC(4,3) NOT NULL DEFAULT 0.30,
    column5_weight NUMERIC(4,3) NOT NULL DEFAULT 0.20,
    top_n_variants SMALLINT NOT NULL DEFAULT 15,  -- trait+origin rolls/weapon expanded into barrel/mag variants
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (id = 1)
);

-- hand-curated pairwise synergy bonuses (e.g. Rewind Rounds + Feeding Frenzy)
CREATE TABLE perk_synergy (
    perk_a_id BIGINT NOT NULL REFERENCES perk(id),
    perk_b_id BIGINT NOT NULL REFERENCES perk(id),
    pve_bonus NUMERIC(5,2) NOT NULL DEFAULT 0,
    pvp_bonus NUMERIC(5,2) NOT NULL DEFAULT 0,
    note      TEXT,
    PRIMARY KEY (perk_a_id, perk_b_id),
    CHECK (perk_a_id < perk_b_id)
);

-- editable tier boundaries, same "adjust after testing" spirit
CREATE TABLE tier_cutoff (
    tier      TEXT PRIMARY KEY,   -- 'S+', 'S', 'A+', 'A', 'B'
    min_score NUMERIC(5,2) NOT NULL
);

-- Barrel/magazine-expanded variants of the top-scoring trait+origin rolls.
-- Generated AFTER roll.overall_score exists (expansion needs scores to know
-- which rolls are worth expanding). This table is the entire universe of
-- what community voting can select from — nothing outside it is votable.
CREATE TABLE roll_variant (
    id               BIGSERIAL PRIMARY KEY,
    roll_id          BIGINT NOT NULL REFERENCES roll(id) ON DELETE CASCADE,
    barrel_perk_id   BIGINT REFERENCES perk(id),   -- NULL if weapon has no barrel column
    magazine_perk_id BIGINT REFERENCES perk(id),   -- NULL if weapon has no magazine column
    pve_score        NUMERIC(5,2),
    pvp_score        NUMERIC(5,2),
    overall_score    NUMERIC(5,2),
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (roll_id, barrel_perk_id, magazine_perk_id)
);
```

Tier mapping from the spec (unchanged): 98–100 S+, 93–97 S, 88–92 A+, 82–87 A,
75–81 B.

## Roll Variants (Barrel/Magazine Resolution, Confirmed 2026-07-06)

Barrels and magazines should count toward what's considered a real "god
roll" — but pre-generating every barrel × magazine combination for every
trait+origin roll is the 1–2 billion row problem discussed earlier. The
resolution: **prune before you expand.**

1. Score every trait+origin `roll` exactly as already planned — unchanged.
2. Take the top `scoring_config.top_n_variants` (default 15) rolls per
   weapon by `overall_score`.
3. Expand *only those* across every barrel × magazine combination available
   on that weapon, applying a small flat adjustment for barrel/magazine
   choice (still "less weight" per the spec's own formula) rather than a
   full independent score per combination.
4. Store the result in `roll_variant`.

Real numbers: 15 × ~4 barrels × ~4 magazines × 2,208 weapons ≈ 530k rows —
nowhere near the unpruned 1–2 billion, and comfortably within what Postgres
and static export already handle.

**This is also the entire fix for "only legal rows, not every possible
combo"**: `roll_variant` rows are the only thing that's ever votable. Since
this set is now pre-generated and bounded (not open-ended), a vote is just a
foreign-key reference — `(roll_variant_id, voter_fingerprint, created_at)` —
against a row that already exists. No on-demand combo-key computation from
arbitrary player input needed; that only mattered when the votable space was
unbounded, and it no longer is.

## The Frontend

- Next.js App Router + TypeScript + Tailwind, deployed to Vercel
- Reads only committed artifacts: `data/meta.json`, `data/perks.json`,
  `data/weapons/index.json`, `data/weapons/<hash>.json` — same shape ingest's
  `cmd/export` produces
- Client-side filter/search over `index.json` (2,208 entries — trivial,
  no server search needed)
- `generateStaticParams` for weapon detail pages — SEO essentially free
- Icons served from `https://www.bungie.net` + the stored icon/watermark
  path (ingest's `000003_icons` migration)
- Zero environment variables related to Postgres or Bungie — this half of
  the repo has no secrets to manage at all

## Publish Flow (implemented 2026-07-19)

`./scripts/publish.sh`: runs ingest's `cmd/export` against the live
private-network Postgres, copies the result into `web/data/`, then a
safety gate (`npm run build && npm run test:coverage && npm run
test:e2e`) before committing — the e2e sweep in particular is exactly
what would catch bad/corrupt data here. Must be run from a clean,
up-to-date `dev` (or `BASE_BRANCH` override); always branches off rather
than committing directly, and only pushes — it never opens or merges a
PR, that stays a human step. No-op if nothing substantive changed:
`cmd/export` stamps a fresh `generated_at` on every run regardless of
whether the underlying data moved, so the diff check compares
`manifest_version`/`weapon_count`/`perk_count`/`roll_count` plus the
actual weapon/perk files, not raw bytes — a naive raw diff would create
a noise commit on literally every run.

Still manual/on-demand (run by hand when ingest has produced something
worth publishing) — automate into an unattended sync job later only if
re-exports become frequent enough to justify it, per ingest's own
`todo.md` recommendation. Not worth building now for something evergreen.

## Future: Community Voting (discussed 2026-07-06, not started)

Fantasy-football-style matchups: present two `roll_variant` rows for the
same weapon, user picks one, aggregate into a popularity/consensus signal
alongside curated scores. Needs a **new, separate write-capable store** —
the private Postgres can't take public writes, so this can't reuse it.
Candidates: Vercel Postgres, Neon free tier, Vercel KV. A periodic job
(private network, like ingest) pulls tallies in, folds them into
`weapon_ranking.popularity_score` and/or a popularity column on
`roll_variant` itself, writes to the private DB, triggers a re-export.

## Repo Layout

```
last-light-armory/
  web/                       // Next.js app — Vercel root directory = web/
    app/
    public/
    data/                     // committed static JSON, consumed at build time
      meta.json
      perks.json
      weapons/
        index.json
        <hash>.json
    e2e/                      // Playwright specs — real browser, real production build
    package.json
    next.config.ts
    playwright.config.ts
  scoring/                    // private-network Go job — never deployed to Vercel
    cmd/
      score/
        main.go
    internal/
      db/
      scoring/
    migrations/               // scoring_config, perk_synergy, tier_cutoff only
    go.mod
  scripts/
    publish.sh                 // Phase 3: ingest export → web/data → commit → push
  CLAUDE.md
```

## Environment Variables

- `web/` (Next.js): none. No Postgres, no Bungie — pure static consumption.
- `scoring/` (Go job): `DATABASE_URL` only, same shared Postgres connection
  string as ingest. No Bungie API key needed here either.

## Commands

```
# scoring/ — private network only, cron or by hand — same command either way
go run ./cmd/score                                                                              # recompute & persist all scores
go test ./...

# example cron, mirroring ingest's own cadence
# 0 10 * * 1  cd /path/to/last-light-armory/scoring && ./score >> score.log 2>&1

# web/ — Vercel build
npm run dev
npm run build
npm test                # vitest, all suites
npm run test:coverage   # fails if coverage < 98% (see Testing Policy)
npm run build && npm run test:e2e   # playwright, real browser against the production build

# publish — separate, manually-triggered step, not chained onto scoring
./scripts/publish.sh    # copy ingest's export output in, commit, push
```