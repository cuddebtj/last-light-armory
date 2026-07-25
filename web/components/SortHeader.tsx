"use client";

// A clickable column-header button with an active-sort indicator (▲/▼).
// Generic over the sort key type so it works for both the weapon index's
// grid-based header row and a plain <table>'s <th> (wrap it in a <th>
// yourself — this renders just the button, no wrapping element, since
// the two callers need different wrappers).
export default function SortHeader<Key extends string>({
  label,
  sortKey,
  sort,
  onSort,
  align,
}: {
  label: string;
  sortKey: Key;
  sort: { key: Key; dir: "asc" | "desc" };
  onSort: (key: Key) => void;
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
