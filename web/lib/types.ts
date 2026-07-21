// Shapes produced by last-light-armory-ingest's cmd/export. This app only
// ever reads the committed JSON in web/data/ — never a database.

export interface Meta {
  manifest_version: string;
  generated_at: string;
  weapon_count: number;
  perk_count: number;
  roll_count: number;
}

export interface Perk {
  hash: number;
  name: string;
  enhanced: boolean;
  icon: string;
  pve_score: number | null;
  pvp_score: number | null;
}

export interface WeaponIndexEntry {
  hash: number;
  name: string;
  type: string;
  slot: "Kinetic" | "Energy" | "Power";
  element: "Kinetic" | "Arc" | "Solar" | "Void" | "Stasis" | "Strand";
  tier: "Common" | "Uncommon" | "Rare" | "Legendary" | "Exotic";
  frame: string;
  rpm: number | null; // null for a handful of weapons (e.g. some swords)
  icon: string; // bungie.net path, join with bungieUrl()
  watermark: string; // season watermark overlay, same origin
  ammo_type: "Primary" | "Special" | "Heavy" | null; // slot is not a valid proxy — e.g. Eriana's Vow is Special ammo in the Energy slot
  breaker_type: string | null; // intrinsic champion-breaking capability (e.g. "Shield Piercing"); null for all but a handful of weapons
  craftable: boolean;
  enhanceable: boolean;
  obtainable: boolean;
  roll_count: number;
  columns: WeaponColumn[]; // per-column perk-hash pool, empty for 2 weapons
  // Weapon-level ranking, owned by last-light-armory's scoring job. Null
  // for the 58 zero-roll weapons, which never get a ranking row.
  overall_score: number | null;
  pve_score: number | null;
  pvp_score: number | null;
  popularity_score: number | null; // Phase 6 (community voting), not started — always null for now
}

export interface WeaponColumn {
  index: number;
  perks: number[]; // perk hashes available in this column
}

export interface RollPerk {
  column: number;
  hash: number;
}

export interface Roll {
  key: string;
  perks: RollPerk[];
  pve_score: number | null;
  pvp_score: number | null;
  overall_score: number | null;
}

export interface WeaponDetail extends WeaponIndexEntry {
  source?: string; // absent/empty for ~357 weapons
  rolls: Roll[]; // empty for 58 weapons
}
