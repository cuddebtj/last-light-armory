import type { Perk, WeaponColumn } from "./types";

export type PerkMap = Map<number, Perk>;

export function toPerkMap(perks: Perk[]): PerkMap {
  return new Map(perks.map((p) => [p.hash, p]));
}

// Every perk hash referenced by a weapon is guaranteed present in
// perks.json (verified against the full export) — a miss here means the
// two files drifted, which is worth failing loudly on rather than
// silently rendering a blank perk.
export function resolvePerk(perkMap: PerkMap, hash: number): Perk {
  const perk = perkMap.get(hash);
  if (!perk) {
    throw new Error(`Unknown perk hash: ${hash}`);
  }
  return perk;
}

// Destiny 2's manifest often defines the same perk (identical name and
// effect) under multiple hashes — e.g. distinct catalog entries for the
// same barrel across sources, or a craftable trait's base and enhanced
// versions (221 names in the current export have both, identically
// named). A "what's the pool of options" display gains nothing from
// listing indistinguishable duplicates; specific rolls still reference
// the exact hash, so no information is lost here.
//
// When a name has both an enhanced and a non-enhanced hash, the enhanced
// one always wins — display treats every perk as if already at max
// enhancement tier, so there's nothing left to badge or explain. Without
// this rule, which hash "won" a name collision was really just whichever
// happened to come first in a weapon's column array — arbitrary, not a
// real signal, and the inconsistent result (some trait perks marked
// "Enh.", never barrels/magazines/origins, which don't have enhanced
// variants at all) was confusing rather than informative.
export function dedupeByName(perks: Perk[]): Perk[] {
  const byName = new Map<string, Perk>();
  for (const perk of perks) {
    const existing = byName.get(perk.name);
    if (!existing || (perk.enhanced && !existing.enhanced)) {
      byName.set(perk.name, perk);
    }
  }
  return [...byName.values()];
}

// The set of perk names a weapon can roll, across every column (barrel and
// magazine included, not just traits) — "can this weapon roll X" is a
// name-level question, matching dedupeByName's own rationale. A hash
// missing from perkMap is skipped rather than thrown on: the filter UI
// should degrade gracefully on a data mismatch, unlike resolvePerk's
// stricter contract for actually rendering a perk.
export function weaponPerkNames(
  columns: WeaponColumn[],
  perkMap: PerkMap,
): Set<string> {
  const names = new Set<string>();
  for (const column of columns) {
    for (const hash of column.perks) {
      const perk = perkMap.get(hash);
      if (perk) names.add(perk.name);
    }
  }
  return names;
}
