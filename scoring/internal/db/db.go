// Package db owns this job's interactions with the shared last_light_armory
// Postgres database: connection pooling, this repo's own schema migrations,
// and the repositories that read weapon/perk/roll identity data (owned by
// last-light-armory-ingest) and write the *_score columns and
// weapon_ranking (owned here).
package db

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/golang-migrate/migrate/v4"
	_ "github.com/golang-migrate/migrate/v4/database/pgx/v5" // registers the pgx5:// migrate driver
	"github.com/golang-migrate/migrate/v4/source/iofs"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/cuddebtj/last-light-armory/scoring/migrations"
)

// migrationsTable is deliberately distinct from golang-migrate's default
// ("schema_migrations"), which last-light-armory-ingest already uses
// against this same database — see CLAUDE.md's "Fix Needed Before the
// Scoring Job Runs Its First Migration".
const migrationsTable = "last_light_armory_scoring_migrations"

// Connect builds a pgx connection pool with conservative defaults suitable
// for a batch job: modest pool size, connect timeout, and a startup ping so
// a bad DATABASE_URL fails fast with a clear error.
func Connect(ctx context.Context, databaseURL string) (*pgxpool.Pool, error) {
	cfg, err := pgxpool.ParseConfig(databaseURL)
	if err != nil {
		// Deliberately not wrapping err: pgx echoes the URL, credentials
		// included, in its parse errors.
		return nil, errors.New("db: DATABASE_URL failed to parse (are special characters in the password percent-encoded?)")
	}
	cfg.MaxConns = 8
	cfg.MinConns = 1
	cfg.ConnConfig.ConnectTimeout = 10 * time.Second

	pool, err := pgxpool.NewWithConfig(ctx, cfg)
	if err != nil {
		return nil, fmt.Errorf("db: creating pool: %w", err)
	}
	pingCtx, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()
	if err := pool.Ping(pingCtx); err != nil {
		pool.Close()
		return nil, fmt.Errorf("db: pinging database: %w", err)
	}
	return pool, nil
}

// Migrate applies all pending embedded migrations. It is a no-op when the
// schema is already current, making it safe to run at every startup.
func Migrate(databaseURL string) error {
	src, err := iofs.New(migrations.FS, ".")
	if err != nil {
		return fmt.Errorf("db: loading embedded migrations: %w", err)
	}
	m, err := migrate.NewWithSourceInstance("iofs", src, pgx5URL(databaseURL))
	if err != nil {
		return fmt.Errorf("db: initializing migrator: %w", err)
	}
	defer m.Close()

	if err := m.Up(); err != nil && !errors.Is(err, migrate.ErrNoChange) {
		return fmt.Errorf("db: applying migrations: %w", err)
	}
	return nil
}

// MigrateDown rolls back every migration this repo owns. Exposed for
// integration tests; the scoring binary never calls it.
func MigrateDown(databaseURL string) error {
	src, err := iofs.New(migrations.FS, ".")
	if err != nil {
		return fmt.Errorf("db: loading embedded migrations: %w", err)
	}
	m, err := migrate.NewWithSourceInstance("iofs", src, pgx5URL(databaseURL))
	if err != nil {
		return fmt.Errorf("db: initializing migrator: %w", err)
	}
	defer m.Close()

	if err := m.Down(); err != nil && !errors.Is(err, migrate.ErrNoChange) {
		return fmt.Errorf("db: reverting migrations: %w", err)
	}
	return nil
}

// pgx5URL rewrites a postgres:// or postgresql:// URL to the pgx5:// scheme
// golang-migrate's pgx/v5 driver registers, and appends this repo's
// distinct x-migrations-table so it never collides with ingest's.
func pgx5URL(databaseURL string) string {
	url := databaseURL
	if rest, ok := strings.CutPrefix(url, "postgresql://"); ok {
		url = "pgx5://" + rest
	} else if rest, ok := strings.CutPrefix(url, "postgres://"); ok {
		url = "pgx5://" + rest
	}
	sep := "?"
	if strings.Contains(url, "?") {
		sep = "&"
	}
	return url + sep + "x-migrations-table=" + migrationsTable
}
