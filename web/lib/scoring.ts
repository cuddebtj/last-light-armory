// A deliberately faithful TypeScript port of scoring's hybrid formula
// (scoring/internal/scoring/formula.go + frame.go) — same math, so the
// client can compute an arbitrary perk combo's score without shipping all
// 100k roll scores to the browser (see CLAUDE.md's "Ranking semantics for
// filtered results"). Every export here mirrors one Go function 1:1;
// keep them in lockstep if the Go side ever changes.
import type {
  ArchetypeScoreRow,
  PerkSynergyRow,
  ScoringConfig,
  WeaponColumn,
} from "./types";
import type { PerkMap } from "./perks";

const DEFAULT_SCORE = 50;

export function clamp(v: number): number {
  if (v < 0) return 0;
  if (v > 100) return 100;
  return v;
}

// Same suffix-stripping rules as NormalizeFrame: most archetypes carry a
// literal " Frame" suffix the sheets never include; Glaive uses no
// "Frame" word at all; heat-frame archetypes end in " Weapon"; "Rapid
// Fire" (space, DB) vs "Rapid-Fire" (hyphen, sheets) is pure punctuation.
export function normalizeFrame(dbFrame: string): string {
  const f = dbFrame.replaceAll("Rapid Fire", "Rapid-Fire");
  for (const suffix of [" Frame", " Glaive", " Weapon"]) {
    if (f.endsWith(suffix)) return f.slice(0, -suffix.length);
  }
  return f;
}

export type ArchetypeMap = Map<string, { pve: number | null; pvp: number | null }>;

function archetypeMapKey(weaponType: string, normalizedFrame: string): string {
  return `${weaponType}|${normalizedFrame}`;
}

export function toArchetypeMap(rows: ArchetypeScoreRow[]): ArchetypeMap {
  const map: ArchetypeMap = new Map();
  for (const r of rows) {
    map.set(archetypeMapKey(r.weapon_type, r.frame), { pve: r.pve_score, pvp: r.pvp_score });
  }
  return map;
}

export type SynergyMap = Map<string, { pve: number; pvp: number }>;

function synergyMapKey(a: number, b: number): string {
  return a < b ? `${a}:${b}` : `${b}:${a}`;
}

export function toSynergyMap(rows: PerkSynergyRow[]): SynergyMap {
  const map: SynergyMap = new Map();
  for (const r of rows) {
    map.set(synergyMapKey(r.perk_a_hash, r.perk_b_hash), { pve: r.pve_bonus, pvp: r.pvp_bonus });
  }
  return map;
}

export interface PerkContribution {
  columnIndex: number;
  pve: number;
  pvp: number;
}

// Column-weighted average of a roll's perks, renormalized across whichever
// columns are actually present — a two-column weapon (no origin trait)
// isn't penalized purely for lacking a column to weight against.
export function rollPerkScore(
  perks: PerkContribution[],
  weights: readonly number[],
): { pve: number; pvp: number } {
  let totalWeight = 0;
  let pveSum = 0;
  let pvpSum = 0;
  for (const p of perks) {
    if (p.columnIndex < 0 || p.columnIndex >= weights.length) continue;
    const w = weights[p.columnIndex];
    totalWeight += w;
    pveSum += w * p.pve;
    pvpSum += w * p.pvp;
  }
  if (totalWeight === 0) return { pve: DEFAULT_SCORE, pvp: DEFAULT_SCORE };
  return { pve: pveSum / totalWeight, pvp: pvpSum / totalWeight };
}

// Sums the bonus for every pair of perks with a curated synergy entry —
// checks all pairs, not just adjacent ones.
export function synergyContribution(
  perkHashes: number[],
  synergies: SynergyMap,
): { pve: number; pvp: number } {
  let pve = 0;
  let pvp = 0;
  for (let i = 0; i < perkHashes.length; i++) {
    for (let j = i + 1; j < perkHashes.length; j++) {
      const bonus = synergies.get(synergyMapKey(perkHashes[i], perkHashes[j]));
      if (bonus) {
        pve += bonus.pve;
        pvp += bonus.pvp;
      }
    }
  }
  return { pve, pvp };
}

// archetypeScore is null when the weapon's (weapon_type, normalized frame)
// has no measured data (common for Exotics with unique intrinsic names) —
// falls back to the neutral midpoint rather than collapsing the blend to
// the perk layer alone, which would understate baseBlend's intended weight.
export function blendScore(
  archetypeScore: number | null,
  perkLayerScore: number,
  baseBlend: number,
): number {
  const base = archetypeScore ?? DEFAULT_SCORE;
  return clamp(baseBlend * base + (1 - baseBlend) * perkLayerScore);
}

export function overallScore(pve: number, pvp: number): number {
  return (pve + pvp) / 2;
}

export interface RollScoreResult {
  pve: number;
  pvp: number;
  overall: number;
}

// Orchestrates the full formula end to end: column-weighted perk average
// plus synergy bonuses (the perk layer), blended with the archetype-
// intrinsic base per scoring_config.base_blend.
export function rollScore(
  perks: PerkContribution[],
  perkHashes: number[],
  synergies: SynergyMap,
  archetypePVE: number | null,
  archetypePVP: number | null,
  weights: readonly number[],
  baseBlend: number,
): RollScoreResult {
  const base = rollPerkScore(perks, weights);
  const syn = synergyContribution(perkHashes, synergies);
  const perkLayerPVE = clamp(base.pve + syn.pve);
  const perkLayerPVP = clamp(base.pvp + syn.pvp);
  const pve = blendScore(archetypePVE, perkLayerPVE, baseBlend);
  const pvp = blendScore(archetypePVP, perkLayerPVP, baseBlend);
  return { pve, pvp, overall: overallScore(pve, pvp) };
}

// Weapon shape comboScore needs — a subset of WeaponIndexEntry so tests
// don't need a full fixture.
export interface ComboScoreWeapon {
  type: string;
  frame: string;
  columns: WeaponColumn[];
}

// The score of the user's selected perks, using each one's actual column
// weight for this weapon (see CLAUDE.md's ranking-semantics note) — the
// point of this module. Deliberately does NOT ceiling-fill columns the
// user didn't name a perk for: the export's `columns` field only records
// perk hashes per column *index*, not which columns are real trait/origin
// slots versus something else entirely — e.g. Fatebringer (pre-dates
// Origin Traits) has "Crucible Tracker"/"Kill Tracker" sitting in what
// would otherwise be its origin-trait slot. That trait/origin-vs-other
// classification only ever exists transiently inside ingest's manifest
// parsing (never persisted to any table, so nothing exports it) — ceiling-
// filling an unselected column would risk silently scoring a tracker mod
// as if it were a real roll perk. Scoring only the columns actually named
// is therefore the correct behavior with the data available today, not a
// placeholder pending more data.
//
// If the user selects two different perks that happen to live in the same
// column, only the first (by the export's own hash-sorted column order) is
// used — a real roll can only have one choice per column, so there's no
// "correct" way to combine two.
export function comboScore(
  weapon: ComboScoreWeapon,
  selectedPerkNames: Set<string>,
  perkMap: PerkMap,
  archetypeMap: ArchetypeMap,
  synergies: SynergyMap,
  config: ScoringConfig,
): RollScoreResult {
  const chosen: PerkContribution[] = [];
  const chosenHashes: number[] = [];

  for (const col of weapon.columns) {
    for (const hash of col.perks) {
      const perk = perkMap.get(hash);
      if (perk && selectedPerkNames.has(perk.name)) {
        chosen.push({
          columnIndex: col.index,
          pve: perk.pve_score ?? DEFAULT_SCORE,
          pvp: perk.pvp_score ?? DEFAULT_SCORE,
        });
        chosenHashes.push(perk.hash);
        break; // one choice per column, first match wins
      }
    }
  }

  const key = archetypeMapKey(weapon.type, normalizeFrame(weapon.frame));
  const archetype = archetypeMap.get(key);

  return rollScore(
    chosen,
    chosenHashes,
    synergies,
    archetype?.pve ?? null,
    archetype?.pvp ?? null,
    config.weights,
    config.base_blend,
  );
}
