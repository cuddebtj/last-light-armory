import type { Perk } from "./types";

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
// same barrel across sources. A "what's the pool of options" display
// gains nothing from listing indistinguishable duplicates; specific rolls
// still reference the exact hash, so no information is lost here.
export function dedupeByName(perks: Perk[]): Perk[] {
  const seen = new Set<string>();
  return perks.filter((perk) => {
    if (seen.has(perk.name)) return false;
    seen.add(perk.name);
    return true;
  });
}
