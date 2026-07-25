"use client";

import { useState } from "react";
import { compareNullableNumber } from "@/lib/sort";
import SortHeader from "./SortHeader";

// One roll, pre-resolved to a display string server-side (RollsTable never
// needs the perk map itself — just plain, already-joined strings, which
// also sidesteps any question of whether a Map serializes cleanly across
// the server/client boundary).
export interface RollRow {
  key: string;
  displayPerks: string;
  pve_score: number | null;
  pvp_score: number | null;
  overall_score: number | null;
}

type SortKey = "pve_score" | "pvp_score" | "overall_score";
type SortState = { key: SortKey; dir: "asc" | "desc" };

export default function RollsTable({ rolls }: { rolls: RollRow[] }) {
  // Best rolls first by default — same rationale as the weapon index's
  // own default (task feedback: "make the default sort Score, not name").
  const [sort, setSort] = useState<SortState>({
    key: "overall_score",
    dir: "desc",
  });

  const toggleSort = (key: SortKey) => {
    setSort((prev) =>
      prev.key === key
        ? { key, dir: prev.dir === "asc" ? "desc" : "asc" }
        : { key, dir: "desc" },
    );
  };

  const sorted = [...rolls].sort((a, b) => {
    const sign = sort.dir === "asc" ? 1 : -1;
    return compareNullableNumber(a[sort.key], b[sort.key], sign);
  });

  return (
    <div className="mt-3 overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-edge text-left text-xs text-muted uppercase">
            <th className="py-2 font-medium">Perks</th>
            <th className="py-2 text-right font-medium">
              <SortHeader label="PvE" sortKey="pve_score" sort={sort} onSort={toggleSort} align="right" />
            </th>
            <th className="py-2 text-right font-medium">
              <SortHeader label="PvP" sortKey="pvp_score" sort={sort} onSort={toggleSort} align="right" />
            </th>
            <th className="py-2 text-right font-medium">
              <SortHeader label="Overall" sortKey="overall_score" sort={sort} onSort={toggleSort} align="right" />
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-edge/60">
          {sorted.map((roll) => (
            <tr key={roll.key}>
              <td className="py-2 pr-4">
                <span className="flex flex-wrap gap-x-2 gap-y-1">{roll.displayPerks}</span>
              </td>
              <td className="py-2 text-right font-mono text-muted">{roll.pve_score ?? "—"}</td>
              <td className="py-2 text-right font-mono text-muted">{roll.pvp_score ?? "—"}</td>
              <td className="py-2 text-right font-mono text-muted">{roll.overall_score ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
