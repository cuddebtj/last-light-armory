package scoring

import "strings"

// NormalizeFrame maps a DB weapon.frame value onto the vocabulary
// scoring/data's sheet-derived archetype_score rows use, so the two can
// join on (weapon_type, frame). Verified against every distinct
// (weapon_type, frame) pair in the live database, not guessed:
//
//   - Most archetypes carry a literal " Frame" suffix ("Adaptive Frame",
//     "Micro-Missile Frame", "Wave Sword Frame"), which the sheets never
//     include.
//   - Glaive is the one weapon type that doesn't use "Frame" at all —
//     its archetypes are named directly ("Adaptive Glaive"), so " Glaive"
//     needs its own strip.
//   - Heat-frame archetypes ("Balanced Heat Weapon", "Dynamic Heat
//     Weapon") end in " Weapon" instead of " Frame".
//   - "Rapid Fire" (space) in the DB vs "Rapid-Fire" (hyphen) in the
//     sheets is a pure punctuation mismatch, not a different archetype.
//
// Many Exotics carry a unique intrinsic name with none of these suffixes
// (e.g. "SUROS Legacy", "Ranged Weapon") — NormalizeFrame leaves those
// unchanged, and they simply won't match any archetype_score row, which
// is the intended fallback-to-neutral behavior, not an error.
func NormalizeFrame(dbFrame string) string {
	f := strings.ReplaceAll(dbFrame, "Rapid Fire", "Rapid-Fire")
	for _, suffix := range [...]string{" Frame", " Glaive", " Weapon"} {
		if strings.HasSuffix(f, suffix) {
			return strings.TrimSuffix(f, suffix)
		}
	}
	return f
}

// ArchetypeKey identifies one (weapon_type, frame) pair — archetype_score's
// primary key, and the join target once a DB frame has gone through
// NormalizeFrame.
type ArchetypeKey struct {
	WeaponType string
	Frame      string
}

// ArchetypeBase is one archetype_score row's measured values. Either side
// is nil when that half has no sheet data (see scoring/data/README.md).
type ArchetypeBase struct {
	PVE *float64
	PVP *float64
}
