"use client";

import { useEffect, useRef, useState } from "react";

const inputClass =
  "w-full rounded-md border border-edge bg-surface px-2.5 py-2 text-sm text-ink outline-none focus:border-gold/60 sm:w-48";

// A single text input that both filters and drives its own dropdown of
// matches, directly beneath it — replacing the old pattern of a plain
// <select> plus a separate search box sitting beside it (real UX
// feedback: the search should be the dropdown's top element, not a
// sibling control). Not a full WAI-ARIA combobox (no
// aria-activedescendant/roving focus) — just a lightweight,
// Escape/click-outside-dismissible list of plain buttons, matching the
// rest of this app's native-control-first interaction style.
export default function SearchableMultiSelect({
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
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      if (!containerRef.current?.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  const q = query.trim().toLowerCase();
  const filteredOptions = q
    ? options.filter((o) => o.toLowerCase().includes(q))
    : options;

  const pick = (value: string) => {
    onAdd(value);
    setQuery("");
    setOpen(false);
  };

  return (
    <div
      ref={containerRef}
      className="flex flex-wrap items-center gap-1.5"
    >
      <div className="relative">
        <input
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === "Escape") setOpen(false);
          }}
          placeholder={placeholder}
          aria-label={label}
          className={inputClass}
        />
        {open && filteredOptions.length > 0 && (
          <ul
            role="listbox"
            className="absolute z-20 mt-1 max-h-56 w-full min-w-[10rem] overflow-y-auto rounded-md border border-edge bg-surface py-1 shadow-lg"
          >
            {filteredOptions.map((value) => (
              <li key={value}>
                <button
                  type="button"
                  onClick={() => pick(value)}
                  className="block w-full px-2.5 py-1.5 text-left text-sm text-ink hover:bg-bg"
                >
                  {value}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
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
