// Command export-config bakes scoring_config.json: the scoring formula's
// tunable inputs (column weights, base_blend), archetype-intrinsic base
// scores, and curated perk synergies, resolved to Bungie hashes. This is
// the last piece the website needs to compute a roll's score for an
// arbitrary perk combination client-side (see CLAUDE.md's "Ranking
// semantics for filtered results") — everything else (per-perk pve/pvp
// scores, a weapon's own columns) is already in ingest's own export.
//
// Read-only: unlike cmd/score and cmd/import-baseline, this command never
// writes to the database, so it does not run migrations on startup.
//
// Usage:
//
//	export-config [-env PATH] [-out DIR] [-log-dir DIR] [-log-retention DURATION]
//
// Every run writes structured logs to both stdout and a timestamped file
// under -log-dir (default logs/export-config), pruned automatically after
// -log-retention (default 72h) — see internal/logging.
//
// Exit codes: 0 success, 1 any failure.
package main

import (
	"context"
	"encoding/json"
	"flag"
	"os"
	"os/signal"
	"path/filepath"
	"sort"
	"syscall"

	"github.com/cuddebtj/last-light-armory/scoring/internal/config"
	"github.com/cuddebtj/last-light-armory/scoring/internal/db"
	"github.com/cuddebtj/last-light-armory/scoring/internal/logging"
)

// archetypeScoreOut is one archetype_score row, JSON-shaped for the
// website (weights.Column index order documented alongside the join key
// itself in scoring/internal/scoring/frame.go).
type archetypeScoreOut struct {
	WeaponType string   `json:"weapon_type"`
	Frame      string   `json:"frame"`
	PVEScore   *float64 `json:"pve_score"`
	PVPScore   *float64 `json:"pvp_score"`
}

// perkSynergyOut is one curated perk_synergy row, resolved to hashes.
type perkSynergyOut struct {
	PerkAHash int64   `json:"perk_a_hash"`
	PerkBHash int64   `json:"perk_b_hash"`
	PVEBonus  float64 `json:"pve_bonus"`
	PVPBonus  float64 `json:"pvp_bonus"`
}

// configExport is the full scoring_config.json shape. Weights[i]
// corresponds to weapon_perk.column_index i (0=barrel, 1=magazine,
// 2=trait1, 3=trait2, 4=origin trait) — the same convention
// scoring.Weights.Column itself documents.
type configExport struct {
	Weights         [5]float64          `json:"weights"`
	BaseBlend       float64             `json:"base_blend"`
	ArchetypeScores []archetypeScoreOut `json:"archetype_scores"`
	PerkSynergies   []perkSynergyOut    `json:"perk_synergies"`
}

func main() {
	os.Exit(run())
}

func run() int {
	envFile := flag.String("env", ".env", "path to .env file (\"\" to rely on real environment only)")
	outDir := flag.String("out", "export", "directory to write scoring_config.json into")
	logDir := flag.String("log-dir", "logs/export-config", "directory for this run's log file (old ones pruned automatically, see -log-retention)")
	logRetention := flag.Duration("log-retention", logging.DefaultRetention, "how long to keep old log files before they're pruned")
	flag.Parse()

	log, closeLog, err := logging.Setup(*logDir, *logRetention)
	if err != nil {
		os.Stderr.WriteString("logging setup error: " + err.Error() + "\n")
		return 1
	}
	defer closeLog()

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	cfg, err := config.Load(*envFile)
	if err != nil {
		log.Error("configuration error", "error", err)
		return 1
	}

	pool, err := db.Connect(ctx, cfg.DatabaseURL)
	if err != nil {
		log.Error("database connection error", "error", err)
		return 1
	}
	defer pool.Close()
	store := db.NewStore(pool)

	weights, _, err := store.ScoringConfig(ctx)
	if err != nil {
		log.Error("reading scoring config", "error", err)
		return 1
	}
	archetypes, err := store.ArchetypeScores(ctx)
	if err != nil {
		log.Error("reading archetype scores", "error", err)
		return 1
	}
	synergies, err := store.PerkSynergiesByHash(ctx)
	if err != nil {
		log.Error("reading perk synergies", "error", err)
		return 1
	}

	archetypeOut := make([]archetypeScoreOut, 0, len(archetypes))
	for key, base := range archetypes {
		archetypeOut = append(archetypeOut, archetypeScoreOut{
			WeaponType: key.WeaponType, Frame: key.Frame, PVEScore: base.PVE, PVPScore: base.PVP,
		})
	}
	// ArchetypeScores returns a map; sort for byte-stable, diff-friendly output.
	sort.Slice(archetypeOut, func(i, j int) bool {
		if archetypeOut[i].WeaponType != archetypeOut[j].WeaponType {
			return archetypeOut[i].WeaponType < archetypeOut[j].WeaponType
		}
		return archetypeOut[i].Frame < archetypeOut[j].Frame
	})

	synergyOut := make([]perkSynergyOut, 0, len(synergies))
	for _, s := range synergies {
		synergyOut = append(synergyOut, perkSynergyOut{
			PerkAHash: s.PerkAHash, PerkBHash: s.PerkBHash, PVEBonus: s.PVEBonus, PVPBonus: s.PVPBonus,
		})
	}

	out := configExport{
		Weights:         weights.Column,
		BaseBlend:       weights.BaseBlend,
		ArchetypeScores: archetypeOut,
		PerkSynergies:   synergyOut,
	}

	if err := os.MkdirAll(*outDir, 0o755); err != nil {
		log.Error("creating output directory", "error", err)
		return 1
	}
	data, err := json.MarshalIndent(out, "", "  ")
	if err != nil {
		log.Error("marshaling scoring config", "error", err)
		return 1
	}
	path := filepath.Join(*outDir, "scoring_config.json")
	if err := os.WriteFile(path, append(data, '\n'), 0o644); err != nil {
		log.Error("writing scoring config", "error", err)
		return 1
	}

	log.Info("scoring config exported",
		"path", path,
		"archetype_rows", len(archetypeOut),
		"perk_synergies", len(synergyOut))
	return 0
}
