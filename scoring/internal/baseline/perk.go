package baseline

// NeutralPerkScore is written for every perk with no sheet-derived signal
// — the "flat placeholder" from CLAUDE.md's hybrid-scoring decision.
// Deliberately not NULL: cmd/score's roll formula averages perk scores
// directly, and a concrete neutral value keeps that arithmetic NULL-free
// (the RPM-sort null-handling bug earlier in this project is exactly the
// class of mistake a stray NULL here would invite).
const NeutralPerkScore = 50

// PerkScore is the pair of values written to perk.pve_score/pvp_score.
type PerkScore struct {
	PVE int
	PVP int
}

// PVEPerkScores maps perk name -> its tier-derived score. The rows are
// already on a fixed 0-100 anchor scale (S=90 ... D=30, see
// scoring/data/README.md), so no normalization is needed here — just a
// straight lookup.
func PVEPerkScores(rows []PerkPVERow) map[string]int {
	out := make(map[string]int, len(rows))
	for _, r := range rows {
		out[r.Perk] = r.PVEScore
	}
	return out
}

// PVPPerkScores maps perk name -> a score derived from its damage
// multiplier. Multipliers cluster near 1.0 (no effect) with a handful
// running higher (a stronger perk); 50 + (multiplier-1)*25 keeps 1.0x at
// the neutral midpoint and spreads real signal across the 0-100 range
// without claiming false precision — this is a thin, admittedly rough
// layer by design (see CLAUDE.md), not a calibrated formula.
func PVPPerkScores(rows []PerkPVPRow) map[string]int {
	out := make(map[string]int, len(rows))
	for _, r := range rows {
		score := 50 + (r.Multiplier-1)*25
		out[r.Perk] = int(clamp01to100(score))
	}
	return out
}

// MergePerkScores looks up name in both baselines, falling back to the
// neutral placeholder for whichever side (or both) has no data.
func MergePerkScores(name string, pve, pvp map[string]int) PerkScore {
	score := PerkScore{PVE: NeutralPerkScore, PVP: NeutralPerkScore}
	if v, ok := pve[name]; ok {
		score.PVE = v
	}
	if v, ok := pvp[name]; ok {
		score.PVP = v
	}
	return score
}
