// Shared Tailwind class lookups for weapon element/tier styling. Literal
// strings (not template-built) so Tailwind's scanner picks them up.

export const ELEMENT_TEXT: Record<string, string> = {
  Kinetic: "text-kinetic",
  Arc: "text-arc",
  Solar: "text-solar",
  Void: "text-void",
  Stasis: "text-stasis",
  Strand: "text-strand",
};

export const TIER_BORDER: Record<string, string> = {
  Exotic: "border-exotic",
  Legendary: "border-legendary",
  Rare: "border-rare",
  Uncommon: "border-uncommon",
  Common: "border-common",
};

export const TIER_TEXT: Record<string, string> = {
  Exotic: "text-exotic",
  Legendary: "text-legendary",
  Rare: "text-rare",
  Uncommon: "text-uncommon",
  Common: "text-common",
};
