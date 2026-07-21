// Package baseline turns the committed community measurement snapshots
// (scoring/data/*.json — see scoring/data/README.md for provenance and
// extraction methodology) into archetype_score and perk.pve_score/
// pvp_score values. It's a one-off/rarely-rerun import, deliberately
// separate from cmd/score's every-run recompute: these numbers come from
// a maintenance-mode game's final, static community measurements, not a
// live feed (see CLAUDE.md's hybrid-scoring section).
//
// Every function here is pure (no I/O) so the normalization math is
// directly unit-testable; cmd/import-baseline owns reading the embedded
// JSON and writing to Postgres.
package baseline

import (
	"encoding/json"
	"fmt"
	"io/fs"

	"github.com/cuddebtj/last-light-armory/scoring/data"
)

// ArchetypePVERow is one row of data/archetype_pve.json.
type ArchetypePVERow struct {
	WeaponType   string   `json:"weapon_type"`
	Frame        string   `json:"frame"`
	TrueDPS      *float64 `json:"true_dps"`
	SustainedDPS float64  `json:"sustained_dps"`
	Scale        string   `json:"scale"`
	Source       string   `json:"source"`
}

// ArchetypePVPRow is one row of data/archetype_pvp.json.
type ArchetypePVPRow struct {
	WeaponType string  `json:"weapon_type"`
	Frame      string  `json:"frame"`
	Ammo       string  `json:"ammo"`
	OptimalTtK float64 `json:"optimal_ttk_s"`
	CritPct    string  `json:"crit_pct"`
	Source     string  `json:"source"`
}

// PerkPVERow is one row of data/perk_pve.json.
type PerkPVERow struct {
	Perk          string `json:"perk"`
	PVEScore      int    `json:"pve_score"`
	BestTier      string `json:"best_tier"`
	ExampleWeapon string `json:"example_weapon"`
	Source        string `json:"source"`
}

// PerkPVPRow is one row of data/perk_pvp.json.
type PerkPVPRow struct {
	Perk       string  `json:"perk"`
	Multiplier float64 `json:"multiplier"`
	Source     string  `json:"source"`
}

// Snapshot holds every embedded measurement file, decoded.
type Snapshot struct {
	ArchetypePVE []ArchetypePVERow
	ArchetypePVP []ArchetypePVPRow
	PerkPVE      []PerkPVERow
	PerkPVP      []PerkPVPRow
}

// Load decodes the embedded JSON snapshots from scoring/data/.
func Load() (Snapshot, error) {
	return loadFrom(data.FS)
}

// loadFrom is Load's actual logic, parameterized over the filesystem so
// tests can exercise each early-return branch with a deliberately
// incomplete fs.FS instead of only ever seeing the real, always-complete
// embedded data succeed.
func loadFrom(fsys fs.FS) (Snapshot, error) {
	var s Snapshot
	if err := decode(fsys, "archetype_pve.json", &s.ArchetypePVE); err != nil {
		return s, err
	}
	if err := decode(fsys, "archetype_pvp.json", &s.ArchetypePVP); err != nil {
		return s, err
	}
	if err := decode(fsys, "perk_pve.json", &s.PerkPVE); err != nil {
		return s, err
	}
	if err := decode(fsys, "perk_pvp.json", &s.PerkPVP); err != nil {
		return s, err
	}
	return s, nil
}

func decode(fsys fs.FS, name string, v any) error {
	b, err := fs.ReadFile(fsys, name)
	if err != nil {
		return fmt.Errorf("baseline: reading embedded %s: %w", name, err)
	}
	if err := json.Unmarshal(b, v); err != nil {
		return fmt.Errorf("baseline: parsing %s: %w", name, err)
	}
	return nil
}
