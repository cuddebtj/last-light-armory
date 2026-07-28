import { promises as fs } from "node:fs";
import {
  getMeta,
  getPerks,
  getScoringConfig,
  getWeapon,
  getWeaponIndex,
  getWeaponOrNull,
} from "./data";
import { logger } from "./logger";

// These run against the real committed export in web/data/ — the loaders'
// whole job is reading those exact files. Only the one test below that
// needs a forced non-ENOENT failure spies on fs.promises.readFile (the
// same live object data.ts itself imports, so the spy is visible there
// too) for that single call; every other test hits real files.
describe("data loaders", () => {
  it("getMeta returns the export metadata", async () => {
    const meta = await getMeta();
    expect(meta.manifest_version).toEqual(expect.any(String));
    expect(meta.weapon_count).toBe(2208);
    expect(meta.perk_count).toBe(1057);
    expect(meta.roll_count).toBe(100994);
  });

  it("getPerks returns every perk with the expected shape", async () => {
    const perks = await getPerks();
    expect(perks).toHaveLength(1057);
    expect(perks[0]).toMatchObject({
      hash: expect.any(Number),
      name: expect.any(String),
      enhanced: expect.any(Boolean),
      icon: expect.stringContaining("/common/destiny2_content/"),
    });
  });

  it("getScoringConfig returns the scoring formula's tunable inputs", async () => {
    const config = await getScoringConfig();
    expect(config.weights).toEqual([0.1, 0.1, 0.3, 0.3, 0.2]);
    expect(config.base_blend).toBe(0.5);
    expect(config.archetype_scores.length).toBeGreaterThan(0);
    expect(config.perk_synergies).toEqual([]); // no curation yet, real value
    // Same real value scoring/internal/scoring's own tests hand-verify.
    const handCannonAdaptive = config.archetype_scores.find(
      (a) => a.weapon_type === "Hand Cannon" && a.frame === "Adaptive",
    );
    expect(handCannonAdaptive).toMatchObject({ pve_score: 0.61, pvp_score: 30.72 });
  });

  it("getWeaponIndex returns all weapons sorted by name", async () => {
    const weapons = await getWeaponIndex();
    expect(weapons).toHaveLength(2208);
    const names = weapons.map((w) => w.name);
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)));
    expect(weapons[0]).toMatchObject({
      hash: expect.any(Number),
      type: expect.any(String),
      slot: expect.any(String),
      element: expect.any(String),
      tier: expect.any(String),
      roll_count: expect.any(Number),
      ammo_type: expect.any(String), // every real weapon has one (verified 2208/2208 in ingest)
      columns: expect.any(Array),
    });
  });

  it("getWeapon loads a detail file by hash", async () => {
    const weapon = await getWeapon(1006783454);
    expect(weapon.name).toBe("Timelines' Vertex");
    expect(weapon.columns.length).toBeGreaterThan(0);
    expect(weapon.rolls.length).toBeGreaterThan(0);
    expect(weapon.rolls[0].perks[0]).toMatchObject({
      column: expect.any(Number),
      hash: expect.any(Number),
    });
    // Real values from the scoring job, same weapon hand-verified there.
    expect(weapon.ammo_type).toBe("Special");
    expect(weapon.breaker_type).toBeNull();
    expect(weapon.overall_score).toBe(50.55);
  });

  it("getWeapon rejects for an unknown hash", async () => {
    await expect(getWeapon(999999999999)).rejects.toThrow();
  });

  it("getWeaponOrNull resolves the weapon for a known hash", async () => {
    const weapon = await getWeaponOrNull(1006783454);
    expect(weapon?.name).toBe("Timelines' Vertex");
  });

  it("getWeaponOrNull resolves to null for an unknown hash, silently (no log)", async () => {
    const errorSpy = vi.spyOn(logger, "error").mockImplementation(() => {});
    await expect(getWeaponOrNull(999999999999)).resolves.toBeNull();
    // ENOENT (a genuinely unknown hash) is an expected, handleable case —
    // logging it would just be noise on every 404.
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it("getWeaponOrNull logs and resolves to null for a non-ENOENT failure (e.g. malformed JSON)", async () => {
    const errorSpy = vi.spyOn(logger, "error").mockImplementation(() => {});
    // A real SyntaxError from JSON.parse, not a fabricated one — the file
    // read itself succeeds, but the content isn't valid JSON.
    const readFileSpy = vi
      .spyOn(fs, "readFile")
      .mockResolvedValueOnce("{not valid json" as never);

    await expect(getWeaponOrNull(1006783454)).resolves.toBeNull();

    expect(errorSpy).toHaveBeenCalledWith(
      "failed to load weapon detail data",
      expect.objectContaining({ hash: 1006783454, error: expect.any(SyntaxError) }),
    );
    readFileSpy.mockRestore();
  });
});
