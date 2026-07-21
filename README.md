# last-light-armory

A Destiny 2 weapon encyclopedia and ranking site: every weapon, every roll,
scored and searchable. Built on data mirrored from Bungie's public manifest,
scored by a hybrid formula that blends measured community archetype data
with curated perk quality, and served as a static Next.js site.

This repo is the **product repo** — the scoring engine and the website that
renders it. A sibling repo, [`last-light-armory-ingest`][ingest], is the pure
Bungie data mirror the scoring engine reads from.

## Architecture

**Private network** (never exposed publicly):

- `last-light-armory-ingest` (sibling repo), on a cron, mirrors Bungie's
  manifest into Postgres: weapon/perk/roll identity facts.
- `scoring/cmd/score` (this repo), on its own cron, reads that identity data
  plus its own curated tables and writes every roll's PvE/PvP/overall score
  back to the same Postgres database.
- Two read-only export commands — ingest's `cmd/export` and this repo's
  `scoring/cmd/export-config` — bake everything into static JSON. Nothing
  else ever leaves the private network.

**Publish step** (`scripts/publish.sh`, manually triggered): runs both
exports, copies the JSON into `web/data/`, runs the full test suite against
it, and pushes a branch for review.

**Public**: Vercel builds `web/` from whatever JSON is currently committed
in `web/data/` — no database connection, no secrets, ever.

| Concern | Owner |
|---|---|
| Weapon/perk/roll identity, Bungie-sourced facts | `last-light-armory-ingest` |
| Scoring formula, perk/roll/weapon scores, curated data | `scoring/` (this repo) |
| Static JSON consumption + rendering | `web/` (this repo) |

See [`CLAUDE.md`](CLAUDE.md) for the full design history and the reasoning
behind these decisions — this README covers what's here and how to run it;
that file covers *why* it's built this way.

## What's in this repo

- **[`web/`](web/)** — the Next.js (App Router, TypeScript, Tailwind) site,
  deployed to Vercel. Reads only committed static JSON in `web/data/`; no
  live database access, ever. See [`web/README.md`](web/README.md).
- **[`scoring/`](scoring/)** — a private-network Go job that computes every
  roll's PvE/PvP/overall score from a hybrid formula (measured archetype
  data blended with a column-weighted perk layer), writes the results back
  to Postgres, and exports the scoring config itself for the website's
  combo-ranking feature. See [`scoring/README.md`](scoring/README.md).
- **[`scripts/publish.sh`](scripts/publish.sh)** — the one command that ties
  ingest's export, scoring's export, and this website together: pulls fresh
  data from both, copies it into `web/data/`, runs the full test suite
  against it, and pushes a branch for review.
- **[`docs/DATA_SCHEMA.md`](docs/DATA_SCHEMA.md)** — reference documentation
  for the static JSON files `web/` consumes; the closest thing this project
  has to an API contract.

## Quick start

```sh
# Website — no database, no secrets, just committed JSON
cd web
npm install
npm run dev              # http://localhost:3000

# Scoring job — needs DATABASE_URL against the shared private Postgres
cd scoring
cp .env.example .env     # fill in DATABASE_URL
go run ./cmd/score        # recompute every roll/weapon score
```

Full setup, environment variables, and every command are documented in each
subproject's own README.

## Testing

Both halves of the repo enforce coverage in CI, not by convention:

```sh
cd web && npm run test:coverage   # Vitest, fails under 98% statements/branches/functions/lines
cd web && npm run test:e2e        # Playwright, against the real production build
cd scoring && go test -tags integration -coverprofile=... ./internal/...   # fails under 98%, gated in CI
```

`.github/workflows/web-ci.yml` and `.github/workflows/scoring-ci.yml` each
gate on their own `paths:` filter, so a change to one half never runs the
other's CI job.

## Contributing

See [`CONTRIBUTING.md`](CONTRIBUTING.md) for branch conventions, commit
style, and what a PR needs to pass before merge.

## License

Code in this repo is licensed under the [MIT License](LICENSE). Destiny 2
weapon names, icons, and other game data are the property of Bungie, Inc.
and are not covered by this license — this project is an unofficial fan
tool and claims no ownership over Destiny 2 content.

[ingest]: https://github.com/cuddebtj/last-light-armory-ingest
