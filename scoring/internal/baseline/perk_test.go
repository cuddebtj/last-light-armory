package baseline

import "testing"

func TestPVEPerkScores(t *testing.T) {
	rows := []PerkPVERow{
		{Perk: "Kill Clip", PVEScore: 90, BestTier: "S"},
		{Perk: "Zen Moment", PVEScore: 60, BestTier: "B"},
	}
	got := PVEPerkScores(rows)
	if got["Kill Clip"] != 90 {
		t.Errorf("Kill Clip = %d, want 90", got["Kill Clip"])
	}
	if got["Zen Moment"] != 60 {
		t.Errorf("Zen Moment = %d, want 60", got["Zen Moment"])
	}
	if _, ok := got["Rangefinder"]; ok {
		t.Error("unlisted perk should not appear in the map")
	}
}

func TestPVPPerkScores(t *testing.T) {
	tests := []struct {
		name       string
		multiplier float64
		want       int
	}{
		{"no effect (1.0x) is exactly neutral", 1.0, 50},
		{"strong multiplier scores above neutral", 2.0, 75},
		{"weak/negative multiplier scores below neutral", 0.5, 37},
		{"extreme multiplier clamps at 100", 5.0, 100},
		{"extreme low multiplier clamps at 0", -2.0, 0},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := PVPPerkScores([]PerkPVPRow{{Perk: "X", Multiplier: tt.multiplier}})
			if got["X"] != tt.want {
				t.Errorf("score(%v) = %d, want %d", tt.multiplier, got["X"], tt.want)
			}
		})
	}
}

func TestMergePerkScores(t *testing.T) {
	pve := map[string]int{"Kill Clip": 90}
	pvp := map[string]int{"Kill Clip": 70}

	t.Run("found in both", func(t *testing.T) {
		got := MergePerkScores("Kill Clip", pve, pvp)
		if got != (PerkScore{PVE: 90, PVP: 70}) {
			t.Errorf("got %+v", got)
		}
	})

	t.Run("found in neither falls back to neutral both sides", func(t *testing.T) {
		got := MergePerkScores("Unknown Perk", pve, pvp)
		if got != (PerkScore{PVE: NeutralPerkScore, PVP: NeutralPerkScore}) {
			t.Errorf("got %+v, want all-neutral", got)
		}
	})

	t.Run("found in PvE only", func(t *testing.T) {
		got := MergePerkScores("Kill Clip", pve, map[string]int{})
		if got != (PerkScore{PVE: 90, PVP: NeutralPerkScore}) {
			t.Errorf("got %+v", got)
		}
	})
}
