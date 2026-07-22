# web

The Destiny 2 weapon encyclopedia site — Next.js (App Router, TypeScript,
Tailwind), deployed to Vercel. Reads only committed static JSON in
[`data/`](data/); there is no live database access, no API routes, and no
environment variables to configure. Everything a page needs is baked ahead
of time by the sibling repos and committed here.

## Getting started

```sh
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). There's nothing to
configure — `npm install && npm run dev` is the entire setup.

## How it fits together

```
data/meta.json              manifest version, generated-at, row counts
data/perks.json             every perk: hash, name, enhanced, curated scores
data/scoring_config.json    scoring weights + archetype/synergy data (combo ranking)
data/weapons/index.json     one slim entry per weapon (list/filter/search pages)
data/weapons/<hash>.json    full detail: fields, perk pool columns, rolls
```

`lib/data.ts` is the only place these files are read (`fs.readFile` +
`JSON.parse`, guarded by the `server-only` import so it can never
accidentally ship to the client). `lib/types.ts` documents the exact shape
of every field. See [`../docs/DATA_SCHEMA.md`](../docs/DATA_SCHEMA.md) for
the full field-by-field reference.

This data isn't generated here — see [`../scripts/publish.sh`](../scripts/publish.sh)
and the root [`README.md`](../README.md) for where it comes from. If you're
working on `web/` only, the committed snapshot in `data/` is already
everything you need; you don't need database access or the sibling repos to
run or test this project.

### Where things live

```
app/                  routes: / (index) and /weapons/[hash] (detail)
components/           WeaponBrowser — the client-side filter/search/rank UI
lib/
  data.ts             the only file that reads data/*.json
  types.ts            TypeScript shapes matching that JSON exactly
  scoring.ts          a faithful port of the Go scoring formula (see below)
  perks.ts, bungie.ts, style.ts   small pure helpers
e2e/                  Playwright specs — real browser, real production build
test/                 Vitest fixtures and stubs shared across unit tests
```

### Combo-level ranking

Filtering by specific perks doesn't just narrow the list — it re-ranks it.
`lib/scoring.ts` is a line-for-line TypeScript port of
`scoring/internal/scoring/formula.go` in the sibling `scoring/` module: same
column-weighted perk average, same synergy bonuses, same archetype-base
blend. When you select perks, the Score column switches from each weapon's
overall best-roll score to the score of *just the perks you picked*,
computed entirely client-side from `perks.json` + `scoring_config.json` —
no server round-trip, no extra data shipped per query.

## Commands

```sh
npm run dev             # local dev server
npm run build           # production build (also type-checks)
npm start                # serve the production build locally
npm run lint             # ESLint
npm test                 # Vitest, once
npm run test:watch       # Vitest, watch mode
npm run test:coverage    # Vitest with coverage — fails the command under 98%
npm run test:e2e         # Playwright, against a real `next build` + `next start`
```

## Testing

Coverage is enforced, not advisory: `vitest.config.mts` sets hard thresholds
(statements/branches/functions/lines ≥ 98) and `npm run test:coverage` fails
the moment any of them dip. New code lands with its tests in the same
change — that's the bar CI (`.github/workflows/web-ci.yml`) actually checks.

e2e (Playwright) is a separate signal on top, not folded into that number —
it drives a real headless browser against the actual production build
(`next build` + `next start`, not `next dev`) and catches what unit tests
structurally can't: real navigation, real asset loading, real HTTP status
codes across all ~2,200 generated weapon routes. Several specs assert
against specific real weapons (Fatebringer, The Summoner, ...) rather than
fixtures — a future data refresh that renames or removes one of those
weapons is the expected reason such a test would need updating, not a
flake.

## Contributing

See the root [`CONTRIBUTING.md`](../CONTRIBUTING.md).
