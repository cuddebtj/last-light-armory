import { dedupeByName, resolvePerk, toPerkMap } from "./perks";
import type { Perk } from "./types";

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
  it("keeps the first occurrence of each name and drops later duplicates", () => {
    const a = { ...perk, hash: 1, name: "Full Bore" };
    const b = { ...perk, hash: 2, name: "Full Bore" };
    const c = { ...perk, hash: 3, name: "Arrowhead Brake" };
    expect(dedupeByName([a, b, c])).toEqual([a, c]);
  });
});
