# Data schema

This is the closest thing this project has to an API: the exact shape of
every static JSON file `web/` reads from `web/data/`. Nothing here is a
live endpoint — every file is baked ahead of time by a read-only export
command and committed to git. If you're building against this data (a
script, a bot, your own tool), this file is the contract; if a field here
ever stops matching reality, that's a bug in this doc, not in the data.

The source of truth for the TypeScript shapes below is
[`web/lib/types.ts`](../web/lib/types.ts) — if the two ever disagree, that
file wins and this one needs updating.

Two different commands produce these files, from two different repos:

| File | Produced by | Repo |
|---|---|---|
| `meta.json`, `perks.json`, `weapons/index.json`, `weapons/<hash>.json` | `cmd/export` | [`last-light-armory-ingest`][ingest] |
| `scoring_config.json` | `cmd/export-config` | this repo (`scoring/`) |

All hashes throughout are Bungie's own Destiny 2 manifest hashes — the
same ones the Bungie.net API and DIM-style tools use, so they're stable
join keys against other Destiny 2 data sources.

## `meta.json`

One object: the manifest version this export was built from and row
counts, mostly useful for sanity-checking a data refresh.

```json
{
  "manifest_version": "244213.26.06.29.2000-1-bnet.65583",
  "generated_at": "2026-07-21T20:28:57.314996547Z",
  "weapon_count": 2208,
  "perk_count": 1057,
  "roll_count": 100994
}
```

| Field | Type | Notes |
|---|---|---|
| `manifest_version` | `string` | Bungie's own manifest version string. Changes whenever Bungie publishes new content. |
| `generated_at` | `string` (ISO 8601) | Stamped fresh on every export run — not useful for diffing whether data actually changed (see `scripts/publish.sh`'s own substantive-change check). |
| `weapon_count` | `number` | Length of `weapons/index.json`. |
| `perk_count` | `number` | Length of `perks.json`. |
| `roll_count` | `number` | Total rolls across every weapon. |

## `perks.json`

An array of every perk in the game — the shared lookup table every other
file's perk hashes join against.

```json
{
  "hash": 1563455254,
  "name": "Rewind Rounds",
  "enhanced": true,
  "icon": "/common/destiny2_content/icons/a201fd61905b802867b677cf927e6e04.png",
  "pve_score": 90,
  "pvp_score": 50
}
```

| Field | Type | Notes |
|---|---|---|
| `hash` | `number` | Bungie manifest hash, unique per entry. **Not** unique per name — see below. |
| `name` | `string` | Display name. |
| `enhanced` | `boolean` | Whether this is the enhanced-trait variant of a base perk. |
| `icon` | `string` | Path relative to `https://www.bungie.net` — never a full URL. |
| `pve_score` / `pvp_score` | `number \| null` | Curated 0–100 score, owned by `scoring/`. `null` only if the scoring job has never run at all; in practice every perk gets at least a neutral placeholder once it has. |

**Duplicate hashes, same name**: Destiny 2's manifest sometimes defines the
identical perk (same name, same effect) under two or more different
hashes — different catalog entries for what's really one perk. Anything
that presents "the pool of options" to a person should dedupe by `name`
first (see `web/lib/perks.ts`'s `dedupeByName`); anything that scores or
identifies a *specific* roll still needs the exact hash.

## `weapons/index.json`

An array of one slim entry per weapon — everything a list, filter, or
search page needs without fetching the full detail document. This is also
the file `scoring_config.json`'s combo-ranking math reads `columns` from.

```json
{
  "hash": 2171478765,
  "name": "Fatebringer",
  "type": "Hand Cannon",
  "slot": "Kinetic",
  "element": "Kinetic",
  "tier": "Legendary",
  "frame": "Adaptive Frame",
  "rpm": 140,
  "icon": "/common/destiny2_content/icons/7741689cbc1102aa9fc742b33a106f19.jpg",
  "watermark": "/common/destiny2_content/icons/36418dde751148bd3b95a023d491ea73.png",
  "ammo_type": "Primary",
  "breaker_type": null,
  "craftable": false,
  "enhanceable": false,
  "obtainable": true,
  "roll_count": 36,
  "columns": [
    { "index": 0, "perks": [111235976, 202670084, 839105230] },
    { "index": 4, "perks": [2860123632] }
  ],
  "overall_score": 42.83,
  "pve_score": 45.31,
  "pvp_score": 40.36,
  "popularity_score": null
}
```

| Field | Type | Notes |
|---|---|---|
| `hash` | `number` | Stable identifier — also the filename of the matching `weapons/<hash>.json`. |
| `name` | `string` | Display name. Not unique — reissued/Adept/Timelost variants share a base name (e.g. two weapons both named "Bad Omens" can exist with different hashes). |
| `type` | `string` | Weapon type, e.g. `"Hand Cannon"`. Also doubles as the "archetype" — see the note below. |
| `slot` | `"Kinetic" \| "Energy" \| "Power"` | **Not** a reliable proxy for ammo type — e.g. Eriana's Vow is Special ammo in the Energy slot. Use `ammo_type`. |
| `element` | `"Kinetic" \| "Arc" \| "Solar" \| "Void" \| "Stasis" \| "Strand"` | Damage type. |
| `tier` | `"Common" \| "Uncommon" \| "Rare" \| "Legendary" \| "Exotic"` | Rarity tier. |
| `frame` | `string` | The weapon's intrinsic archetype name, e.g. `"Adaptive Frame"`. Finer-grained than `type` — a 140rpm and a 180rpm Hand Cannon share `type` but not `frame`. |
| `rpm` | `number \| null` | Fire rate for most weapon types; draw time (bows), charge time (fusions), or swing speed (swords) for the rest. `null` for a handful of weapons. |
| `icon` / `watermark` | `string` | Paths relative to `https://www.bungie.net`. `watermark` is the season/expansion badge, meant to be overlaid on `icon`. |
| `ammo_type` | `"Primary" \| "Special" \| "Heavy" \| null` | Intrinsic ammo type. `null` is not expected in practice — every real weapon has one. |
| `breaker_type` | `string \| null` | Intrinsic champion-breaking capability (e.g. `"Shield Piercing"` = anti-Barrier). `null` for all but a handful of weapons — most champion-stun capability comes from perks, which this field does not cover (see the caveat in the root README/CLAUDE.md). |
| `craftable` / `enhanceable` | `boolean` | Whether the weapon has a crafting pattern, and whether any of its perk columns offer an enhanced variant. |
| `obtainable` | `boolean` | Whether the weapon can currently be acquired (has a live Collections entry, or is craftable). |
| `roll_count` | `number` | Number of entries in this weapon's `rolls` (on the matching detail doc) — trait+origin combinations only, never barrel/magazine. |
| `columns` | `WeaponColumn[]` | The **full** perk pool, every column, including barrel/magazine — not just the columns that appear in `rolls`. `index` is `weapon_perk.column_index`: `0` barrel, `1` magazine, `2`/`3` trait, `4` origin. A column with zero rollable perks is omitted rather than present-but-empty; 2 weapons in the current export have no columns at all. |
| `overall_score` / `pve_score` / `pvp_score` | `number \| null` | This weapon's **best roll's** score (see "ceiling, not consistency" below) — weapon-level rank. `null` for the weapons with zero recorded rolls (no roll to rank by). Owned by `scoring/`, not ingest. |
| `popularity_score` | `number \| null` | Reserved for a not-yet-built community-voting feature. Always `null` today. |

`weapons/<hash>.json` (below) has every one of these fields too, plus
`source` and `rolls` — `index.json` entries and detail docs share the same
base shape on purpose, so client code can treat them almost
interchangeably.

**"Archetype is the weapon type"** is a deliberate simplification made in
the ingest repo: there's no separate archetype field, `type` carries it.
Most of the community treats RPM+frame as the real archetype (a 140rpm and
180rpm Hand Cannon feel different to most players despite sharing `type`)
— `rpm` and `frame` are both still here and filterable if you need that
distinction.

## `weapons/<hash>.json`

One file per weapon (named by hash, e.g. `weapons/2171478765.json`) — a
strict superset of that weapon's `index.json` entry, plus:

```json
{
  "source": "Source: Vault of Glass, Normal or Master.",
  "rolls": [
    {
      "key": "aecf34d1...",
      "perks": [
        { "column": 2, "hash": 1563455254 },
        { "column": 3, "hash": 2521205828 }
      ],
      "pve_score": 45.31,
      "pvp_score": 40.36,
      "overall_score": 42.83
    }
  ]
}
```

| Field | Type | Notes |
|---|---|---|
| `source` | `string` (optional) | Human-readable acquisition source. Absent/empty for roughly 357 weapons with no collectible source string. |
| `rolls` | `Roll[]` | Every legal trait+origin perk combination for this weapon — **not** every barrel × magazine combination (that's a combinatorial explosion the scoring job deliberately prunes before expanding; those variants aren't exported to the client at all yet). Empty for weapons with no trait columns (58 weapons). |

Each `Roll`:

| Field | Type | Notes |
|---|---|---|
| `key` | `string` | Stable identity for this exact perk combination (a hash of its sorted column:perk pairs) — unique per weapon, not globally. |
| `perks` | `{ column: number, hash: number }[]` | Only the trait/origin columns (2–4) ever appear here — never barrel/magazine. |
| `pve_score` / `pvp_score` / `overall_score` | `number \| null` | This specific roll's score. A weapon's `index.json`/detail-doc-level `overall_score` is the **maximum** `overall_score` across this array — "ceiling, not consistency": a weapon with one exceptional roll ranks identically to one where every roll is solid. |

## `scoring_config.json`

One object: the scoring formula's tunable inputs, exported by `scoring/`
(not ingest) so the website can compute a roll's score for an arbitrary
perk combination itself, instead of only reading each weapon's
pre-computed best-roll score. See
[`web/lib/scoring.ts`](../web/lib/scoring.ts) for the client-side
implementation and [`scoring/README.md`](../scoring/README.md) for the
formula itself.

```json
{
  "weights": [0.1, 0.1, 0.3, 0.3, 0.2],
  "base_blend": 0.5,
  "archetype_scores": [
    { "weapon_type": "Auto Rifle", "frame": "Adaptive", "pve_score": 5.67, "pvp_score": 46.19 }
  ],
  "perk_synergies": []
}
```

| Field | Type | Notes |
|---|---|---|
| `weights` | `[number, number, number, number, number]` | Column weights, same index convention as `columns[].index` above: `0` barrel, `1` magazine, `2`/`3` trait, `4` origin. |
| `base_blend` | `number` | The archetype-intrinsic base's share of a roll's score (0–1); the perk layer gets the rest. |
| `archetype_scores` | `ArchetypeScoreRow[]` | Measured community data per `(weapon_type, frame)` pair. `frame` here is already normalized to the sheets' vocabulary (suffixes like `" Frame"`/`" Glaive"`/`" Weapon"` stripped) — to look up a weapon from `weapons/index.json`, run its own `frame` through the same normalization first (`normalizeFrame` in `lib/scoring.ts`). Either score is `null` when that half has no measured data (common for Exotics with unique intrinsic names). |
| `perk_synergies` | `PerkSynergyRow[]` | Curated pairwise perk bonuses (`perk_a_hash`, `perk_b_hash`, `pve_bonus`, `pvp_bonus`). Empty today — this is hand-curated data that hasn't been written yet, not a bug. |

[ingest]: https://github.com/cuddebtj/last-light-armory-ingest
