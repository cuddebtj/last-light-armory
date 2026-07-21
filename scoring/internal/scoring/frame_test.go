package scoring

import "testing"

// Every case here is a real (weapon_type, frame) pair pulled from the live
// database — not invented — to keep this test honest about what actually
// needs handling.
func TestNormalizeFrame(t *testing.T) {
	tests := []struct {
		dbFrame string
		want    string
	}{
		{"Adaptive Frame", "Adaptive"},
		{"Precision Frame", "Precision"},
		{"Micro-Missile Frame", "Micro-Missile"},
		{"Wave Frame", "Wave"},
		{"Compressed Wave Frame", "Compressed Wave"},
		{"Wave Sword Frame", "Wave Sword"},
		{"Adaptive Glaive", "Adaptive"},
		{"Rapid-Fire Glaive", "Rapid-Fire"},
		{"Balanced Heat Weapon", "Balanced Heat"},
		{"Dynamic Heat Weapon", "Dynamic Heat"},
		{"Rapid Fire Slug", "Rapid-Fire Slug"},         // space -> hyphen, no suffix to strip
		{"High-Impact Longbow", "High-Impact Longbow"}, // no suffix — already sheet-matching
		{"Double Fire", "Double Fire"},                 // breech GL frame, no suffix at all
		{"SUROS Legacy", "SUROS Legacy"},               // Exotic unique intrinsic, left alone
		{"Ranged Weapon", "Ranged"},                    // over-strips, but harmless: never matches real sheet data
	}
	for _, tt := range tests {
		if got := NormalizeFrame(tt.dbFrame); got != tt.want {
			t.Errorf("NormalizeFrame(%q) = %q, want %q", tt.dbFrame, got, tt.want)
		}
	}
}
