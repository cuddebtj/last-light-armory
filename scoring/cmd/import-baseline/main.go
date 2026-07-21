// Command import-baseline writes the archetype and perk baselines derived
// from the committed community measurement snapshots (scoring/data/*.json)
// into archetype_score and perk.pve_score/pvp_score.
//
// Unlike cmd/score, this is a one-off/rarely-rerun operation: the source
// data is a maintenance-mode game's final, static measurements, not a live
// feed. Rerun it only after re-extracting the snapshots (see
// scoring/data/README.md) — it always fully overwrites, so running it
// again with unchanged input is a safe no-op in effect (same values
// written back).
//
// Usage:
//
//	import-baseline [-env PATH]
//
// Exit codes: 0 success, 1 any failure.
package main

import (
	"context"
	"flag"
	"log/slog"
	"os"
	"os/signal"
	"syscall"

	"github.com/cuddebtj/last-light-armory/scoring/internal/baseline"
	"github.com/cuddebtj/last-light-armory/scoring/internal/config"
	"github.com/cuddebtj/last-light-armory/scoring/internal/db"
)

func main() {
	os.Exit(run())
}

func run() int {
	envFile := flag.String("env", ".env", "path to .env file (\"\" to rely on real environment only)")
	flag.Parse()

	log := slog.New(slog.NewTextHandler(os.Stderr, nil))

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	cfg, err := config.Load(*envFile)
	if err != nil {
		log.Error("configuration error", "error", err)
		return 1
	}

	snapshot, err := baseline.Load()
	if err != nil {
		log.Error("loading embedded baseline data", "error", err)
		return 1
	}

	// Safe to run before cmd/score ever has — this may be the first thing
	// that touches the database.
	if err := db.Migrate(cfg.DatabaseURL); err != nil {
		log.Error("migration error", "error", err)
		return 1
	}

	pool, err := db.Connect(ctx, cfg.DatabaseURL)
	if err != nil {
		log.Error("database connection error", "error", err)
		return 1
	}
	defer pool.Close()
	store := db.NewStore(pool)

	// --- Archetype base layer ---

	pve := baseline.NormalizePVEArchetypes(snapshot.ArchetypePVE)
	pvp := baseline.NormalizePVPArchetypes(snapshot.ArchetypePVP)
	archetypeRows := baseline.MergeArchetypeScores(pve, pvp)

	if err := store.UpsertArchetypeScores(ctx, archetypeRows); err != nil {
		log.Error("writing archetype scores", "error", err)
		return 1
	}
	log.Info("archetype base layer written",
		"archetypes", len(archetypeRows),
		"pve_sources", len(pve),
		"pvp_sources", len(pvp))

	// --- Perk layer (thin — see CLAUDE.md's hybrid-scoring section) ---

	names, err := store.PerkNames(ctx)
	if err != nil {
		log.Error("reading perk names", "error", err)
		return 1
	}

	pvePerks := baseline.PVEPerkScores(snapshot.PerkPVE)
	pvpPerks := baseline.PVPPerkScores(snapshot.PerkPVP)

	scores := make(map[int64]baseline.PerkScore, len(names))
	matchedPVE, matchedPVP := 0, 0
	for id, name := range names {
		sc := baseline.MergePerkScores(name, pvePerks, pvpPerks)
		scores[id] = sc
		if sc.PVE != baseline.NeutralPerkScore {
			matchedPVE++
		}
		if sc.PVP != baseline.NeutralPerkScore {
			matchedPVP++
		}
	}

	if err := store.UpdatePerkScores(ctx, scores); err != nil {
		log.Error("writing perk scores", "error", err)
		return 1
	}
	log.Info("perk layer written",
		"perks", len(scores),
		"pve_matched", matchedPVE,
		"pvp_matched", matchedPVP)

	return 0
}
