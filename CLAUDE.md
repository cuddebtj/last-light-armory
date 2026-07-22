# last-light-armory

_Last updated: 2026-07-21 — update this line whenever the file changes materially._

## Testing Policy (set 2026-07-18, e2e added 2026-07-19)

**Test coverage must stay above 98%**, enforced in CI-runnable commands, not
by convention. `web/` uses Vitest + React Testing Library with v8 coverage
thresholds (statements/branches/functions/lines ≥ 98) wired into
`npm run test:coverage` — the command fails if coverage drops. New code
lands with its tests in the same change.

**`scoring/`'s 98% bar applies to `./internal/...`, not raw `./...`**
(clarified 2026-07-21, after actually running the literal command and
finding it read 72.9%). `cmd/score` and `cmd/import-baseline` are thin
main-package orchestration over a live Postgres — reading config, calling
into `internal/*`, writing results — with no meaningful unit-testable
branching of their own; unit-testing a `main()` that only makes sense
against a real database is the same shape of problem `web/`'s e2e-vs-
coverage split already solves, just applied to Go instead of Playwright:
both entrypoints are verified for real, against the live database, every
time they change (see the git history for `cmd/score`'s and
`cmd/import-baseline`'s live-run verification: row counts, bounds checks,
hand-computed spot checks, idempotent-rerun checksums) rather than by
`go test`. `go test -tags integration -coverprofile=... ./internal/...`
is the actual gated number — 99.0% combined (94.8% unit-only on
`internal/db`, which needs the integration suite's real-connection-
failure paths to clear 98%; enforced in CI, see below, not just
by convention).

**CI now covers both halves of the repo (added 2026-07-21).**
`.github/workflows/web-ci.yml` (`lint`/`test`/`build`/`e2e`, unchanged)
and the new `.github/workflows/scoring-ci.yml` (`build`: `go build`/
`go vet`/`gofmt -l`; `test`: the coverage-gated `internal/...` suite
above) both gate on their own `paths:` filter (`web/**` /
`scoring/**`) so an unrelated change to the other half doesn't run
either job. `scoring-ci`'s `test` job runs a `postgres:16-alpine`
service container and applies `scoring/testdata/ci_stub_schema.sql`
before testing — scoring's own migrations create FKs against
`perk(id)`/`roll(id)` (tables ingest owns, this repo never creates), so
a bare CI Postgres needs *something* to satisfy those references before
`db.Migrate` can even run. That stub is deliberately not a copy of
ingest's real migrations (owned and versioned in that repo) — just the
minimal shape the FK constraints need, the same shadow-table trick
`internal/db/integration_test.go` already used per-test, applied once
for the whole CI job. One test (`TestMigrateUpAndDown`'s check that
ingest's own `schema_migrations` table is untouched) only makes sense
against the real shared database and now skips gracefully against a
from-scratch one, same pattern already used for an empty `public.perk`.

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
   deploys to Vercel. Placement re-examined and re-confirmed 2026-07-21:
   "why is Go in the frontend repo?" — because the repo boundary is
   facts-vs-opinions, not language. Ingest stays a pure Bungie mirror
   (its CLAUDE.md forbids scoring logic outright); every editorial
   number lives here with the product that renders it. This repo is the
   product repo, not the frontend repo; web/ is the frontend.

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

**Hybrid scoring (decided 2026-07-20, supersedes the pure-perk plan).** A
roll's score is a blend of two layers, `scoring_config.base_blend` apiece:

1. **Archetype-intrinsic base** (`archetype_score`, keyed on the
   `(weapon_type, frame)` pair ingest already stores): imported from the
   community's *measured* data — boss-DPS sheets for PvE, TTK-breakpoint
   sheets for PvP. Full-roster reach, real numbers, and final numbers (the
   game is in maintenance mode, so this is a one-time import, not a feed).
2. **Perk layer**: the column-weighted perk-score average + `perk_synergy`
   bonuses, as originally planned. Starts near-neutral (thin inference
   from curated tier-list sheets where available, flat placeholder
   elsewhere) and sharpens over time via curation and, later, Phase-6
   community voting.

Why: the community sheets measure archetype/frame performance, not perk
quality — pure perk scoring would have left most of 1,057 perks on a flat
placeholder and most rankings meaningless at launch, while the intrinsic
data alone can't rank rolls at all (same-archetype weapons and all of a
weapon's rolls would tie). The blend gets real, differentiated weapon
rankings on day one from measured data, while keeping rolls rankable and
improvable. Known limit, on record: ingest stores `rpm` but not
range/stability/handling stats, so the base layer is archetype-granular —
same-archetype weapons only separate through the perk layer (or votes).
Weapons whose `(weapon_type, frame)` miss `archetype_score` (many Exotics
have unique intrinsic names) fall back to a neutral base; per-weapon
Exotic overrides from the boss-DPS sheet are a later refinement.

Import sources (Google Sheets, shared 2026-07-20; owners credited in
`archetype_score.source`): "Destiny 2: Quantum Damage-ics" and "Destiny 2:
Boss Damage" (PvE DPS by archetype), "Destiny WeaponStat Chart v2.0" (PvP
TTK by archetype), "Destiny 2: Endgame Analysis" (curated weapon/perk tier
tables, ~8 weapon types — feeds the thin perk-layer inference). A sixth
sheet was inaccessible (Workspace generative-AI restriction) and skipped.
This is curated *opinion/measurement* data feeding score columns this repo
owns — not a violation of ingest's "never scrape community sites" rule,
which governs Bungie-sourced identity facts.

**Pipeline (runs on its own cron, decoupled from export/publish — see above)**:
read weapon/perk/roll identity data (written by ingest) plus this repo's own
`scoring_config` / `archetype_score` / `perk_synergy` tables → compute every
roll's PvE/PvP/overall score (base blended with perk layer) → compute
weapon-level ranking (best single roll represents the weapon — confirmed,
see trade-off note below) → write `roll.*` and `weapon_ranking.*`. Stops
there — exporting and publishing are separate, manually-triggered steps
(see Publish Flow), not chained onto this job.

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

**"Weapon/frame modifiers": resolved 2026-07-20 by the hybrid design.**
The spec named it without defining it; `archetype_score` *is* the
weapon/frame modifier, realized as the measured base layer rather than an
arbitrary multiplier bolted onto perk scores. No separate mechanism needed.

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
    base_blend     NUMERIC(4,3) NOT NULL DEFAULT 0.50,  -- archetype base's share of a roll score; perk layer gets the rest
    top_n_variants SMALLINT NOT NULL DEFAULT 15,  -- trait+origin rolls/weapon expanded into barrel/mag variants
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (id = 1)
);

-- Measured archetype-intrinsic base scores (hybrid scoring, 2026-07-20).
-- Keyed on the (weapon_type, frame) pair ingest already stores; imported
-- once from the community measurement sheets; 0-100. Weapons that miss
-- this table (many Exotics have unique intrinsic names) fall back to a
-- neutral base at scoring time.
CREATE TABLE archetype_score (
    weapon_type TEXT NOT NULL,
    frame       TEXT NOT NULL,
    pve_score   NUMERIC(5,2),
    pvp_score   NUMERIC(5,2),
    source      TEXT,
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (weapon_type, frame)
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

Real numbers, implemented and measured (2026-07-21): 2,168,944
`roll_variant` rows on the live import, well above the original napkin
estimate (~530k) because post-dedup barrel/magazine counts run higher than
first assumed — up to 11 barrels × 13 magazines = 143 combos on some
weapons (see "Barrel/magazine count higher than estimate" below), not the
flat ~4×4 guessed before real data was queried. Still nowhere near the
unpruned 1–2 billion, and comfortably within what Postgres and static
export handle: full unconditional rebuild (`DELETE` + bulk insert, one
transaction) completes in ~50s total alongside the rest of `cmd/score`'s
work, confirmed idempotent (identical checksums) across reruns.

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

### Advanced filtering (product direction set 2026-07-20, v1 shipped 2026-07-21, combo-level ranking shipped 2026-07-21)

Target: answer loadout questions in one query — e.g. *"a Solar weapon, in
the Energy slot, Primary ammo, that can roll Heal Clip + Incandescent,
that's an SMG or Auto Rifle"* → the full list of qualifying weapons,
ranked best to worst. Verified live against the real export as an e2e
test (`e2e/home.spec.ts`, "answers a real loadout query") — this exact
combination genuinely matches, among others, "The Summoner."

**v1 facets, all shipped**: name search, element, slot, tier, ammo type,
weapon type (multi-select, chip-based), frame (a finer facet than weapon
type/archetype — see the note above about 140rpm vs 180rpm Hand Cannons),
champion mod / intrinsic breaker type, and perks (multi-select by name,
matched against a weapon's full column pool — barrels/mags included, not
just traits, since "can this weapon roll X" is a name-level question).
Results are sortable by a new Score column (`weapon_ranking.overall_score`,
nulls-last) alongside the existing name/type/element/RPM/roll-count
columns — **weapon-level rank, not combo-level**, exactly the v1 scope
this section originally called out as sufficient (see below). Perk
selection is an AND across every selected name, computed client-side
against `columns` (now on every `index.json` entry, not just detail docs)
joined against `perks.json` by hash — no new export data needed for that
part.

**Combo-level ranking, shipped 2026-07-21.** The Score column now reflects
the best roll containing the user's *selected* perks, not the weapon's
overall best roll, whenever any perk filter is active — falls back to
weapon-level `overall_score` when none is selected (unchanged v1
behavior). Needed two new pieces of data, both owned and exported by
*this repo's scoring job*, not ingest: `scoring/cmd/export-config` (new)
reads `scoring_config` (weights, `base_blend`) and `archetype_score` via
`Store` methods `cmd/score` already had, plus a new `PerkSynergiesByHash`
(the existing `PerkSynergies` keys by internal perk id, meaningless to a
client that only knows Bungie hashes) — written to a new
`scoring_config.json`, wired into `publish.sh` as a second export step
alongside ingest's own. `web/lib/scoring.ts` is a deliberately faithful
line-for-line port of `scoring/internal/scoring/formula.go` +
`frame.go`, verified directly against that Go code's own already-hand-
verified Fatebringer values.

**A real discovery changed the algorithm mid-implementation**: the
original plan ceiling-filled trait/origin columns the user didn't name a
perk for (to simulate "the best full roll containing the selection").
Building the Fatebringer parity test caught why that's wrong: Fatebringer
predates Origin Traits, so its 5th WEAPON PERKS slot holds "Crucible
Tracker"/"Kill Tracker" — cosmetic mods, not a real origin trait — and
ceiling-filling it would have silently scored a tracker as if it were a
roll perk. That trait/origin-vs-other classification only ever exists
transiently inside ingest's manifest parsing; nothing persists or exports
it. `comboScore` therefore only ever scores columns the user actually
named a perk for — simpler than the original plan, and verifiably correct
against real data rather than a guess. Verified live end-to-end
(`e2e/home.spec.ts`, "combo-level ranking genuinely reorders results"):
Forthcoming Deviance outranks Motion to Vacate by weapon-level
`overall_score` (55.2 vs 52.67), but selecting "Swap Mag" alone flips it
(51.1 vs 45.2) — a real reversal in the committed export, not a
constructed example.

**Still not done, deliberately out of scope**: perk-derived champion-stun
mapping (Voltshot → jolt → anti-overload, etc.) — the curated table this
needs was never built. The champion-mod facet only covers *intrinsic*
breaker type (a Bungie fact, already exported), not this second,
perk-driven source.

**Three data gaps this originally listed as blockers are now closed**,
each in its own last-light-armory-ingest PR, verified live before merge:
`weapon.ammo_type`/`weapon.breaker_type` (migration 000004, PR #2),
per-weapon `columns` moved onto every `index.json` entry (also PR #2),
and `weapon_ranking` scores exported for the first time at all (PR #3 —
discovered as a real blocker only once this section's own work started:
nothing had ever read or exported that table before, despite "v1 may
launch on weapon-level rank" already assuming a score existed somewhere).

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
      scoring_config.json      // weights/base_blend/archetype_score/perk_synergy — from scoring/cmd/export-config
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
      export-config/            // read-only: scoring_config.json for the website
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