package scoring

import "testing"

func TestDedupeByName(t *testing.T) {
	options := []NamedPerk{
		{PerkID: 1, Name: "Full Bore"},
		{PerkID: 2, Name: "Arrowhead Brake"},
		{PerkID: 3, Name: "Full Bore"}, // duplicate hash, same name
	}
	got := DedupeByName(options)
	if len(got) != 2 {
		t.Fatalf("got %d options, want 2", len(got))
	}
	if got[0].PerkID != 1 || got[0].Name != "Full Bore" {
		t.Errorf("first Full Bore = %+v, want the first-encountered id (1)", got[0])
	}
	if got[1].PerkID != 2 {
		t.Errorf("second option = %+v, want Arrowhead Brake (id 2)", got[1])
	}
}

func TestDedupeByName_Empty(t *testing.T) {
	if got := DedupeByName(nil); len(got) != 0 {
		t.Errorf("got %v, want empty", got)
	}
}

func TestTopNRolls(t *testing.T) {
	rolls := []RollForExpansion{
		{RollID: 1, Overall: 50},
		{RollID: 2, Overall: 90},
		{RollID: 3, Overall: 70},
	}

	t.Run("selects the highest-overall rolls, sorted descending", func(t *testing.T) {
		got := TopNRolls(rolls, 2)
		if len(got) != 2 || got[0].RollID != 2 || got[1].RollID != 3 {
			t.Errorf("got %+v, want [roll2(90), roll3(70)]", got)
		}
	})

	t.Run("n larger than the roll count returns everything", func(t *testing.T) {
		got := TopNRolls(rolls, 100)
		if len(got) != 3 {
			t.Errorf("got %d rolls, want all 3", len(got))
		}
	})

	t.Run("does not mutate the caller's slice", func(t *testing.T) {
		original := []RollForExpansion{{RollID: 1, Overall: 50}, {RollID: 2, Overall: 90}}
		_ = TopNRolls(original, 1)
		if original[0].RollID != 1 || original[1].RollID != 2 {
			t.Errorf("input slice was reordered: %+v", original)
		}
	})

	t.Run("empty input", func(t *testing.T) {
		if got := TopNRolls(nil, 15); len(got) != 0 {
			t.Errorf("got %v, want empty", got)
		}
	})
}

func TestExpandVariants_CartesianProduct(t *testing.T) {
	roll := RollForExpansion{
		RollID:  1,
		Overall: 80,
		Perks: []PerkContribution{
			{ColumnIndex: 2, PVEScore: 80, PVPScore: 80},
			{ColumnIndex: 3, PVEScore: 80, PVPScore: 80},
		},
		PerkIDs: []int64{100, 200},
	}
	barrels := []VariantOption{{PerkID: 1, PVEScore: 50, PVPScore: 50}, {PerkID: 2, PVEScore: 50, PVPScore: 50}}
	magazines := []VariantOption{{PerkID: 10, PVEScore: 50, PVPScore: 50}, {PerkID: 11, PVEScore: 50, PVPScore: 50}, {PerkID: 12, PVEScore: 50, PVPScore: 50}}

	got := ExpandVariants(roll, barrels, magazines, nil, nil, nil, weights)

	if len(got) != len(barrels)*len(magazines) {
		t.Fatalf("got %d variants, want %d (2 barrels x 3 magazines)", len(got), len(barrels)*len(magazines))
	}
	for _, v := range got {
		if v.RollID != 1 {
			t.Errorf("variant RollID = %d, want 1", v.RollID)
		}
		if v.BarrelPerkID == nil || v.MagazinePerkID == nil {
			t.Errorf("variant %+v missing barrel/magazine id", v)
		}
	}
}

func TestExpandVariants_NoBarrelColumnUsesNilSlot(t *testing.T) {
	roll := RollForExpansion{
		RollID: 1,
		Perks:  []PerkContribution{{ColumnIndex: 2, PVEScore: 80, PVPScore: 80}, {ColumnIndex: 3, PVEScore: 80, PVPScore: 80}},
	}
	magazines := []VariantOption{{PerkID: 10, PVEScore: 50, PVPScore: 50}}

	got := ExpandVariants(roll, nil, magazines, nil, nil, nil, weights)

	if len(got) != 1 {
		t.Fatalf("got %d variants, want 1 (no barrel x 1 magazine)", len(got))
	}
	if got[0].BarrelPerkID != nil {
		t.Errorf("BarrelPerkID = %v, want nil (weapon has no barrel column)", got[0].BarrelPerkID)
	}
	if got[0].MagazinePerkID == nil || *got[0].MagazinePerkID != 10 {
		t.Errorf("MagazinePerkID = %v, want 10", got[0].MagazinePerkID)
	}
}

func TestExpandVariants_NoBarrelOrMagazineStillProducesOneVariant(t *testing.T) {
	roll := RollForExpansion{
		RollID: 1,
		Perks:  []PerkContribution{{ColumnIndex: 2, PVEScore: 80, PVPScore: 80}, {ColumnIndex: 3, PVEScore: 80, PVPScore: 80}},
	}
	got := ExpandVariants(roll, nil, nil, nil, nil, nil, weights)
	if len(got) != 1 {
		t.Fatalf("got %d variants, want 1", len(got))
	}
	if got[0].BarrelPerkID != nil || got[0].MagazinePerkID != nil {
		t.Errorf("got %+v, want both nil", got[0])
	}
	// Score should equal the base roll's own trait-only score, since
	// there's no barrel/magazine contribution at all.
	wantPVE, wantPVP := RollPerkScore(roll.Perks, weights)
	wantOverall := OverallScore(BlendScore(nil, wantPVE, weights.BaseBlend), BlendScore(nil, wantPVP, weights.BaseBlend))
	if got[0].OverallScore != wantOverall {
		t.Errorf("OverallScore = %v, want %v (same as the unexpanded roll)", got[0].OverallScore, wantOverall)
	}
}

func TestExpandVariants_BarrelAndMagazineActuallyAffectScore(t *testing.T) {
	roll := RollForExpansion{
		RollID:  1,
		Perks:   []PerkContribution{{ColumnIndex: 2, PVEScore: 50, PVPScore: 50}, {ColumnIndex: 3, PVEScore: 50, PVPScore: 50}},
		PerkIDs: []int64{1, 2},
	}
	weakBarrel := []VariantOption{{PerkID: 10, PVEScore: 0, PVPScore: 0}}
	strongBarrel := []VariantOption{{PerkID: 11, PVEScore: 100, PVPScore: 100}}
	mag := []VariantOption{{PerkID: 20, PVEScore: 50, PVPScore: 50}}

	weak := ExpandVariants(roll, weakBarrel, mag, nil, nil, nil, weights)
	strong := ExpandVariants(roll, strongBarrel, mag, nil, nil, nil, weights)

	if weak[0].OverallScore >= strong[0].OverallScore {
		t.Errorf("weak barrel score %v should be less than strong barrel score %v — barrel choice must actually move the number",
			weak[0].OverallScore, strong[0].OverallScore)
	}
}

func TestExpandVariants_UsesSynergyAndArchetype(t *testing.T) {
	roll := RollForExpansion{
		RollID:  1,
		Perks:   []PerkContribution{{ColumnIndex: 2, PVEScore: 50, PVPScore: 50}},
		PerkIDs: []int64{1},
	}
	barrels := []VariantOption{{PerkID: 2, PVEScore: 50, PVPScore: 50}}
	synergies := map[SynergyKey]SynergyBonus{NewSynergyKey(1, 2): {PVE: 20, PVP: 0}}
	archPVE := 90.0

	got := ExpandVariants(roll, barrels, nil, synergies, &archPVE, nil, weights)
	if len(got) != 1 {
		t.Fatalf("got %d variants, want 1", len(got))
	}
	// Sanity: the synergy bonus and archetype base must have actually been
	// threaded through to RollScore, not silently dropped by the expansion.
	if got[0].PVEScore <= 50 {
		t.Errorf("PVEScore = %v, want > 50 (synergy bonus + a 90 archetype base should both push it up)", got[0].PVEScore)
	}
}
