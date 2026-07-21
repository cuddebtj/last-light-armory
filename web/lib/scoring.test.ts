import { readFileSync } from "node:fs";
import path from "node:path";
import {
  blendScore,
  clamp,
  comboScore,
  normalizeFrame,
  overallScore,
  rollPerkScore,
  rollScore,
  synergyContribution,
  toArchetypeMap,
  toSynergyMap,
} from "./scoring";
import { toPerkMap } from "./perks";
import type {
  Perk,
  PerkSynergyRow,
  ScoringConfig,
  WeaponIndexEntry,
} from "./types";

describe("clamp", () => {
  it("clamps to [0, 100]", () => {
    expect(clamp(-5)).toBe(0);
    expect(clamp(105)).toBe(100);
    expect(clamp(50)).toBe(50);
  });
});

describe("normalizeFrame", () => {
  it("strips ' Frame', ' Glaive', ' Weapon' suffixes and fixes Rapid Fire punctuation", () => {
    expect(normalizeFrame("Adaptive Frame")).toBe("Adaptive");
    expect(normalizeFrame("Adaptive Glaive")).toBe("Adaptive");
    expect(normalizeFrame("Balanced Heat Weapon")).toBe("Balanced Heat");
    expect(normalizeFrame("Rapid Fire Slug")).toBe("Rapid-Fire Slug");
  });

  it("leaves an already-unsuffixed Exotic intrinsic name unchanged", () => {
    expect(normalizeFrame("SUROS Legacy")).toBe("SUROS Legacy");
  });
});

describe("rollPerkScore", () => {
  const weights = [0.1, 0.1, 0.3, 0.3, 0.2];

  it("computes the weighted average across present columns", () => {
    const { pve, pvp } = rollPerkScore(
      [
        { columnIndex: 2, pve: 90, pvp: 50 },
        { columnIndex: 3, pve: 90, pvp: 50 },
      ],
      weights,
    );
    expect(pve).toBe(90);
    expect(pvp).toBe(50);
  });

  it("renormalizes so a two-column weapon isn't penalized for lacking a column", () => {
    const { pve } = rollPerkScore(
      [
        { columnIndex: 2, pve: 100, pvp: 50 },
        { columnIndex: 3, pve: 100, pvp: 50 },
      ],
      weights,
    );
    expect(pve).toBe(100); // full weight of present columns treated as 100%
  });

  it("ignores an out-of-range column index rather than throwing", () => {
    const { pve, pvp } = rollPerkScore(
      [{ columnIndex: 99, pve: 100, pvp: 100 }],
      weights,
    );
    expect(pve).toBe(50);
    expect(pvp).toBe(50);
  });

  it("returns the neutral default when there are no perks at all", () => {
    expect(rollPerkScore([], weights)).toEqual({ pve: 50, pvp: 50 });
  });
});

describe("synergyContribution", () => {
  it("sums the bonus for every matching pair, not just adjacent ones", () => {
    const synergies = toSynergyMap([
      { perk_a_hash: 1, perk_b_hash: 3, pve_bonus: 5, pvp_bonus: 1 },
    ]);
    const { pve, pvp } = synergyContribution([1, 2, 3], synergies);
    expect(pve).toBe(5);
    expect(pvp).toBe(1);
  });

  it("is order-independent — hash order in the synergy row doesn't matter", () => {
    const synergies = toSynergyMap([
      { perk_a_hash: 3, perk_b_hash: 1, pve_bonus: 5, pvp_bonus: 1 },
    ]);
    expect(synergyContribution([1, 3], synergies)).toEqual({ pve: 5, pvp: 1 });
  });

  it("sums zero when nothing matches", () => {
    expect(synergyContribution([1, 2], new Map())).toEqual({ pve: 0, pvp: 0 });
  });
});

describe("blendScore", () => {
  it("blends archetype base and perk layer per base_blend", () => {
    expect(blendScore(80, 60, 0.5)).toBe(70);
  });

  it("falls back to the neutral midpoint when there's no archetype match", () => {
    expect(blendScore(null, 60, 0.5)).toBe(55); // 0.5*50 + 0.5*60
  });

  it("clamps above 100 and below 0", () => {
    expect(blendScore(100, 100, 1)).toBe(100);
    expect(blendScore(0, 0, 1)).toBe(0);
  });
});

describe("overallScore", () => {
  it("averages pve and pvp", () => {
    expect(overallScore(90, 50)).toBe(70);
  });
});

describe("rollScore", () => {
  it("orchestrates perk average + synergy + blend end to end", () => {
    const result = rollScore(
      [
        { columnIndex: 2, pve: 90, pvp: 50 },
        { columnIndex: 3, pve: 90, pvp: 50 },
      ],
      [1, 2],
      new Map(),
      0.61,
      30.72,
      [0.1, 0.1, 0.3, 0.3, 0.2],
      0.5,
    );
    // Same real values scoring's own cmd/score hand-verified for Fatebringer.
    expect(result.pve).toBeCloseTo(45.305, 5);
    expect(result.pvp).toBeCloseTo(40.36, 5);
    expect(result.overall).toBeCloseTo(42.8325, 5);
  });
});

describe("toArchetypeMap / toSynergyMap", () => {
  it("keys archetype rows by weapon_type|frame", () => {
    const map = toArchetypeMap([
      { weapon_type: "Hand Cannon", frame: "Adaptive", pve_score: 1, pvp_score: 2 },
    ]);
    expect(map.get("Hand Cannon|Adaptive")).toEqual({ pve: 1, pvp: 2 });
    expect(map.get("Hand Cannon|Precision")).toBeUndefined();
  });

  it("keys synergy rows order-independently", () => {
    const rows: PerkSynergyRow[] = [
      { perk_a_hash: 5, perk_b_hash: 9, pve_bonus: 3, pvp_bonus: 0 },
    ];
    const map = toSynergyMap(rows);
    expect(synergyContribution([9, 5], map)).toEqual({ pve: 3, pvp: 0 });
  });
});

describe("comboScore", () => {
  const perk = (hash: number, name: string, pve: number, pvp: number): Perk => ({
    hash,
    name,
    enhanced: false,
    icon: "",
    pve_score: pve,
    pvp_score: pvp,
  });

  const config: ScoringConfig = {
    weights: [0.1, 0.1, 0.3, 0.3, 0.2],
    base_blend: 0.5,
    archetype_scores: [],
    perk_synergies: [],
  };

  it("scores only the selected perks — an unselected column is never ceiling-filled", () => {
    const perkMap = toPerkMap([
      perk(1, "Rewind Rounds", 90, 50),
      perk(2, "Firefly", 90, 50),
      perk(3, "Kill Tracker", 50, 50), // present in a column, never selected
    ]);
    const weapon = {
      type: "Hand Cannon",
      frame: "Adaptive Frame",
      columns: [
        { index: 2, perks: [1] },
        { index: 3, perks: [2] },
        { index: 4, perks: [3] }, // a tracker slot, not a real origin trait
      ],
    };
    const archetypeMap = toArchetypeMap([
      { weapon_type: "Hand Cannon", frame: "Adaptive", pve_score: 0.61, pvp_score: 30.72 },
    ]);

    const result = comboScore(
      weapon,
      new Set(["Rewind Rounds", "Firefly"]),
      perkMap,
      archetypeMap,
      new Map(),
      config,
    );
    // Real, already-verified Fatebringer values (cmd/score's own hand
    // verification session): the tracker in column 4 must not shift these.
    expect(result.pve).toBeCloseTo(45.305, 5);
    expect(result.pvp).toBeCloseTo(40.36, 5);
    expect(result.overall).toBeCloseTo(42.8325, 5);
  });

  it("falls back to the neutral archetype base when weapon_type+frame has no measured data", () => {
    const perkMap = toPerkMap([perk(1, "Fourth Time's the Charm", 50, 50)]);
    const weapon = {
      type: "Sidearm",
      frame: "Some Unmapped Exotic Intrinsic",
      columns: [{ index: 2, perks: [1] }],
    };
    const result = comboScore(
      weapon,
      new Set(["Fourth Time's the Charm"]),
      perkMap,
      new Map(),
      new Map(),
      config,
    );
    // base_blend*50 (neutral) + (1-base_blend)*50 (neutral perk layer) = 50
    expect(result.overall).toBe(50);
  });

  it("returns the neutral roll score when no selected perk is present in any column", () => {
    const perkMap = toPerkMap([perk(1, "Zen Moment", 90, 50)]);
    const weapon = {
      type: "Auto Rifle",
      frame: "Adaptive Frame",
      columns: [{ index: 2, perks: [1] }],
    };
    const result = comboScore(weapon, new Set(["Nothing Selected"]), perkMap, new Map(), new Map(), config);
    expect(result.overall).toBe(50);
  });

  it("treats a selected perk's null pve/pvp score as the neutral midpoint, same as the server's own COALESCE", () => {
    const perkMap = toPerkMap([
      { hash: 1, name: "Unscored Trait", enhanced: false, icon: "", pve_score: null, pvp_score: null },
    ]);
    const weapon = {
      type: "Auto Rifle",
      frame: "Adaptive Frame",
      columns: [{ index: 2, perks: [1] }],
    };
    const result = comboScore(weapon, new Set(["Unscored Trait"]), perkMap, new Map(), new Map(), config);
    expect(result.overall).toBe(50);
  });

  it("picks the first match when two selected names collide in the same column", () => {
    const perkMap = toPerkMap([
      perk(1, "Arrowhead Brake", 90, 50),
      perk(2, "Corkscrew Rifling", 10, 10),
    ]);
    const weapon = {
      type: "Hand Cannon",
      frame: "Adaptive Frame",
      columns: [{ index: 0, perks: [1, 2] }], // both in the barrel column
    };
    const result = comboScore(
      weapon,
      new Set(["Arrowhead Brake", "Corkscrew Rifling"]),
      perkMap,
      new Map(),
      new Map(),
      config,
    );
    // Only Arrowhead Brake (first by export column order) contributes.
    // perkLayer = 90/50 (single column, full weight) -> blend with neutral 50.
    expect(result.pve).toBe(70); // 0.5*50 + 0.5*90
  });

  it("reproduces Fatebringer's real, already-verified score end to end against the real committed export", () => {
    const dataDir = path.join(process.cwd(), "data");
    const perks: Perk[] = JSON.parse(readFileSync(path.join(dataDir, "perks.json"), "utf-8"));
    const config: ScoringConfig = JSON.parse(
      readFileSync(path.join(dataDir, "scoring_config.json"), "utf-8"),
    );
    const index: WeaponIndexEntry[] = JSON.parse(
      readFileSync(path.join(dataDir, "weapons", "index.json"), "utf-8"),
    );
    const fatebringer = index.find((w) => w.name === "Fatebringer")!;

    const perkMap = toPerkMap(perks);
    const archetypeMap = toArchetypeMap(config.archetype_scores);
    const synergies = toSynergyMap(config.perk_synergies);

    const result = comboScore(
      fatebringer,
      new Set(["Rewind Rounds", "Firefly"]),
      perkMap,
      archetypeMap,
      synergies,
      config,
    );

    // Full-precision values (0.5*0.61+0.5*90=45.305, etc.) — the DB stores
    // fatebringer.overall_score post-rounding (45.31/40.36/42.83), same
    // gap web/lib/data.test.ts's own real-data test already accounts for.
    expect(result.pve).toBeCloseTo(45.305, 5);
    expect(result.pvp).toBeCloseTo(40.36, 5);
    expect(result.overall).toBeCloseTo(42.8325, 5);
    expect(fatebringer.overall_score).toBeCloseTo(result.overall, 1);
  });
});
