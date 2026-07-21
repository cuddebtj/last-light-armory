// Command score recomputes every roll's PvE/PvP/overall score and each
// weapon's ranking, unconditionally, every run — see CLAUDE.md: unlike
// ingest, there's no external API to rate-limit and no expensive fetch, so
// there's no version-check gate to skip unchanged work.
//
// Usage:
//
//	score [-env PATH]
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

	"github.com/cuddebtj/last-light-armory/scoring/internal/config"
	"github.com/cuddebtj/last-light-armory/scoring/internal/db"
	"github.com/cuddebtj/last-light-armory/scoring/internal/scoring"
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

	weights, _, err := store.ScoringConfig(ctx)
	if err != nil {
		log.Error("reading scoring config", "error", err)
		return 1
	}
	weapons, err := store.Weapons(ctx)
	if err != nil {
		log.Error("reading weapons", "error", err)
		return 1
	}
	perkScores, err := store.PerkScores(ctx)
	if err != nil {
		log.Error("reading perk scores", "error", err)
		return 1
	}
	archetypes, err := store.ArchetypeScores(ctx)
	if err != nil {
		log.Error("reading archetype scores", "error", err)
		return 1
	}
	synergies, err := store.PerkSynergies(ctx)
	if err != nil {
		log.Error("reading perk synergies", "error", err)
		return 1
	}
	rolls, err := store.Rolls(ctx)
	if err != nil {
		log.Error("reading rolls", "error", err)
		return 1
	}
	rollPerks, err := store.RollPerks(ctx)
	if err != nil {
		log.Error("reading roll perks", "error", err)
		return 1
	}

	// weapon_id -> its best roll's scores so far ("best single roll
	// represents the weapon" — confirmed trade-off, see CLAUDE.md). Weapons
	// with zero rolls (a handful of them, per ingest's own data) simply
	// never get an entry and so never get a weapon_ranking row this run —
	// a known limitation, not handled here: a weapon that had rolls in a
	// past run and loses all of them in a future re-ingest would keep a
	// stale ranking rather than being cleaned up.
	rollUpdates := make([]db.RollScoreUpdate, 0, len(rolls))
	bestPerWeapon := make(map[int64]db.WeaponRankingUpdate, len(weapons))
	archetypeHits := 0

	for _, roll := range rolls {
		rps := rollPerks[roll.ID]
		perks := make([]scoring.PerkContribution, len(rps))
		perkIDs := make([]int64, len(rps))
		for i, rp := range rps {
			sc := perkScores[rp.PerkID]
			perks[i] = scoring.PerkContribution{ColumnIndex: rp.ColumnIndex, PVEScore: sc.PVE, PVPScore: sc.PVP}
			perkIDs[i] = rp.PerkID
		}

		weapon := weapons[roll.WeaponID]
		key := scoring.ArchetypeKey{WeaponType: weapon.WeaponType, Frame: scoring.NormalizeFrame(weapon.Frame)}
		var archPVE, archPVP *float64
		if base, ok := archetypes[key]; ok {
			archPVE, archPVP = base.PVE, base.PVP
			archetypeHits++
		}

		pve, pvp, overall := scoring.RollScore(perks, perkIDs, synergies, archPVE, archPVP, weights)
		rollUpdates = append(rollUpdates, db.RollScoreUpdate{RollID: roll.ID, PVE: pve, PVP: pvp, Overall: overall})

		if best, ok := bestPerWeapon[roll.WeaponID]; !ok || overall > best.Overall {
			bestPerWeapon[roll.WeaponID] = db.WeaponRankingUpdate{WeaponID: roll.WeaponID, PVE: pve, PVP: pvp, Overall: overall}
		}
	}

	rankings := make([]db.WeaponRankingUpdate, 0, len(bestPerWeapon))
	for _, r := range bestPerWeapon {
		rankings = append(rankings, r)
	}

	if err := store.WriteRollScores(ctx, rollUpdates); err != nil {
		log.Error("writing roll scores", "error", err)
		return 1
	}
	if err := store.WriteWeaponRankings(ctx, rankings); err != nil {
		log.Error("writing weapon rankings", "error", err)
		return 1
	}

	log.Info("scoring complete",
		"rolls_scored", len(rollUpdates),
		"weapons_ranked", len(rankings),
		"weapons_total", len(weapons),
		"rolls_with_archetype_match", archetypeHits)
	return 0
}
