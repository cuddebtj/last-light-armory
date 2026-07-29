import Image from "next/image";
import { bungieUrl } from "@/lib/bungie";
import { dedupeByName, resolvePerk, type PerkMap } from "@/lib/perks";
import type { WeaponColumn } from "@/lib/types";

// Column index -> semantic slot name, the same fixed convention
// lib/scoring.ts and ScoringConfig.weights document (weapon_perk.column_index:
// 0 barrel, 1 magazine, 2/3 trait, 4 origin trait) — labeling by that
// convention instead of a raw "Column N" is a real readability win, not
// just cosmetic, since every weapon in the export follows it.
const COLUMN_LABELS = ["Barrel", "Magazine", "Trait 1", "Trait 2", "Origin Trait"];

function columnLabel(index: number): string {
  return COLUMN_LABELS[index] ?? `Column ${index + 1}`;
}

export default function PerkPool({
  columns,
  perkMap,
}: {
  columns: WeaponColumn[];
  perkMap: PerkMap;
}) {
  return (
    <div className="space-y-5">
      {columns.map((col) => (
        <div key={col.index}>
          <p className="text-xs font-medium tracking-wide text-muted uppercase">
            {columnLabel(col.index)}
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {dedupeByName(col.perks.map((hash) => resolvePerk(perkMap, hash))).map(
              (perk) => (
                <div
                  key={perk.hash}
                  title={perk.name}
                  className="flex w-20 flex-col items-center gap-1.5 rounded-md border border-edge bg-surface p-2 text-center"
                >
                  <Image
                    src={bungieUrl(perk.icon)}
                    alt=""
                    width={32}
                    height={32}
                    className="rounded"
                  />
                  <span className="line-clamp-2 text-[11px] leading-tight text-ink">
                    {perk.name}
                  </span>
                </div>
              ),
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
