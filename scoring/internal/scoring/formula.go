// Package scoring implements the hybrid scoring formula: a roll's score
// blends the archetype-intrinsic base layer (measured, see
// scoring/data/README.md) with a column-weighted perk layer, per
// CLAUDE.md's hybrid-scoring decision (2026-07-20). Every function here is
// pure — no I/O — so the formula's actual math is directly unit-testable;
// cmd/score owns reading the database and calling into this package.
package scoring

// defaultScore is the neutral midpoint used when there's nothing to
// compute from (an empty perk list, a missing archetype match) — the same
// value as baseline.NeutralPerkScore, but a distinct constant: this one
// covers formula-level degenerate cases, not "perk has no sheet data".
const defaultScore = 50.0

func clamp(v float64) float64 {
	if v < 0 {
		return 0
	}
	if v > 100 {
		return 100
	}
	return v
}

// Weights holds scoring_config's tunable knobs. Column[i] is
// columnN+1_weight, corresponding to weapon_perk.column_index i: 0=barrel,
// 1=magazine, 2=trait 1, 3=trait 2, 4=origin trait — verified against real
// exported weapon data (see CLAUDE.md). Only indices 2-4 are ever used by
// RollPerkScore: barrel/magazine perks never appear in roll_perk (ingest's
// roll generation is trait+origin only), so columns 0-1's weight is spent
// entirely at roll_variant expansion time, not here.
type Weights struct {
	Column    [5]float64
	BaseBlend float64
}

// PerkContribution is one perk in a roll: which column it's in, and its
// baseline pve/pvp scores (sheet-derived or the neutral placeholder — see
// internal/baseline).
type PerkContribution struct {
	ColumnIndex int
	PVEScore    int
	PVPScore    int
}

// RollPerkScore computes the column-weighted average of a roll's perks,
// renormalized across whichever columns are actually present. Without
// renormalizing, a two-column weapon (no origin trait) would always score
// lower than a three-column weapon purely for lacking a column to weight,
// not because its actual perks are worse — renormalizing treats "the
// columns this weapon has" as the full 100% of the perk layer for that
// weapon.
func RollPerkScore(perks []PerkContribution, weights Weights) (pve, pvp float64) {
	var totalWeight, pveSum, pvpSum float64
	for _, p := range perks {
		if p.ColumnIndex < 0 || p.ColumnIndex >= len(weights.Column) {
			continue // an out-of-range column index is a data bug elsewhere; ignore rather than panic
		}
		w := weights.Column[p.ColumnIndex]
		totalWeight += w
		pveSum += w * float64(p.PVEScore)
		pvpSum += w * float64(p.PVPScore)
	}
	if totalWeight == 0 {
		return defaultScore, defaultScore
	}
	return pveSum / totalWeight, pvpSum / totalWeight
}

// SynergyKey is a normalized (perk_a_id, perk_b_id) pair matching
// perk_synergy's CHECK(perk_a_id < perk_b_id) constraint, so callers don't
// need to know or care which order a pair was curated in.
type SynergyKey [2]int64

// NewSynergyKey builds a SynergyKey from two perk ids in either order.
func NewSynergyKey(a, b int64) SynergyKey {
	if a > b {
		a, b = b, a
	}
	return SynergyKey{a, b}
}

// SynergyBonus is one curated pairwise bonus from perk_synergy.
type SynergyBonus struct {
	PVE, PVP float64
}

// SynergyContribution sums the bonus for every pair of perks in the roll
// with a curated synergy entry — checks all pairs (a 3-perk roll checks
// all 3 pairs), not just adjacent ones.
func SynergyContribution(perkIDs []int64, synergies map[SynergyKey]SynergyBonus) (pve, pvp float64) {
	for i := range perkIDs {
		for j := i + 1; j < len(perkIDs); j++ {
			if b, ok := synergies[NewSynergyKey(perkIDs[i], perkIDs[j])]; ok {
				pve += b.PVE
				pvp += b.PVP
			}
		}
	}
	return pve, pvp
}

// BlendScore combines the archetype-intrinsic base with the perk-layer
// score per scoring_config.base_blend. archetypeScore is nil when the
// weapon's (weapon_type, normalized frame) has no measured data (common
// for Exotics with unique intrinsic names) — it falls back to the neutral
// midpoint rather than silently collapsing the blend to the perk layer
// alone, which would understate baseBlend's intended weight.
func BlendScore(archetypeScore *float64, perkLayerScore, baseBlend float64) float64 {
	base := defaultScore
	if archetypeScore != nil {
		base = *archetypeScore
	}
	return clamp(baseBlend*base + (1-baseBlend)*perkLayerScore)
}

// OverallScore combines a roll's PvE and PvP scores into one headline
// number. A simple average: CLAUDE.md doesn't specify any other
// weighting, and an average is the least-surprising default absent one.
func OverallScore(pve, pvp float64) float64 {
	return (pve + pvp) / 2
}

// RollScore computes one roll's final pve/pvp/overall scores end to end:
// the column-weighted perk average plus any perk_synergy bonuses (the
// perk layer), blended with the archetype-intrinsic base per
// scoring_config.base_blend.
func RollScore(
	perks []PerkContribution,
	perkIDs []int64,
	synergies map[SynergyKey]SynergyBonus,
	archetypePVE, archetypePVP *float64,
	weights Weights,
) (pve, pvp, overall float64) {
	basePVE, basePVP := RollPerkScore(perks, weights)
	synPVE, synPVP := SynergyContribution(perkIDs, synergies)
	perkLayerPVE := clamp(basePVE + synPVE)
	perkLayerPVP := clamp(basePVP + synPVP)

	pve = BlendScore(archetypePVE, perkLayerPVE, weights.BaseBlend)
	pvp = BlendScore(archetypePVP, perkLayerPVP, weights.BaseBlend)
	overall = OverallScore(pve, pvp)
	return pve, pvp, overall
}
