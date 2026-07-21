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

	log.Info("scoring: schema up to date; scoring pipeline not yet implemented")
	return 0
}
