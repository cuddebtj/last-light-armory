# Community measurement data (extracted 2026-07-21)

Raw measured values extracted from community spreadsheets, feeding the
hybrid scoring base layer (`archetype_score`) and, later, per-weapon Exotic
overrides. These are **opinion/measurement data this repo owns** — not
Bungie identity facts — so they live here, not in ingest (see CLAUDE.md's
hybrid-scoring section for the ownership reasoning).

The game is in maintenance mode (final content update June 2026), so these
numbers are final. If a sheet is ever revised, re-extract and re-commit —
the files are the reviewable snapshot of record, and the importer only ever
reads these files, never the sheets.

## Files

| File | Rows | What |
|---|---|---|
| `archetype_pve.json` | 80 | Boss-DPS per (weapon_type, frame): `sustained_dps` (ranking signal) + `true_dps` |
| `archetype_pvp.json` | 44 | Crucible optimal TtK per (weapon_type, frame): `optimal_ttk_s` (lower = better) + `crit_pct`, `ammo` |
| `weapon_pve.json` | 593 | Per-weapon rows (mostly Exotics, incl. perk/stance `qualifier` variants) — future per-weapon overrides, unused by v1 |
| `weapon_pvp.json` | 28 | Per-weapon PvP rows (Exotics) — same status |
| `perk_pve.json` | 122 | Per-*perk* PvE tier signal from Endgame Analysis's curated weapon-roll tables: a perk's `pve_score` is its best (S=90..D=30) tier appearance across every table it's named in — thin coverage (122 of 686 distinct perk names), by design |
| `perk_pvp.json` | 5 | Per-perk PvP `multiplier` from WeaponStat's damage-modifier table — even thinner (5 of 686): most perks (handling, reload, stability, range, flinch resistance) have no damage-multiplier effect and so never appear in that table at all |

## Sources (credited in each row's `source`)

- **Destiny 2: Quantum Damage-ics** (u/XboxUser123), game ver 9.7.0.1 — PvE
  boss DPS. Per-type tabs use the sheet's normalized damage system
  (`scale: "tab"`); the Power ammo class comes from its All Weapons tab
  (`scale: "all_weapons_power"`, raw in-game numbers) because the per-type
  Swords tab wasn't machine-readable and All Weapons covers every Power
  archetype on one consistent scale. **Scales are not comparable across
  groups** — the importer must normalize within a (ammo-class, scale)
  group, never across.
- **Destiny WeaponStat Chart v2.0** (huwugo_), D2 Renegades 9.5.0.5 — PvP
  TtK breakpoints, and (separately) its damage-modifier calculator table
  for `perk_pvp.json`.
- **Destiny 2: Endgame Analysis** (curated tier tables) — per-weapon-roll
  S/A/B/C/D tier lists across ~8 weapon types, source for `perk_pve.json`.
  Every extracted perk name is cross-validated against the real committed
  `perks.json` before being kept — this is *why* the sheet-derived counts
  are thin (122/686, 5/686): most raw extraction hits are noise (frame
  names, other tables' numbers, subclass/exotic-armor buffs in the PvP
  case) that happen to share a column position or end in a tier-like
  letter, and get filtered out by that validation, not by hand-picking.

## Name mapping applied at extraction

Sheet archetype names → DB `(weapon_type, frame)` vocabulary: bow draw-time
qualifiers stripped ("Precision (576 ms)" → "Precision"), "Rapid Fire" →
"Rapid-Fire", "Rocket-Assisted" → "Micro-Missile" (the manifest's name for
rocket-assisted frames), "SMGs"/"Breech Grenade Launchers" section aliases.

**Not yet done**: the DB's own `weapon.frame` values (e.g. "Adaptive Frame",
"Häkke Precision Frame") still need their own normalization — strip
" Frame"/" Glaive"/" Sword"/" Weapon" suffixes and foundry prefixes
(Häkke/SUROS/Omolon/VEIST/Nadir), and match bow "High-Impact" to
"High-Impact Longbow" — before they'll join against this data's sheet-side
names. That's `cmd/score`'s job at scoring time, not this import step's;
these files are keyed on the sheets' own vocabulary only.

## Coverage against the 2026-07-06 export snapshot (2,208 weapons)

- PvE: 90% of all weapons, **96% of Legendaries** (1,843/1,913)
- PvP: 48% (primaries + PvP-relevant specials; heavies are neutral there)
- Every miss falls back to the neutral base at scoring time, by design.
  Known unmatched frames (sheet has no data): Wave/Caster Swords, Together
  Forever, MIDA Synergy, Precision (heavy) GL, a few heat intrinsics —
  ~70 Legendaries total. Exotics miss archetype matching entirely (unique
  intrinsics) until per-weapon overrides from `weapon_pve.json` land.
- Duplicate unqualified sheet rows for one archetype (e.g. Area Denial
  firing patterns) keep the **best** sustained value — same ceiling
  philosophy as "best single roll represents the weapon".
- Caster swords: omitted because the sheet itself marks their DPS "?".
