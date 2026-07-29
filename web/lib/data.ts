import "server-only";
import { promises as fs } from "node:fs";
import path from "node:path";
import { logger } from "./logger";
import type {
  Meta,
  Perk,
  ScoringConfig,
  WeaponDetail,
  WeaponIndexEntry,
} from "./types";

// process.cwd() is web/ both locally and on Vercel (root directory = web/).
const DATA_DIR = path.join(process.cwd(), "data");

async function readJson<T>(...segments: string[]): Promise<T> {
  const raw = await fs.readFile(path.join(DATA_DIR, ...segments), "utf-8");
  return JSON.parse(raw) as T;
}

export function getMeta(): Promise<Meta> {
  return readJson<Meta>("meta.json");
}

export function getPerks(): Promise<Perk[]> {
  return readJson<Perk[]>("perks.json");
}

export function getScoringConfig(): Promise<ScoringConfig> {
  return readJson<ScoringConfig>("scoring_config.json");
}

export async function getWeaponIndex(): Promise<WeaponIndexEntry[]> {
  const weapons = await readJson<WeaponIndexEntry[]>("weapons", "index.json");
  return weapons.sort((a, b) => a.name.localeCompare(b.name));
}

export function getWeapon(hash: number): Promise<WeaponDetail> {
  return readJson<WeaponDetail>("weapons", `${hash}.json`);
}

// For route boundaries (a URL param) where "no such weapon" is an
// expected, handleable case rather than an internal error. Only a missing
// file (ENOENT — a genuinely unknown hash) is silent; anything else
// (malformed JSON, a permissions error) still resolves to the same 404
// UI for the visitor, but is logged rather than silently misclassified
// as "this weapon doesn't exist."
export async function getWeaponOrNull(
  hash: number,
): Promise<WeaponDetail | null> {
  try {
    return await getWeapon(hash);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
      logger.error("failed to load weapon detail data", { hash, error: err });
    }
    return null;
  }
}
