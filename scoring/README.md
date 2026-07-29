# scoring

The scoring engine for last-light-armory: a private-network Go job that
computes every Destiny 2 roll's PvE/PvP/overall score and every weapon's
ranking, using a hybrid formula that blends measured community archetype
data with a column-weighted, curated perk layer. Reads weapon/perk/roll
identity data written by the sibling [`last-light-armory-ingest`][ingest]
repo; writes scores back to the same shared Postgres database. Never
deployed anywhere public — this runs on a private network, on a cron, next
to ingest.

## Setup

Requires Go 1.26+ and network access to the shared Postgres instance.

```sh
cp .env.example .env   # fill in DATABASE_URL
```

`DATABASE_URL` is the only variable this module needs — no Bungie API key,
since this repo never talks to Bungie's API directly. Percent-encode
special characters in the password (`/` → `%2F`, `@` → `%40`, `:` → `%3A`);
`internal/config` detects and explains an unparseable URL rather than
failing silently.

## Commands

```sh
go run ./cmd/score                      # recompute every roll/weapon score — the main job
go run ./cmd/import-baseline             # one-off: load community sheet data into archetype_score/perk scores
go run ./cmd/export-config -out DIR      # read-only: bake scoring_config.json for the website
```

All three accept `-env PATH` (default `.env`; pass `-env ""` to rely on real
process environment variables only, e.g. in production). `cmd/score` and
`cmd/import-baseline` self-migrate the schema on startup; `cmd/export-config`
deliberately does not — a read-only command shouldn't carry schema side
effects.

`cmd/score` has no version-check gate and no `-force` flag: unlike ingest,
there's no external API to protect from redundant calls, so it always does
a full, unconditional recompute. Running it by hand right after tuning a
weight in `scoring_config` and letting the cron pick it up later are
literally the same command.

```cron
# Mondays 10:00 — full recompute
0 10 * * 1  cd /path/to/last-light-armory/scoring && ./score
```

No `>> score.log 2>&1` needed anymore — see Logging below, which is the
answer to "did last Monday's run actually happen, and did it succeed."

## Logging

All three commands (`internal/logging`) write structured `log/slog` records
to both stdout and a dedicated, timestamped file per run — e.g.
`logs/score/20260725-100000.log` — so an unattended cron run leaves a
permanent, greppable record even if nobody was watching a terminal live.
Old files are pruned automatically, keeping the directory bounded without
a rotation library or a separate cleanup job:

```sh
go run ./cmd/score -log-dir logs/score -log-retention 72h   # both shown are the defaults
```

- `-log-dir` (default `logs/<command-name>`, e.g. `logs/score`) — each
  command gets its own subdirectory so a shared parent doesn't mix runs
  from different commands together.
- `-log-retention` (default `72h`, ~3 days) — files older than this are
  removed at the start of every run, based on file modification time.

Every run starts with a `run started` entry and, on success, ends with a
summary line carrying real metrics (`rolls_scored`, `duration`, etc. for
`cmd/score`) — `grep` a log directory for `level=ERROR` or `msg=panic` to
find a failed run, or just check whether a run happened at all: a gap in
the timestamped filenames is a missed or crashed run. A panic anywhere in
`cmd/score` is caught, logged with a stack trace, and turned into a clean
exit code 1 — never a bare, unlogged crash.

## The formula

A roll's score blends two layers, `scoring_config.base_blend` apiece:

1. **Archetype-intrinsic base** — measured community data (boss-DPS sheets
   for PvE, TTK sheets for PvP), keyed on the weapon's `(weapon_type, frame)`
   pair. Full-roster reach, but archetype-granular: it can't tell two rolls
   on the same weapon apart.
2. **Perk layer** — the column-weighted average of the roll's own perk
   scores (renormalized across whichever columns are actually present),
   plus any curated `perk_synergy` bonuses. Column weights map onto
   `weapon_perk.column_index`: 0 barrel, 1 magazine, 2/3 trait, 4 origin.

Both layers are 0–100; the blend is clamped to the same range.
`internal/scoring/formula.go` is the whole formula, pure functions with no
I/O, directly unit-tested; `internal/scoring/frame.go`'s `NormalizeFrame`
is the join key between the database's `weapon.frame` values and the
sheets' own vocabulary.

Weights and the base_blend ratio live in the `scoring_config` table, not
in code — tune them with an `UPDATE`, not a redeploy.

## Layout

```
cmd/
  score/            the main job: recompute every roll/weapon score
  import-baseline/  one-off: community sheet data → archetype_score + perk scores
  export-config/    read-only: scoring_config.json for the website
internal/
  db/               pgx pool, embedded migrations, all repository methods
  scoring/          the formula itself — pure, no I/O (formula.go, frame.go, variant.go)
  baseline/         normalizes raw community sheet data into 0-100 scores
  config/           .env + environment loading and validation
  logging/          structured log/slog setup: stdout + a pruned, timestamped file per run
data/               committed, reviewable JSON snapshots of the community sheets
migrations/         golang-migrate SQL — scoring_config, archetype_score,
                    perk_synergy, tier_cutoff, roll_variant
```

Migrations track in their own `last_light_armory_scoring_migrations` table
(not golang-migrate's default `schema_migrations`), which
`last-light-armory-ingest` already uses against the same database — a
distinct name avoids a collision between the two.

## Testing

```sh
go test ./...                                   # unit tests (fast, offline)
go test -race ./...                              # with the race detector
go test -tags integration ./internal/db/         # against a real Postgres
```

Integration tests isolate themselves in a throwaway schema
(`search_path`-scoped, dropped on cleanup) and read `TEST_DATABASE_URL`
(falling back to `DATABASE_URL`). Unlike ingest's, this module's own
migrations aren't self-contained — `perk_synergy`/`roll_variant` carry
foreign keys against `perk(id)`/`roll(id)`, tables ingest owns — so the
test schema's `search_path` is set to `schema,public`, letting new tables
land in the throwaway schema while those foreign keys still resolve
through to the real, shared `public` tables.

Coverage is gated in CI on `./internal/...`, not raw `./...`:
`cmd/score`/`cmd/import-baseline`/`cmd/export-config` are thin main-package
orchestration with no meaningful unit-testable branching of their own —
they're verified by running them for real against the live database
instead (row counts, bounds checks, hand-computed spot checks,
idempotent-rerun checksums — see the git history for examples).

```sh
go test -tags integration -coverprofile=cover.out ./internal/...
go tool cover -func=cover.out | tail -1
```

## Contributing

See the root [`CONTRIBUTING.md`](../CONTRIBUTING.md).

[ingest]: https://github.com/cuddebtj/last-light-armory-ingest
