package baseline

import "testing"

func TestMinMaxNormalize(t *testing.T) {
	tests := []struct {
		name string
		vals []float64
		want []float64
	}{
		{"empty", nil, nil},
		{"single value has no variance -> neutral", []float64{42}, []float64{50}},
		{"all equal -> neutral", []float64{10, 10, 10}, []float64{50, 50, 50}},
		{"spread maps min to 0, max to 100", []float64{0, 50, 100}, []float64{0, 50, 100}},
		{"unsorted input still maps correctly", []float64{100, 0, 25}, []float64{100, 0, 25}},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := minMaxNormalize(tt.vals)
			if len(got) != len(tt.want) {
				t.Fatalf("length = %d, want %d", len(got), len(tt.want))
			}
			for i := range got {
				if got[i] != tt.want[i] {
					t.Errorf("[%d] = %v, want %v", i, got[i], tt.want[i])
				}
			}
		})
	}
}

func TestNormalizePVEArchetypes_GroupsByScale(t *testing.T) {
	rows := []ArchetypePVERow{
		{WeaponType: "Auto Rifle", Frame: "Adaptive", SustainedDPS: 200, Scale: "tab", Source: "quantum"},
		{WeaponType: "Auto Rifle", Frame: "Rapid-Fire", SustainedDPS: 300, Scale: "tab", Source: "quantum"},
		{WeaponType: "Rocket Launcher", Frame: "Adaptive", SustainedDPS: 60000, Scale: "all_weapons_power", Source: "quantum-power"},
		{WeaponType: "Rocket Launcher", Frame: "Aggressive", SustainedDPS: 70000, Scale: "all_weapons_power", Source: "quantum-power"},
	}
	got := NormalizePVEArchetypes(rows)

	if len(got) != 4 {
		t.Fatalf("got %d keys, want 4", len(got))
	}
	// Within the "tab" group, 200 is the min (-> 0) and 300 is the max (-> 100).
	if v := got[ArchetypeKey{"Auto Rifle", "Adaptive"}]; v.Score != 0 {
		t.Errorf("Auto Rifle/Adaptive score = %v, want 0", v.Score)
	}
	if v := got[ArchetypeKey{"Auto Rifle", "Rapid-Fire"}]; v.Score != 100 {
		t.Errorf("Auto Rifle/Rapid-Fire score = %v, want 100", v.Score)
	}
	// A huge raw Power-class number must NOT leak into or skew the "tab"
	// group's normalization — the two groups are on unrelated scales.
	if v := got[ArchetypeKey{"Rocket Launcher", "Adaptive"}]; v.Score != 0 {
		t.Errorf("Rocket Launcher/Adaptive score = %v, want 0 (its own group's min)", v.Score)
	}
	if v := got[ArchetypeKey{"Rocket Launcher", "Aggressive"}]; v.Score != 100 {
		t.Errorf("Rocket Launcher/Aggressive score = %v, want 100", v.Score)
	}

	if got[ArchetypeKey{"Auto Rifle", "Adaptive"}].Source != "quantum" {
		t.Errorf("source not carried through")
	}
}

func TestNormalizePVPArchetypes_InvertsTtK(t *testing.T) {
	rows := []ArchetypePVPRow{
		{WeaponType: "Hand Cannon", Frame: "Adaptive", OptimalTtK: 0.8, Source: "ws"},
		{WeaponType: "Hand Cannon", Frame: "Aggressive", OptimalTtK: 0.6, Source: "ws"},  // faster kill
		{WeaponType: "Sniper Rifle", Frame: "Rapid-Fire", OptimalTtK: 1.2, Source: "ws"}, // slowest
	}
	got := NormalizePVPArchetypes(rows)

	// Fastest TtK (0.6) -> highest score (100); slowest (1.2) -> lowest (0).
	if v := got[ArchetypeKey{"Hand Cannon", "Aggressive"}]; v.Score != 100 {
		t.Errorf("fastest TtK score = %v, want 100", v.Score)
	}
	if v := got[ArchetypeKey{"Sniper Rifle", "Rapid-Fire"}]; v.Score != 0 {
		t.Errorf("slowest TtK score = %v, want 0", v.Score)
	}
	mid := got[ArchetypeKey{"Hand Cannon", "Adaptive"}].Score
	if mid <= 0 || mid >= 100 {
		t.Errorf("middle TtK score = %v, want strictly between 0 and 100", mid)
	}
}

func TestNormalizePVPArchetypes_DuplicateKeyKeepsBetterScore(t *testing.T) {
	// Same (weapon_type, frame) with two ammo-class rows: ceiling philosophy
	// keeps the higher (better) of the two scores, not an average.
	rows := []ArchetypePVPRow{
		{WeaponType: "Sidearm", Frame: "Adaptive", Ammo: "Primary", OptimalTtK: 1.0, Source: "a"},
		{WeaponType: "Sidearm", Frame: "Adaptive", Ammo: "Special", OptimalTtK: 0.5, Source: "b"},
	}
	got := NormalizePVPArchetypes(rows)
	// 0.5 is the faster (better) TtK of the two, so it should win regardless
	// of row order.
	if got[ArchetypeKey{"Sidearm", "Adaptive"}].Source != "b" {
		t.Errorf("expected the better-scoring row (source b) to win, got source %q",
			got[ArchetypeKey{"Sidearm", "Adaptive"}].Source)
	}
}

func TestNormalizePVPArchetypes_ZeroVarianceIsNeutral(t *testing.T) {
	rows := []ArchetypePVPRow{
		{WeaponType: "Sword", Frame: "Adaptive", OptimalTtK: 1.0, Source: "ws"},
		{WeaponType: "Sword", Frame: "Aggressive", OptimalTtK: 1.0, Source: "ws"},
	}
	got := NormalizePVPArchetypes(rows)
	for k, v := range got {
		if v.Score != 50 {
			t.Errorf("%+v score = %v, want 50 (no variance to differentiate)", k, v.Score)
		}
	}
}

func TestNormalizeArchetypes_EmptyInput(t *testing.T) {
	if got := NormalizePVEArchetypes(nil); len(got) != 0 {
		t.Errorf("NormalizePVEArchetypes(nil) = %v, want empty", got)
	}
	if got := NormalizePVPArchetypes(nil); len(got) != 0 {
		t.Errorf("NormalizePVPArchetypes(nil) = %v, want empty", got)
	}
}

func TestMergeArchetypeScores(t *testing.T) {
	pve := map[ArchetypeKey]struct {
		Score  float64
		Source string
	}{
		{"Auto Rifle", "Adaptive"}: {Score: 80, Source: "pve-src"},
		{"Sword", "Caster"}:        {Score: 40, Source: "pve-only-src"},
	}
	pvp := map[ArchetypeKey]struct {
		Score  float64
		Source string
	}{
		{"Auto Rifle", "Adaptive"}: {Score: 60, Source: "pvp-src"},
		{"Bow", "Precision"}:       {Score: 90, Source: "pvp-only-src"},
	}

	got := MergeArchetypeScores(pve, pvp)
	if len(got) != 3 {
		t.Fatalf("got %d rows, want 3 (union of keys)", len(got))
	}

	byKey := map[ArchetypeKey]ArchetypeScore{}
	for _, r := range got {
		byKey[ArchetypeKey{r.WeaponType, r.Frame}] = r
	}

	both := byKey[ArchetypeKey{"Auto Rifle", "Adaptive"}]
	if both.PVEScore == nil || *both.PVEScore != 80 {
		t.Errorf("Auto Rifle/Adaptive PVEScore = %v, want 80", both.PVEScore)
	}
	if both.PVPScore == nil || *both.PVPScore != 60 {
		t.Errorf("Auto Rifle/Adaptive PVPScore = %v, want 60", both.PVPScore)
	}
	if both.Source != "PvE: pve-src; PvP: pvp-src" {
		t.Errorf("combined source = %q", both.Source)
	}

	pveOnly := byKey[ArchetypeKey{"Sword", "Caster"}]
	if pveOnly.PVEScore == nil || *pveOnly.PVEScore != 40 {
		t.Errorf("Sword/Caster PVEScore = %v, want 40", pveOnly.PVEScore)
	}
	if pveOnly.PVPScore != nil {
		t.Errorf("Sword/Caster PVPScore = %v, want nil (no PvP data)", pveOnly.PVPScore)
	}
	if pveOnly.Source != "PvE: pve-only-src" {
		t.Errorf("pve-only source = %q, want just the PvE attribution", pveOnly.Source)
	}

	pvpOnly := byKey[ArchetypeKey{"Bow", "Precision"}]
	if pvpOnly.PVEScore != nil {
		t.Errorf("Bow/Precision PVEScore = %v, want nil (no PvE data)", pvpOnly.PVEScore)
	}
}

func TestMergeArchetypeScores_SortsByWeaponTypeThenFrame(t *testing.T) {
	pve := map[ArchetypeKey]struct {
		Score  float64
		Source string
	}{
		{"Hand Cannon", "Precision"}: {Score: 1, Source: "s"},
		{"Hand Cannon", "Adaptive"}:  {Score: 1, Source: "s"},
		{"Auto Rifle", "Adaptive"}:   {Score: 1, Source: "s"},
	}
	got := MergeArchetypeScores(pve, nil)
	want := []ArchetypeKey{
		{"Auto Rifle", "Adaptive"},
		{"Hand Cannon", "Adaptive"},
		{"Hand Cannon", "Precision"},
	}
	if len(got) != len(want) {
		t.Fatalf("got %d rows, want %d", len(got), len(want))
	}
	for i, row := range got {
		if row.WeaponType != want[i].WeaponType || row.Frame != want[i].Frame {
			t.Errorf("[%d] = %s/%s, want %s/%s", i, row.WeaponType, row.Frame, want[i].WeaponType, want[i].Frame)
		}
	}
}

func TestMergeArchetypeScores_Empty(t *testing.T) {
	got := MergeArchetypeScores(nil, nil)
	if len(got) != 0 {
		t.Errorf("got %d rows, want 0", len(got))
	}
}

func TestJoinSources(t *testing.T) {
	tests := []struct {
		name string
		in   []string
		want string
	}{
		{"none", nil, ""},
		{"one", []string{"a"}, "a"},
		{"two", []string{"a", "b"}, "a; b"},
	}
	for _, tt := range tests {
		if got := joinSources(tt.in); got != tt.want {
			t.Errorf("%s: joinSources(%v) = %q, want %q", tt.name, tt.in, got, tt.want)
		}
	}
}
