package scoring

import "testing"

// weights mirrors scoring_config's actual starting values (0.10/0.10/
// 0.30/0.30/0.20, base_blend 0.50) so tests exercise the real ratios.
var weights = Weights{
	Column:    [5]float64{0.10, 0.10, 0.30, 0.30, 0.20},
	BaseBlend: 0.50,
}

func TestClamp(t *testing.T) {
	tests := []struct {
		in, want float64
	}{
		{-50, 0},
		{-0.001, 0},
		{0, 0},
		{50, 50},
		{100, 100},
		{100.001, 100},
		{500, 100},
	}
	for _, tt := range tests {
		if got := clamp(tt.in); got != tt.want {
			t.Errorf("clamp(%v) = %v, want %v", tt.in, got, tt.want)
		}
	}
}

func TestRollPerkScore_TwoColumnWeapon(t *testing.T) {
	// A weapon with no origin trait: only columns 2 and 3 (trait1, trait2)
	// appear in roll_perk, matching e.g. Fatebringer's real shape.
	perks := []PerkContribution{
		{ColumnIndex: 2, PVEScore: 90, PVPScore: 50}, // weight 0.30
		{ColumnIndex: 3, PVEScore: 60, PVPScore: 50}, // weight 0.30
	}
	pve, pvp := RollPerkScore(perks, weights)

	// Renormalized: weights sum to 0.60, so this is a plain 50/50 average
	// of the two trait scores, NOT diluted by the unused column5_weight.
	wantPVE := 75.0 // (90+60)/2
	if pve != wantPVE {
		t.Errorf("pve = %v, want %v", pve, wantPVE)
	}
	if pvp != 50 {
		t.Errorf("pvp = %v, want 50", pvp)
	}
}

func TestRollPerkScore_ThreeColumnWeapon(t *testing.T) {
	// A weapon with an origin trait: columns 2, 3, 4 all present, matching
	// e.g. Truthteller's real shape.
	perks := []PerkContribution{
		{ColumnIndex: 2, PVEScore: 90, PVPScore: 50},
		{ColumnIndex: 3, PVEScore: 90, PVPScore: 50},
		{ColumnIndex: 4, PVEScore: 30, PVPScore: 50},
	}
	pve, _ := RollPerkScore(perks, weights)

	// (0.30*90 + 0.30*90 + 0.20*30) / (0.30+0.30+0.20) = 60/0.8 = 75
	want := 75.0
	if pve != want {
		t.Errorf("pve = %v, want %v", pve, want)
	}
}

func TestRollPerkScore_RenormalizationIgnoresUnusedWeight(t *testing.T) {
	// A two-column weapon's columns sum to only 0.60 of the full 1.00
	// weight (column3+column4, no column5). Renormalizing means the
	// result is a plain average of what's present, not diluted by
	// dividing against the unused column5_weight as if it were a real
	// zero-scored column.
	perks := []PerkContribution{
		{ColumnIndex: 2, PVEScore: 80, PVPScore: 80},
		{ColumnIndex: 3, PVEScore: 80, PVPScore: 80},
	}
	pve, pvp := RollPerkScore(perks, weights)
	if pve != 80 || pvp != 80 {
		t.Errorf("got (%v,%v), want (80,80) — unused column5_weight must not drag the average down", pve, pvp)
	}
}

func TestRollPerkScore_EmptyPerksReturnsNeutral(t *testing.T) {
	pve, pvp := RollPerkScore(nil, weights)
	if pve != defaultScore || pvp != defaultScore {
		t.Errorf("got (%v,%v), want (%v,%v)", pve, pvp, defaultScore, defaultScore)
	}
}

func TestRollPerkScore_OutOfRangeColumnIndexIgnored(t *testing.T) {
	perks := []PerkContribution{
		{ColumnIndex: 2, PVEScore: 90, PVPScore: 90},
		{ColumnIndex: 99, PVEScore: 1, PVPScore: 1}, // must not panic or skew the result
	}
	pve, pvp := RollPerkScore(perks, weights)
	if pve != 90 || pvp != 90 {
		t.Errorf("got (%v,%v), want (90,90) — the invalid column should be ignored entirely", pve, pvp)
	}
}

func TestNewSynergyKey_OrderIndependent(t *testing.T) {
	if NewSynergyKey(5, 10) != NewSynergyKey(10, 5) {
		t.Error("SynergyKey must be the same regardless of argument order")
	}
	k := NewSynergyKey(5, 10)
	if k[0] != 5 || k[1] != 10 {
		t.Errorf("got %v, want [5,10] (lower id first)", k)
	}
}

func TestSynergyContribution(t *testing.T) {
	synergies := map[SynergyKey]SynergyBonus{
		NewSynergyKey(1, 2): {PVE: 5, PVP: 2},
		NewSynergyKey(2, 3): {PVE: 3, PVP: 0},
	}

	t.Run("sums every matching pair, not just adjacent ones", func(t *testing.T) {
		// perks [1,2,3]: pairs (1,2) matches, (1,3) doesn't, (2,3) matches.
		pve, pvp := SynergyContribution([]int64{1, 2, 3}, synergies)
		if pve != 8 || pvp != 2 {
			t.Errorf("got (%v,%v), want (8,2)", pve, pvp)
		}
	})

	t.Run("no matches sums to zero", func(t *testing.T) {
		pve, pvp := SynergyContribution([]int64{100, 200}, synergies)
		if pve != 0 || pvp != 0 {
			t.Errorf("got (%v,%v), want (0,0)", pve, pvp)
		}
	})

	t.Run("fewer than two perks has no pairs to check", func(t *testing.T) {
		pve, pvp := SynergyContribution([]int64{1}, synergies)
		if pve != 0 || pvp != 0 {
			t.Errorf("got (%v,%v), want (0,0)", pve, pvp)
		}
	})

	t.Run("empty synergy map", func(t *testing.T) {
		pve, pvp := SynergyContribution([]int64{1, 2}, nil)
		if pve != 0 || pvp != 0 {
			t.Errorf("got (%v,%v), want (0,0)", pve, pvp)
		}
	})
}

func TestBlendScore(t *testing.T) {
	t.Run("with archetype data, blends base and perk layer", func(t *testing.T) {
		base := 80.0
		got := BlendScore(&base, 40, 0.5)
		want := 60.0 // 0.5*80 + 0.5*40
		if got != want {
			t.Errorf("got %v, want %v", got, want)
		}
	})

	t.Run("nil archetype falls back to neutral base, not perk-layer-only", func(t *testing.T) {
		got := BlendScore(nil, 100, 0.5)
		want := 75.0 // 0.5*50 (neutral) + 0.5*100
		if got != want {
			t.Errorf("got %v, want %v", got, want)
		}
	})

	t.Run("clamps above 100", func(t *testing.T) {
		base := 100.0
		if got := BlendScore(&base, 100, 1.0); got != 100 {
			t.Errorf("got %v, want 100", got)
		}
	})

	t.Run("clamps below 0", func(t *testing.T) {
		base := 0.0
		if got := BlendScore(&base, 0, 0.0); got != 0 {
			t.Errorf("got %v, want 0", got)
		}
	})

	t.Run("base_blend of 0 is pure perk layer", func(t *testing.T) {
		base := 999.0 // would dominate if base_blend were misapplied
		if got := BlendScore(&base, 42, 0); got != 42 {
			t.Errorf("got %v, want 42 (base_blend=0 means the base contributes nothing)", got)
		}
	})

	t.Run("base_blend of 1 is pure archetype base", func(t *testing.T) {
		base := 77.0
		if got := BlendScore(&base, 999, 1); got != 77 {
			t.Errorf("got %v, want 77 (base_blend=1 means the perk layer contributes nothing)", got)
		}
	})
}

func TestOverallScore(t *testing.T) {
	if got := OverallScore(80, 60); got != 70 {
		t.Errorf("got %v, want 70", got)
	}
	if got := OverallScore(50, 50); got != 50 {
		t.Errorf("got %v, want 50", got)
	}
}

func TestRollScore_EndToEnd(t *testing.T) {
	perks := []PerkContribution{
		{ColumnIndex: 2, PVEScore: 90, PVPScore: 40},
		{ColumnIndex: 3, PVEScore: 90, PVPScore: 40},
	}
	perkIDs := []int64{10, 20}
	synergies := map[SynergyKey]SynergyBonus{
		NewSynergyKey(10, 20): {PVE: 5, PVP: 5},
	}
	archetypePVE := 70.0
	archetypePVP := 60.0

	pve, pvp, overall := RollScore(perks, perkIDs, synergies, &archetypePVE, &archetypePVP, weights)

	// Perk layer: RollPerkScore(90,90 renormalized 0.30/0.30) = 90, + synergy 5 = 95.
	// Blend: 0.5*70 + 0.5*95 = 82.5
	if pve != 82.5 {
		t.Errorf("pve = %v, want 82.5", pve)
	}
	// Perk layer: 40 + synergy 5 = 45. Blend: 0.5*60 + 0.5*45 = 52.5
	if pvp != 52.5 {
		t.Errorf("pvp = %v, want 52.5", pvp)
	}
	if overall != (82.5+52.5)/2 {
		t.Errorf("overall = %v, want %v", overall, (82.5+52.5)/2)
	}
}

func TestRollScore_NoArchetypeDataFallsBackToNeutralBase(t *testing.T) {
	perks := []PerkContribution{
		{ColumnIndex: 2, PVEScore: 50, PVPScore: 50},
		{ColumnIndex: 3, PVEScore: 50, PVPScore: 50},
	}
	pve, pvp, overall := RollScore(perks, []int64{1, 2}, nil, nil, nil, weights)
	// Everything neutral: perk layer is 50, base falls back to 50, blend of
	// two 50s is 50, overall is 50.
	if pve != 50 || pvp != 50 || overall != 50 {
		t.Errorf("got (%v,%v,%v), want all 50", pve, pvp, overall)
	}
}
