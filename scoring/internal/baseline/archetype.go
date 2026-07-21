package baseline

import "sort"

// ArchetypeKey identifies one (weapon_type, frame) pair — the join key
// ingest's weapon table already carries, and archetype_score's primary key.
type ArchetypeKey struct {
	WeaponType string
	Frame      string
}

// ArchetypeScore is one row ready to upsert into archetype_score.
type ArchetypeScore struct {
	WeaponType string
	Frame      string
	PVEScore   *float64 // nil when only PvP data exists for this archetype
	PVPScore   *float64 // nil when only PvE data exists for this archetype
	Source     string   // combined attribution, e.g. "PvE: ...; PvP: ..."
}

// clamp01to100 keeps a normalized value inside the 0-100 contract every
// score column in this schema shares.
func clamp01to100(v float64) float64 {
	if v < 0 {
		return 0
	}
	if v > 100 {
		return 100
	}
	return v
}

// minMaxNormalize maps each value in vals onto [0,100], where the group's
// minimum becomes 0 and its maximum becomes 100. A single-point (or
// zero-variance) group can't be differentiated from itself, so every
// member gets the neutral midpoint (50) rather than an arbitrary 100.
func minMaxNormalize(vals []float64) []float64 {
	if len(vals) == 0 {
		return nil
	}
	min, max := vals[0], vals[0]
	for _, v := range vals[1:] {
		if v < min {
			min = v
		}
		if v > max {
			max = v
		}
	}
	out := make([]float64, len(vals))
	if max == min {
		for i := range out {
			out[i] = 50
		}
		return out
	}
	for i, v := range vals {
		out[i] = clamp01to100(100 * (v - min) / (max - min))
	}
	return out
}

// NormalizePVEArchetypes min-max normalizes sustained_dps to 0-100,
// grouped by Scale — the Quantum sheet's per-type tabs and its All
// Weapons (Power-class) tab are NOT on the same raw scale (see
// scoring/data/README.md), so cross-scale comparison would be meaningless.
// Within a scale, the sheet's own stated methodology ("all weapon damage
// except exotics is normalized") makes cross-weapon-type comparison valid.
func NormalizePVEArchetypes(rows []ArchetypePVERow) map[ArchetypeKey]struct {
	Score  float64
	Source string
} {
	byScale := map[string][]int{} // scale -> row indices, for stable grouping
	for i, r := range rows {
		byScale[r.Scale] = append(byScale[r.Scale], i)
	}

	out := make(map[ArchetypeKey]struct {
		Score  float64
		Source string
	}, len(rows))

	for _, idxs := range byScale {
		sort.Ints(idxs) // deterministic iteration for reproducible output
		vals := make([]float64, len(idxs))
		for j, i := range idxs {
			vals[j] = rows[i].SustainedDPS
		}
		normalized := minMaxNormalize(vals)
		for j, i := range idxs {
			r := rows[i]
			out[ArchetypeKey{WeaponType: r.WeaponType, Frame: r.Frame}] = struct {
				Score  float64
				Source string
			}{Score: normalized[j], Source: r.Source}
		}
	}
	return out
}

// NormalizePVPArchetypes min-max normalizes optimal_ttk_s to 0-100,
// inverted (lower TtK — a faster kill — is better, so it maps to a
// higher score). TtK is a single directly-comparable scale across weapon
// types by construction (it's already "seconds to kill a fixed target"),
// so there's one group, not one per weapon type.
func NormalizePVPArchetypes(rows []ArchetypePVPRow) map[ArchetypeKey]struct {
	Score  float64
	Source string
} {
	out := make(map[ArchetypeKey]struct {
		Score  float64
		Source string
	}, len(rows))
	if len(rows) == 0 {
		return out
	}

	min, max := rows[0].OptimalTtK, rows[0].OptimalTtK
	for _, r := range rows[1:] {
		if r.OptimalTtK < min {
			min = r.OptimalTtK
		}
		if r.OptimalTtK > max {
			max = r.OptimalTtK
		}
	}

	for _, r := range rows {
		var score float64
		if max == min {
			score = 50
		} else {
			// Inverted: fastest (min) TtK -> 100, slowest (max) -> 0.
			score = clamp01to100(100 * (max - r.OptimalTtK) / (max - min))
		}
		key := ArchetypeKey{WeaponType: r.WeaponType, Frame: r.Frame}
		// A (weapon_type, frame) can appear more than once (e.g. distinct
		// ammo classes); keep the better (higher) score, matching the
		// ceiling philosophy used everywhere else in this design.
		if existing, ok := out[key]; !ok || score > existing.Score {
			out[key] = struct {
				Score  float64
				Source string
			}{Score: score, Source: r.Source}
		}
	}
	return out
}

// MergeArchetypeScores unions the PvE and PvP key sets into the rows
// archetype_score actually stores — an archetype with only one side's
// data gets a nil on the other, exactly matching the nullable schema.
func MergeArchetypeScores(
	pve map[ArchetypeKey]struct {
		Score  float64
		Source string
	},
	pvp map[ArchetypeKey]struct {
		Score  float64
		Source string
	},
) []ArchetypeScore {
	keys := make(map[ArchetypeKey]struct{}, len(pve)+len(pvp))
	for k := range pve {
		keys[k] = struct{}{}
	}
	for k := range pvp {
		keys[k] = struct{}{}
	}

	out := make([]ArchetypeScore, 0, len(keys))
	for k := range keys {
		row := ArchetypeScore{WeaponType: k.WeaponType, Frame: k.Frame}
		var sources []string
		if p, ok := pve[k]; ok {
			v := p.Score
			row.PVEScore = &v
			sources = append(sources, "PvE: "+p.Source)
		}
		if p, ok := pvp[k]; ok {
			v := p.Score
			row.PVPScore = &v
			sources = append(sources, "PvP: "+p.Source)
		}
		row.Source = joinSources(sources)
		out = append(out, row)
	}
	sort.Slice(out, func(i, j int) bool {
		if out[i].WeaponType != out[j].WeaponType {
			return out[i].WeaponType < out[j].WeaponType
		}
		return out[i].Frame < out[j].Frame
	})
	return out
}

func joinSources(sources []string) string {
	switch len(sources) {
	case 0:
		return ""
	case 1:
		return sources[0]
	default:
		return sources[0] + "; " + sources[1]
	}
}
