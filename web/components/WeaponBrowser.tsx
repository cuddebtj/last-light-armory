"use client";

import { useDeferredValue, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { bungieUrl } from "@/lib/bungie";
import { ELEMENT_TEXT, TIER_BORDER } from "@/lib/style";
import type { WeaponIndexEntry } from "@/lib/types";

const SLOTS = ["Kinetic", "Energy", "Power"] as const;
const ELEMENTS = ["Kinetic", "Arc", "Solar", "Void", "Stasis", "Strand"] as const;
const TIERS = ["Exotic", "Legendary", "Rare", "Uncommon", "Common"] as const;

const selectClass =
  "rounded-md border border-edge bg-surface px-2.5 py-2 text-sm text-ink outline-none focus:border-gold/60";

type SortKey = "name" | "type" | "element" | "rpm" | "roll_count";
type SortState = { key: SortKey; dir: "asc" | "desc" };

function compareWeapons(
  a: WeaponIndexEntry,
  b: WeaponIndexEntry,
  key: SortKey,
  dir: "asc" | "desc",
): number {
  const sign = dir === "asc" ? 1 : -1;
  switch (key) {
    case "rpm": {
      // Nulls always sort last, in either direction — a handful of
      // weapons (e.g. some swords) have no RPM at all. Direction must be
      // applied inside the comparator, not by reversing the sorted
      // array afterward, or "last in ascending" becomes "first in
      // descending" for the null case.
      if (a.rpm == null && b.rpm == null) return 0;
      if (a.rpm == null) return 1;
      if (b.rpm == null) return -1;
      return sign * (a.rpm - b.rpm);
    }
    case "roll_count":
      return sign * (a.roll_count - b.roll_count);
    case "type":
      return sign * a.type.localeCompare(b.type);
    case "element":
      return sign * a.element.localeCompare(b.element);
    case "name":
      return sign * a.name.localeCompare(b.name);
  }
}

function SortHeader({
  label,
  sortKey,
  sort,
  onSort,
  align,
}: {
  label: string;
  sortKey: SortKey;
  sort: SortState;
  onSort: (key: SortKey) => void;
  align?: "right";
}) {
  const active = sort.key === sortKey;
  return (
    <button
      type="button"
      onClick={() => onSort(sortKey)}
      aria-label={
        active
          ? `${label}, sorted ${sort.dir === "asc" ? "ascending" : "descending"}`
          : `Sort by ${label}`
      }
      className={`flex items-center gap-1 hover:text-ink ${active ? "text-ink" : ""} ${align === "right" ? "w-full justify-end" : ""}`}
    >
      {label}
      {active && (
        <span aria-hidden="true">{sort.dir === "asc" ? "▲" : "▼"}</span>
      )}
    </button>
  );
}

export default function WeaponBrowser({
  weapons,
}: {
  weapons: WeaponIndexEntry[];
}) {
  const [query, setQuery] = useState("");
  const [type, setType] = useState("");
  const [slot, setSlot] = useState("");
  const [element, setElement] = useState("");
  const [tier, setTier] = useState("");
  const [sort, setSort] = useState<SortState>({ key: "name", dir: "asc" });

  const deferredQuery = useDeferredValue(query);

  const toggleSort = (key: SortKey) => {
    setSort((prev) =>
      prev.key === key
        ? { key, dir: prev.dir === "asc" ? "desc" : "asc" }
        : { key, dir: "asc" },
    );
  };

  const types = useMemo(
    () => [...new Set(weapons.map((w) => w.type))].sort(),
    [weapons],
  );

  const filtered = useMemo(() => {
    const q = deferredQuery.trim().toLowerCase();
    return weapons.filter(
      (w) =>
        (!q || w.name.toLowerCase().includes(q)) &&
        (!type || w.type === type) &&
        (!slot || w.slot === slot) &&
        (!element || w.element === element) &&
        (!tier || w.tier === tier),
    );
  }, [weapons, deferredQuery, type, slot, element, tier]);

  const sorted = useMemo(
    () => [...filtered].sort((a, b) => compareWeapons(a, b, sort.key, sort.dir)),
    [filtered, sort],
  );

  const hasFilters = Boolean(query || type || slot || element || tier);

  const reset = () => {
    setQuery("");
    setType("");
    setSlot("");
    setElement("");
    setTier("");
  };

  return (
    <section>
      <div className="sticky top-0 z-10 -mx-4 border-b border-edge bg-bg/95 px-4 py-3 backdrop-blur">
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search weapons…"
            className={`${selectClass} w-full sm:w-64`}
          />
          <select
            value={type}
            onChange={(e) => setType(e.target.value)}
            className={selectClass}
            aria-label="Weapon type"
          >
            <option value="">All types</option>
            {types.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
          <select
            value={slot}
            onChange={(e) => setSlot(e.target.value)}
            className={selectClass}
            aria-label="Slot"
          >
            <option value="">All slots</option>
            {SLOTS.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
          <select
            value={element}
            onChange={(e) => setElement(e.target.value)}
            className={selectClass}
            aria-label="Element"
          >
            <option value="">All elements</option>
            {ELEMENTS.map((el) => (
              <option key={el}>{el}</option>
            ))}
          </select>
          <select
            value={tier}
            onChange={(e) => setTier(e.target.value)}
            className={selectClass}
            aria-label="Tier"
          >
            <option value="">All tiers</option>
            {TIERS.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
          {hasFilters && (
            <button
              onClick={reset}
              className="rounded-md px-2.5 py-2 text-sm text-muted hover:text-ink"
            >
              Reset
            </button>
          )}
          <span className="ml-auto text-sm text-muted">
            {filtered.length.toLocaleString("en-US")} of{" "}
            {weapons.length.toLocaleString("en-US")}
          </span>
        </div>
      </div>

      <div className="mt-2 hidden grid-cols-[3.25rem_1fr_10rem_6.5rem_4.5rem_4.5rem] gap-x-3 px-3 py-2 text-xs uppercase tracking-wide text-muted sm:grid">
        <span />
        <SortHeader label="Weapon" sortKey="name" sort={sort} onSort={toggleSort} />
        <SortHeader label="Type" sortKey="type" sort={sort} onSort={toggleSort} />
        <SortHeader label="Element" sortKey="element" sort={sort} onSort={toggleSort} />
        <SortHeader label="RPM" sortKey="rpm" sort={sort} onSort={toggleSort} align="right" />
        <SortHeader label="Rolls" sortKey="roll_count" sort={sort} onSort={toggleSort} align="right" />
      </div>

      <ul className="divide-y divide-edge/60">
        {sorted.map((w) => (
          <li key={w.hash} className="weapon-row">
            <Link
              href={`/weapons/${w.hash}`}
              className="grid grid-cols-[3.25rem_1fr_4.5rem] items-center gap-x-3 px-3 py-2 hover:bg-surface sm:grid-cols-[3.25rem_1fr_10rem_6.5rem_4.5rem_4.5rem]"
            >
              <span
                className={`relative block h-11 w-11 overflow-hidden rounded border-l-2 ${TIER_BORDER[w.tier] ?? "border-edge"}`}
              >
                <Image
                  src={bungieUrl(w.icon)}
                  alt={w.name}
                  width={44}
                  height={44}
                />
                <Image
                  src={bungieUrl(w.watermark)}
                  alt=""
                  width={44}
                  height={44}
                  className="absolute inset-0"
                />
              </span>
              <span className="min-w-0">
                <span className="block truncate font-medium">{w.name}</span>
                <span className="block truncate text-xs text-muted">
                  {w.frame}
                </span>
              </span>
              <span className="hidden truncate text-sm text-muted sm:block">
                {w.type}
              </span>
              <span
                className={`hidden text-sm sm:block ${ELEMENT_TEXT[w.element] ?? "text-muted"}`}
              >
                {w.element}
              </span>
              <span className="hidden text-right font-mono text-sm text-muted sm:block">
                {w.rpm ?? "—"}
              </span>
              <span className="text-right font-mono text-sm text-muted">
                {w.roll_count.toLocaleString("en-US")}
              </span>
            </Link>
          </li>
        ))}
      </ul>

      {filtered.length === 0 && (
        <p className="py-16 text-center text-muted">
          No weapons match these filters.
        </p>
      )}
    </section>
  );
}
