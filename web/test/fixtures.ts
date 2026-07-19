import type { Meta, WeaponIndexEntry } from "@/lib/types";

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
    craftable: false,
    enhanceable: true,
    obtainable: true,
    roll_count: 36,
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
