package baseline

import (
	"strings"
	"testing"
	"testing/fstest"
)

func TestDecodeErrors(t *testing.T) {
	fsys := fstest.MapFS{
		"archetype_pve.json": {Data: []byte("not valid json")},
	}

	var v []ArchetypePVERow
	if err := decode(fsys, "does-not-exist.json", &v); err == nil {
		t.Error("decode with a missing file: want error, got nil")
	} else if !strings.Contains(err.Error(), "reading embedded") {
		t.Errorf("error %q does not mention the read failure", err)
	}

	if err := decode(fsys, "archetype_pve.json", &v); err == nil {
		t.Error("decode with malformed JSON: want error, got nil")
	} else if !strings.Contains(err.Error(), "parsing") {
		t.Errorf("error %q does not mention the parse failure", err)
	}
}

// loadFrom is tested against deliberately incomplete filesystems so each
// of Load's four sequential early-return branches is actually exercised —
// the real embedded data always has all four files, so Load() alone would
// only ever prove the happy path.
func TestLoadFrom_EachFileMissingReturnsItsOwnError(t *testing.T) {
	full := fstest.MapFS{
		"archetype_pve.json": {Data: []byte(`[]`)},
		"archetype_pvp.json": {Data: []byte(`[]`)},
		"perk_pve.json":      {Data: []byte(`[]`)},
		"perk_pvp.json":      {Data: []byte(`[]`)},
	}

	for _, missing := range []string{
		"archetype_pve.json", "archetype_pvp.json", "perk_pve.json", "perk_pvp.json",
	} {
		t.Run("missing "+missing, func(t *testing.T) {
			fsys := fstest.MapFS{}
			for name, f := range full {
				if name != missing {
					fsys[name] = f
				}
			}
			if _, err := loadFrom(fsys); err == nil {
				t.Fatalf("loadFrom with %s missing: want error, got nil", missing)
			} else if !strings.Contains(err.Error(), missing) {
				t.Errorf("error %q does not name the missing file %s", err, missing)
			}
		})
	}

	if _, err := loadFrom(full); err != nil {
		t.Errorf("loadFrom with all files present: want success, got %v", err)
	}
}

// Load reads the real committed snapshots (scoring/data/*.json) — this is
// the same kind of committed-export coupling as web/lib/data.test.ts: a
// future re-extraction that changes these counts is the expected reason
// this test needs updating, not a mystery flake.
func TestLoad(t *testing.T) {
	s, err := Load()
	if err != nil {
		t.Fatalf("Load: %v", err)
	}

	if len(s.ArchetypePVE) == 0 {
		t.Error("ArchetypePVE is empty")
	}
	if len(s.ArchetypePVP) == 0 {
		t.Error("ArchetypePVP is empty")
	}
	if len(s.PerkPVE) == 0 {
		t.Error("PerkPVE is empty")
	}
	if len(s.PerkPVP) == 0 {
		t.Error("PerkPVP is empty")
	}

	for _, r := range s.ArchetypePVE {
		if r.WeaponType == "" || r.Frame == "" {
			t.Errorf("ArchetypePVE row missing weapon_type/frame: %+v", r)
		}
		if r.Scale != "tab" && r.Scale != "all_weapons_power" {
			t.Errorf("ArchetypePVE row has unexpected scale %q: %+v", r.Scale, r)
		}
	}
	for _, r := range s.PerkPVE {
		if r.Perk == "" {
			t.Errorf("PerkPVE row missing perk name: %+v", r)
		}
		if r.PVEScore < 0 || r.PVEScore > 100 {
			t.Errorf("PerkPVE %q score %d out of 0-100 range", r.Perk, r.PVEScore)
		}
	}
}
