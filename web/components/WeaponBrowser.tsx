"use client";

import { useDeferredValue, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { bungieUrl } from "@/lib/bungie";
import { toPerkMap, weaponPerkNames, dedupeByName } from "@/lib/perks";
import { comboScore, toArchetypeMap, toSynergyMap } from "@/lib/scoring";
import { ELEMENT_TEXT, TIER_BORDER } from "@/lib/style";
import type { Perk, ScoringConfig, WeaponIndexEntry } from "@/lib/types";

const SLOTS = ["Kinetic", "Energy", "Power"] as const;
const ELEMENTS = ["Kinetic", "Arc", "Solar", "Void", "Stasis", "Strand"] as const;
const TIERS = ["Exotic", "Legendary", "Rare", "Uncommon", "Common"] as const;
const AMMO_TYPES = ["Primary", "Special", "Heavy"] as const;
// Bungie's own DestinyBreakerType enum (fixed, like ammo type) — the
// champion-shield-piercing capability a weapon carries intrinsically.
const BREAKER_TYPES = ["Shield Piercing", "Disruption", "Stagger"] as const;

const selectClass =
  "rounded-md border border-edge bg-surface px-2.5 py-2 text-sm text-ink outline-none focus:border-gold/60";

type SortKey =
  | "name"
  | "type"
  | "element"
  | "rpm"
  | "roll_count"
  | "overall_score";
type SortState = { key: SortKey; dir: "asc" | "desc" };

// Nulls always sort last, in either direction (a weapon can lack an RPM or
// a ranking). Direction must be applied inside the comparator, not by
// reversing the sorted array afterward, or "last in ascending" becomes
// "first in descending" for the null case.
export function compareNullableNumber(
  a: number | null,
  b: number | null,
  sign: number,
): number {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  return sign * (a - b);
}

// Exported (alongside compareNullableNumber above) so both are directly
// unit-testable without going through the full component/DOM.
export function compareWeapons(
  a: WeaponIndexEntry,
  b: WeaponIndexEntry,
  key: SortKey,
  dir: "asc" | "desc",
): number {
  const sign = dir === "asc" ? 1 : -1;
  switch (key) {
    case "rpm":
      return compareNullableNumber(a.rpm, b.rpm, sign);
    case "overall_score":
      return compareNullableNumber(a.overall_score, b.overall_score, sign);
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

// A removable-chip list backed by an "add one more" select — used for both
// weapon type and perk facets, where the underlying filter is "any of
// several selected values" rather than one. Keeping this as a plain select
// (not a custom combobox) matches the rest of the file's native-control
// style; the `options` list narrows via the caller's own search input.
function ChipMultiSelect({
  label,
  placeholder,
  options,
  selected,
  onAdd,
  onRemove,
}: {
  label: string;
  placeholder: string;
  options: string[];
  selected: Set<string>;
  onAdd: (value: string) => void;
  onRemove: (value: string) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <select
        // Always reset to the blank placeholder: a change event can only
        // fire by picking a different (non-blank) option, so onAdd's value
        // is never empty in practice.
        value=""
        onChange={(e) => onAdd(e.target.value)}
        className={selectClass}
        aria-label={label}
      >
        <option value="">{placeholder}</option>
        {options.map((value) => (
          <option key={value} value={value}>
            {value}
          </option>
        ))}
      </select>
      {[...selected].map((value) => (
        <button
          key={value}
          type="button"
          onClick={() => onRemove(value)}
          className="flex items-center gap-1 rounded-full border border-edge bg-surface px-2 py-1 text-xs text-ink hover:border-gold/60"
        >
          {value}
          <span aria-hidden="true">×</span>
        </button>
      ))}
    </div>
  );
}

// The whole weapon index page: search, every facet filter, sortable
// columns, and combo-level ranking once perks are selected. weapons/perks
// are ingest's export (see docs/DATA_SCHEMA.md); scoringConfig is
// scoring's (weights/base_blend/archetype/synergy data — see
// lib/scoring.ts). All filtering/sorting/scoring happens client-side over
// data already fully loaded server-side; there's no pagination or
// server round-trip as the user interacts with the filters.
export default function WeaponBrowser({
  weapons,
  perks,
  scoringConfig,
}: {
  weapons: WeaponIndexEntry[];
  perks: Perk[];
  scoringConfig: ScoringConfig;
}) {
  const [query, setQuery] = useState("");
  const [selectedTypes, setSelectedTypes] = useState<Set<string>>(new Set());
  const [slot, setSlot] = useState("");
  const [element, setElement] = useState("");
  const [tier, setTier] = useState("");
  const [ammoType, setAmmoType] = useState("");
  const [breakerType, setBreakerType] = useState("");
  const [frame, setFrame] = useState("");
  const [perkQuery, setPerkQuery] = useState("");
  const [selectedPerkNames, setSelectedPerkNames] = useState<Set<string>>(
    new Set(),
  );
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
  // Frame is a finer-grained facet than weapon type/archetype (decision
  // recorded in CLAUDE.md: "archetype IS the weapon type", but a 140rpm and
  // 180rpm Hand Cannon are different archetypes to most players despite
  // sharing weapon_type) — filterable separately for players who care.
  const frames = useMemo(
    () => [...new Set(weapons.map((w) => w.frame).filter(Boolean))].sort(),
    [weapons],
  );

  const perkMap = useMemo(() => toPerkMap(perks), [perks]);
  const allPerkNames = useMemo(
    () => dedupeByName(perks).map((p) => p.name).sort(),
    [perks],
  );
  // Precomputed once per weapon list (not per filter pass): the set of
  // perk names each weapon can roll, across every column.
  const perkNamesByHash = useMemo(() => {
    const map = new Map<number, Set<string>>();
    for (const w of weapons) {
      map.set(w.hash, weaponPerkNames(w.columns, perkMap));
    }
    return map;
  }, [weapons, perkMap]);

  const perkOptions = useMemo(() => {
    const q = perkQuery.trim().toLowerCase();
    return allPerkNames.filter(
      (name) =>
        !selectedPerkNames.has(name) &&
        (!q || name.toLowerCase().includes(q)),
    );
  }, [allPerkNames, selectedPerkNames, perkQuery]);

  const typeOptions = useMemo(
    () => types.filter((t) => !selectedTypes.has(t)),
    [types, selectedTypes],
  );

  const filtered = useMemo(() => {
    const q = deferredQuery.trim().toLowerCase();
    return weapons.filter((w) => {
      if (q && !w.name.toLowerCase().includes(q)) return false;
      if (selectedTypes.size > 0 && !selectedTypes.has(w.type)) return false;
      if (slot && w.slot !== slot) return false;
      if (element && w.element !== element) return false;
      if (tier && w.tier !== tier) return false;
      if (frame && w.frame !== frame) return false;
      if (ammoType && w.ammo_type !== ammoType) return false;
      if (breakerType && w.breaker_type !== breakerType) return false;
      if (selectedPerkNames.size > 0) {
        // Guaranteed present: perkNamesByHash is built from this same
        // weapons array, so every hash filtered here has an entry.
        const available = perkNamesByHash.get(w.hash)!;
        for (const name of selectedPerkNames) {
          if (!available.has(name)) return false;
        }
      }
      return true;
    });
  }, [
    weapons,
    deferredQuery,
    selectedTypes,
    slot,
    element,
    tier,
    frame,
    ammoType,
    breakerType,
    selectedPerkNames,
    perkNamesByHash,
  ]);

  const archetypeMap = useMemo(
    () => toArchetypeMap(scoringConfig.archetype_scores),
    [scoringConfig],
  );
  const synergyMap = useMemo(
    () => toSynergyMap(scoringConfig.perk_synergies),
    [scoringConfig],
  );

  // Combo-level rank (CLAUDE.md's "ranking semantics for filtered
  // results"): once the user has named specific perks, the Score column
  // reflects the best roll containing *those* perks, not the weapon's
  // overall best roll — a weapon whose god roll is exactly what the user
  // asked for should outrank one where that combo is merely its 15th-best.
  // Computed only over already-filtered weapons (every one is guaranteed
  // to have all selected perks somewhere in its columns) and only when
  // perks are actually selected — no wasted work on the common browse-
  // without-filters path.
  const comboScoreByHash = useMemo(() => {
    const map = new Map<number, number>();
    if (selectedPerkNames.size === 0) return map;
    for (const w of filtered) {
      const result = comboScore(
        w,
        selectedPerkNames,
        perkMap,
        archetypeMap,
        synergyMap,
        scoringConfig,
      );
      map.set(w.hash, result.overall);
    }
    return map;
  }, [filtered, selectedPerkNames, perkMap, archetypeMap, synergyMap, scoringConfig]);

  // comboScoreByHash is always built from this same filtered/sorted
  // array (see its useMemo above), so a lookup for any weapon rendered or
  // sorted here is guaranteed present whenever perks are selected.
  const displayScore = (w: WeaponIndexEntry): number | null =>
    selectedPerkNames.size > 0 ? comboScoreByHash.get(w.hash)! : w.overall_score;

  const sorted = useMemo(() => {
    if (sort.key === "overall_score" && selectedPerkNames.size > 0) {
      const sign = sort.dir === "asc" ? 1 : -1;
      return [...filtered].sort((a, b) =>
        compareNullableNumber(
          comboScoreByHash.get(a.hash)!,
          comboScoreByHash.get(b.hash)!,
          sign,
        ),
      );
    }
    return [...filtered].sort((a, b) => compareWeapons(a, b, sort.key, sort.dir));
  }, [filtered, sort, selectedPerkNames, comboScoreByHash]);

  const hasFilters = Boolean(
    query ||
      selectedTypes.size > 0 ||
      slot ||
      element ||
      tier ||
      frame ||
      ammoType ||
      breakerType ||
      selectedPerkNames.size > 0,
  );

  const reset = () => {
    setQuery("");
    setSelectedTypes(new Set());
    setSlot("");
    setElement("");
    setTier("");
    setFrame("");
    setAmmoType("");
    setBreakerType("");
    setPerkQuery("");
    setSelectedPerkNames(new Set());
  };

  const addType = (value: string) =>
    setSelectedTypes((prev) => new Set(prev).add(value));
  const removeType = (value: string) =>
    setSelectedTypes((prev) => {
      const next = new Set(prev);
      next.delete(value);
      return next;
    });

  const addPerkName = (value: string) => {
    setSelectedPerkNames((prev) => new Set(prev).add(value));
    setPerkQuery("");
  };
  const removePerkName = (value: string) =>
    setSelectedPerkNames((prev) => {
      const next = new Set(prev);
      next.delete(value);
      return next;
    });

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
          <ChipMultiSelect
            label="Weapon type"
            placeholder="Add weapon type…"
            options={typeOptions}
            selected={selectedTypes}
            onAdd={addType}
            onRemove={removeType}
          />
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
          <select
            value={frame}
            onChange={(e) => setFrame(e.target.value)}
            className={selectClass}
            aria-label="Frame"
          >
            <option value="">All frames</option>
            {frames.map((f) => (
              <option key={f}>{f}</option>
            ))}
          </select>
          <select
            value={ammoType}
            onChange={(e) => setAmmoType(e.target.value)}
            className={selectClass}
            aria-label="Ammo type"
          >
            <option value="">All ammo types</option>
            {AMMO_TYPES.map((a) => (
              <option key={a}>{a}</option>
            ))}
          </select>
          <select
            value={breakerType}
            onChange={(e) => setBreakerType(e.target.value)}
            className={selectClass}
            aria-label="Champion mod"
          >
            <option value="">Any champion mod</option>
            {BREAKER_TYPES.map((b) => (
              <option key={b}>{b}</option>
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
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <input
            type="search"
            value={perkQuery}
            onChange={(e) => setPerkQuery(e.target.value)}
            placeholder="Search perks…"
            className={`${selectClass} w-full sm:w-48`}
          />
          <ChipMultiSelect
            label="Add a perk filter"
            placeholder="Add perk…"
            options={perkOptions}
            selected={selectedPerkNames}
            onAdd={addPerkName}
            onRemove={removePerkName}
          />
        </div>
        {selectedPerkNames.size > 0 && (
          <p className="mt-1 text-xs text-muted">
            Score reflects the best roll containing your selected perks.
          </p>
        )}
      </div>

      <div className="mt-2 hidden grid-cols-[3.25rem_1fr_10rem_6.5rem_4.5rem_4.5rem_4.5rem] gap-x-3 px-3 py-2 text-xs uppercase tracking-wide text-muted sm:grid">
        <span />
        <SortHeader label="Weapon" sortKey="name" sort={sort} onSort={toggleSort} />
        <SortHeader label="Type" sortKey="type" sort={sort} onSort={toggleSort} />
        <SortHeader label="Element" sortKey="element" sort={sort} onSort={toggleSort} />
        <SortHeader label="RPM" sortKey="rpm" sort={sort} onSort={toggleSort} align="right" />
        <SortHeader label="Score" sortKey="overall_score" sort={sort} onSort={toggleSort} align="right" />
        <SortHeader label="Rolls" sortKey="roll_count" sort={sort} onSort={toggleSort} align="right" />
      </div>

      <ul className="divide-y divide-edge/60">
        {sorted.map((w) => (
          <li key={w.hash} className="weapon-row">
            <Link
              href={`/weapons/${w.hash}`}
              className="grid grid-cols-[3.25rem_1fr_4.5rem] items-center gap-x-3 px-3 py-2 hover:bg-surface sm:grid-cols-[3.25rem_1fr_10rem_6.5rem_4.5rem_4.5rem_4.5rem]"
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
              <span className="hidden text-right font-mono text-sm text-muted sm:block">
                {displayScore(w) ?? "—"}
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
