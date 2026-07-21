package scoring

import "sort"

// NamedPerk is a perk option before name-based deduplication — used only
// for barrel/magazine columns, the one place Destiny 2's duplicate-hash-
// same-name manifest quirk actually matters for expansion (trait/origin
// columns are scored as-is, never expanded).
type NamedPerk struct {
	PerkID int64
	Name   string
}

// DedupeByName keeps the first-encountered option per distinct name.
// Mirrors the web app's identically-motivated dedupeByName: the manifest
// sometimes defines the same perk under multiple hashes, and expanding
// across both would generate roll_variant rows that score identically —
// pure waste, not real variety. Verified against real data: without this,
// the average weapon has ~14 raw barrel/magazine rows but only ~7
// distinct names.
func DedupeByName(options []NamedPerk) []NamedPerk {
	seen := make(map[string]bool, len(options))
	out := make([]NamedPerk, 0, len(options))
	for _, o := range options {
		if seen[o.Name] {
			continue
		}
		seen[o.Name] = true
		out = append(out, o)
	}
	return out
}

// RollForExpansion is one already-scored roll, kept around long enough to
// expand into roll_variant rows: its trait/origin perks (carried into
// every variant) and overall score (the top-N ranking signal).
type RollForExpansion struct {
	RollID  int64
	Overall float64
	Perks   []PerkContribution
	PerkIDs []int64
}

// TopNRolls returns the n highest-Overall rolls — ceiling philosophy,
// matching "best single roll represents the weapon" — or all of them if
// there are n or fewer. Does not mutate the input slice.
func TopNRolls(rolls []RollForExpansion, n int) []RollForExpansion {
	sorted := make([]RollForExpansion, len(rolls))
	copy(sorted, rolls)
	sort.Slice(sorted, func(i, j int) bool { return sorted[i].Overall > sorted[j].Overall })
	if n >= 0 && len(sorted) > n {
		sorted = sorted[:n]
	}
	return sorted
}

// VariantOption is a barrel or magazine choice, already resolved to its
// baseline pve/pvp scores (post-dedup — see DedupeByName).
type VariantOption struct {
	PerkID   int64
	PVEScore int
	PVPScore int
}

// Variant is one barrel x magazine expansion of a roll, fully scored.
type Variant struct {
	RollID         int64
	BarrelPerkID   *int64 // nil when the weapon has no barrel column at all
	MagazinePerkID *int64 // nil when the weapon has no magazine column at all
	PVEScore       float64
	PVPScore       float64
	OverallScore   float64
}

// ExpandVariants scores every barrel x magazine combination for one roll.
// This deliberately reuses RollScore wholesale rather than inventing a
// separate "flat adjustment" mechanism: column1/column2's weights are
// already small relative to the trait columns (0.10 vs 0.30 in the
// starting config), so folding barrel/magazine into the same column-
// weighted-average-plus-synergy-plus-blend formula naturally produces the
// "small adjustment... less weight" CLAUDE.md calls for, using the exact
// machinery already built and tested for the base roll score.
//
// A weapon missing a barrel (or magazine) column entirely (a handful of
// real weapons do) contributes a single nil slot rather than being
// skipped, so the roll still gets expanded across whichever column it
// does have.
func ExpandVariants(
	roll RollForExpansion,
	barrels, magazines []VariantOption,
	synergies map[SynergyKey]SynergyBonus,
	archetypePVE, archetypePVP *float64,
	weights Weights,
) []Variant {
	barrelSlots := optionsOrNilSlot(barrels)
	magSlots := optionsOrNilSlot(magazines)

	out := make([]Variant, 0, len(barrelSlots)*len(magSlots))
	for _, b := range barrelSlots {
		for _, m := range magSlots {
			perks := make([]PerkContribution, len(roll.Perks), len(roll.Perks)+2)
			copy(perks, roll.Perks)
			perkIDs := make([]int64, len(roll.PerkIDs), len(roll.PerkIDs)+2)
			copy(perkIDs, roll.PerkIDs)

			var barrelID, magID *int64
			if b != nil {
				perks = append(perks, PerkContribution{ColumnIndex: 0, PVEScore: b.PVEScore, PVPScore: b.PVPScore})
				perkIDs = append(perkIDs, b.PerkID)
				id := b.PerkID
				barrelID = &id
			}
			if m != nil {
				perks = append(perks, PerkContribution{ColumnIndex: 1, PVEScore: m.PVEScore, PVPScore: m.PVPScore})
				perkIDs = append(perkIDs, m.PerkID)
				id := m.PerkID
				magID = &id
			}

			pve, pvp, overall := RollScore(perks, perkIDs, synergies, archetypePVE, archetypePVP, weights)
			out = append(out, Variant{
				RollID: roll.RollID, BarrelPerkID: barrelID, MagazinePerkID: magID,
				PVEScore: pve, PVPScore: pvp, OverallScore: overall,
			})
		}
	}
	return out
}

func optionsOrNilSlot(options []VariantOption) []*VariantOption {
	if len(options) == 0 {
		return []*VariantOption{nil}
	}
	ptrs := make([]*VariantOption, len(options))
	for i := range options {
		ptrs[i] = &options[i]
	}
	return ptrs
}
