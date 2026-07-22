import type { Meta, ScoringConfig, WeaponIndexEntry } from "@/lib/types";

let nextHash = 1;

export function makeWeapon(
  overrides: Partial<WeaponIndexEntry> = {},
): WeaponIndexEntry {
  return {
    hash: nextHash++,
    name: "Test Weapon",
    type: "Hand Cannon",
    slot: "Kinetic",
    element: "Kinetic",
    tier: "Legendary",
    frame: "Adaptive Frame",
    rpm: 140,
    icon: "/common/destiny2_content/icons/test-icon.jpg",
    watermark: "/common/destiny2_content/icons/test-watermark.png",
    ammo_type: "Primary",
    breaker_type: null,
    craftable: false,
    enhanceable: true,
    obtainable: true,
    roll_count: 36,
    columns: [],
    overall_score: null,
    pve_score: null,
    pvp_score: null,
    popularity_score: null,
    ...overrides,
  };
}

export function makeMeta(overrides: Partial<Meta> = {}): Meta {
  return {
    manifest_version: "test-manifest.1",
    generated_at: "2026-07-06T12:00:00Z",
    weapon_count: 2,
    perk_count: 3,
    roll_count: 4,
    ...overrides,
  };
}

export function makeScoringConfig(
  overrides: Partial<ScoringConfig> = {},
): ScoringConfig {
  return {
    weights: [0.1, 0.1, 0.3, 0.3, 0.2],
    base_blend: 0.5,
    archetype_scores: [],
    perk_synergies: [],
    ...overrides,
  };
}
