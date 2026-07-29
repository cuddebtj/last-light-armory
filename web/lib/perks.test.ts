import { dedupeByName, resolvePerk, toPerkMap, weaponPerkNames } from "./perks";
import type { Perk, WeaponColumn } from "./types";

const perk: Perk = {
  hash: 42,
  name: "Rewind Rounds",
  enhanced: false,
  icon: "/common/destiny2_content/icons/rewind.png",
  pve_score: null,
  pvp_score: null,
};

describe("toPerkMap / resolvePerk", () => {
  it("resolves a perk present in the map", () => {
    const map = toPerkMap([perk]);
    expect(resolvePerk(map, 42)).toBe(perk);
  });

  it("throws for a hash not present in the map", () => {
    const map = toPerkMap([perk]);
    expect(() => resolvePerk(map, 999)).toThrow("Unknown perk hash: 999");
  });
});

describe("dedupeByName", () => {
  it("keeps the first occurrence of each name when neither duplicate is enhanced", () => {
    const a = { ...perk, hash: 1, name: "Full Bore" };
    const b = { ...perk, hash: 2, name: "Full Bore" };
    const c = { ...perk, hash: 3, name: "Arrowhead Brake" };
    expect(dedupeByName([a, b, c])).toEqual([a, c]);
  });

  it("prefers the enhanced hash when the base version appears first", () => {
    const base = { ...perk, hash: 1, name: "Firefly", enhanced: false };
    const enh = { ...perk, hash: 2, name: "Firefly", enhanced: true };
    // Display treats everything as already at max tier — the enhanced
    // hash always wins a name collision, regardless of array order.
    expect(dedupeByName([base, enh])).toEqual([enh]);
  });

  it("prefers the enhanced hash when the enhanced version appears first", () => {
    const enh = { ...perk, hash: 1, name: "Firefly", enhanced: true };
    const base = { ...perk, hash: 2, name: "Firefly", enhanced: false };
    expect(dedupeByName([enh, base])).toEqual([enh]);
  });

  it("preserves each name's first-occurrence position, even when a later duplicate wins on enhancement", () => {
    const base = { ...perk, hash: 1, name: "Firefly", enhanced: false };
    const other = { ...perk, hash: 2, name: "Arrowhead Brake" };
    const enh = { ...perk, hash: 3, name: "Firefly", enhanced: true };
    expect(dedupeByName([base, other, enh])).toEqual([enh, other]);
  });
});

describe("weaponPerkNames", () => {
  const heal = { ...perk, hash: 10, name: "Heal Clip" };
  const incandescent = { ...perk, hash: 11, name: "Incandescent" };
  const dupHash = { ...perk, hash: 12, name: "Heal Clip" }; // same name, different hash
  const perkMap = toPerkMap([heal, incandescent, dupHash]);

  it("collects deduped perk names across every column, barrels/mags included", () => {
    const columns: WeaponColumn[] = [
      { index: 0, perks: [10] },
      { index: 3, perks: [11, 12] },
    ];
    expect(weaponPerkNames(columns, perkMap)).toEqual(
      new Set(["Heal Clip", "Incandescent"]),
    );
  });

  it("skips a hash absent from perkMap rather than throwing", () => {
    const columns: WeaponColumn[] = [{ index: 0, perks: [999] }];
    expect(weaponPerkNames(columns, perkMap)).toEqual(new Set());
  });

  it("returns an empty set for a weapon with no columns", () => {
    expect(weaponPerkNames([], perkMap)).toEqual(new Set());
  });
});
