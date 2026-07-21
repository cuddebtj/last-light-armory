//go:build integration

// Integration tests against a real Postgres server (the shared dev
// instance, per CLAUDE.md — mirrors last-light-armory-ingest's own
// integration_test.go pattern). Each run isolates itself in a throwaway
// schema selected via search_path, dropped on cleanup; real data in
// `public` (including ingest's live weapon/perk/roll rows) is never
// touched.
//
// Unlike ingest, this repo's own migrations are NOT self-contained: they
// create foreign keys against perk(id) and roll(id), tables ingest owns.
// search_path = "it_xxx,public" lets that resolve correctly without
// duplicating ingest's schema here: CREATE TABLE with no explicit schema
// lands in the throwaway schema (first in path), while an unqualified
// REFERENCES perk(id) falls through to the real, shared public.perk —
// exactly how it resolves in production, which is worth proving here
// rather than assuming.
//
// Run with:
//
//	go test -tags integration ./internal/db/
//
// Connection comes from TEST_DATABASE_URL, falling back to DATABASE_URL
// (loaded from the repo .env when present). Tests skip when neither is set.
package db_test

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"net/url"
	"os"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/cuddebtj/last-light-armory/scoring/internal/baseline"
	"github.com/cuddebtj/last-light-armory/scoring/internal/config"
	"github.com/cuddebtj/last-light-armory/scoring/internal/db"
)

type testEnv struct {
	pool   *pgxpool.Pool
	url    string
	schema string
	store  *db.Store
}

func baseURL(t *testing.T) string {
	t.Helper()
	_, _ = config.Load("../../.env")
	if u := os.Getenv("TEST_DATABASE_URL"); u != "" {
		return u
	}
	if u := os.Getenv("DATABASE_URL"); u != "" {
		return u
	}
	t.Skip("integration tests need TEST_DATABASE_URL or DATABASE_URL")
	return ""
}

// scopedURL pins search_path to "schema,public" — new objects land in
// schema; unqualified references that don't exist there (perk, roll) fall
// through to the real public tables.
func scopedURL(t *testing.T, base, schema string) string {
	t.Helper()
	u, err := url.Parse(base)
	if err != nil {
		t.Fatalf("parsing database URL: %v", err)
	}
	q := u.Query()
	q.Set("options", "-csearch_path="+schema+",public")
	u.RawQuery = q.Encode()
	return u.String()
}

func setup(t *testing.T) *testEnv {
	t.Helper()
	ctx := context.Background()
	base := baseURL(t)

	buf := make([]byte, 4)
	if _, err := rand.Read(buf); err != nil {
		t.Fatalf("random schema suffix: %v", err)
	}
	schema := fmt.Sprintf("it_%d_%s", time.Now().Unix(), hex.EncodeToString(buf))

	admin, err := db.Connect(ctx, base)
	if err != nil {
		t.Fatalf("connecting (admin): %v", err)
	}
	if _, err := admin.Exec(ctx, "CREATE SCHEMA "+schema); err != nil {
		admin.Close()
		t.Fatalf("creating schema %s: %v", schema, err)
	}
	t.Cleanup(func() {
		_, _ = admin.Exec(context.Background(), "DROP SCHEMA "+schema+" CASCADE")
		admin.Close()
	})

	scoped := scopedURL(t, base, schema)
	if err := db.Migrate(scoped); err != nil {
		t.Fatalf("migrating schema %s: %v", schema, err)
	}

	pool, err := db.Connect(ctx, scoped)
	if err != nil {
		t.Fatalf("connecting (scoped): %v", err)
	}
	t.Cleanup(pool.Close)

	return &testEnv{pool: pool, url: scoped, schema: schema, store: db.NewStore(pool)}
}

func TestMigrateUpAndDown(t *testing.T) {
	env := setup(t)
	ctx := context.Background()

	for _, table := range []string{"scoring_config", "archetype_score", "perk_synergy", "tier_cutoff", "roll_variant"} {
		var one int
		err := env.pool.QueryRow(ctx, "SELECT 1 FROM "+table+" LIMIT 1").Scan(&one)
		if err != nil && err.Error() != "no rows in result set" {
			t.Errorf("table %s not queryable: %v", table, err)
		}
	}

	// scoring_config and tier_cutoff are seeded by the migration itself.
	var configCount, tierCount int
	if err := env.pool.QueryRow(ctx, "SELECT count(*) FROM scoring_config").Scan(&configCount); err != nil {
		t.Fatalf("counting scoring_config: %v", err)
	}
	if configCount != 1 {
		t.Errorf("scoring_config has %d rows, want 1 (seeded)", configCount)
	}
	if err := env.pool.QueryRow(ctx, "SELECT count(*) FROM tier_cutoff").Scan(&tierCount); err != nil {
		t.Fatalf("counting tier_cutoff: %v", err)
	}
	if tierCount != 5 {
		t.Errorf("tier_cutoff has %d rows, want 5 (seeded)", tierCount)
	}

	// The FK on perk_synergy/roll_variant must resolve to the REAL,
	// shared public.perk — not fail, and not create a shadow perk table
	// in the throwaway schema.
	var realPerkCount int
	if err := env.pool.QueryRow(ctx, "SELECT count(*) FROM public.perk").Scan(&realPerkCount); err != nil {
		t.Fatalf("counting public.perk: %v", err)
	}
	if realPerkCount == 0 {
		t.Skip("public.perk is empty in this environment; ingest hasn't run — FK resolution can't be meaningfully checked")
	}

	if err := db.MigrateDown(env.url); err != nil {
		t.Fatalf("MigrateDown: %v", err)
	}
	var count int
	err := env.pool.QueryRow(ctx, `
		SELECT count(*) FROM information_schema.tables
		WHERE table_schema = $1 AND table_name = 'archetype_score'`, env.schema).Scan(&count)
	if err != nil {
		t.Fatalf("checking dropped tables: %v", err)
	}
	if count != 0 {
		t.Error("archetype_score table still exists after MigrateDown")
	}

	// Ingest's real, shared migrations table must be completely untouched
	// by any of this — the whole point of the distinct table name. Only
	// checkable where ingest's own migrations have actually run (the real
	// shared database); a from-scratch environment (CI's throwaway
	// Postgres) has no public.schema_migrations at all, same reason the
	// public.perk check above skips rather than asserting.
	var ingestVersion int
	err = env.pool.QueryRow(ctx, "SELECT version FROM public.schema_migrations").Scan(&ingestVersion)
	var pgErr *pgconn.PgError
	if errors.As(err, &pgErr) && pgErr.Code == "42P01" {
		t.Skip("public.schema_migrations doesn't exist in this environment; ingest hasn't run here")
	}
	if err != nil {
		t.Fatalf("reading ingest's schema_migrations: %v", err)
	}
	if ingestVersion == 0 {
		t.Error("ingest's schema_migrations version is 0 — looks disturbed")
	}
}

func TestUpsertArchetypeScoresIntegration(t *testing.T) {
	env := setup(t)
	ctx := context.Background()

	pve := 85.5
	pvp := 40.0
	rows := []baseline.ArchetypeScore{
		{WeaponType: "Auto Rifle", Frame: "Adaptive", PVEScore: &pve, PVPScore: &pvp, Source: "test"},
		{WeaponType: "Sword", Frame: "Caster", PVEScore: nil, PVPScore: nil, Source: "no-data"},
	}
	if err := env.store.UpsertArchetypeScores(ctx, rows); err != nil {
		t.Fatalf("UpsertArchetypeScores: %v", err)
	}

	var gotPVE, gotPVP float64
	err := env.pool.QueryRow(ctx,
		"SELECT pve_score, pvp_score FROM archetype_score WHERE weapon_type = $1 AND frame = $2",
		"Auto Rifle", "Adaptive").Scan(&gotPVE, &gotPVP)
	if err != nil {
		t.Fatalf("reading back: %v", err)
	}
	if gotPVE != pve || gotPVP != pvp {
		t.Errorf("got (%v, %v), want (%v, %v)", gotPVE, gotPVP, pve, pvp)
	}

	// Rerunning with a changed value overwrites, not duplicates — the
	// whole point of ON CONFLICT DO UPDATE.
	updated := 99.0
	err = env.store.UpsertArchetypeScores(ctx, []baseline.ArchetypeScore{
		{WeaponType: "Auto Rifle", Frame: "Adaptive", PVEScore: &updated, Source: "test-2"},
	})
	if err != nil {
		t.Fatalf("re-upsert: %v", err)
	}
	var count int
	var reread float64
	if err := env.pool.QueryRow(ctx,
		"SELECT count(*), max(pve_score) FROM archetype_score WHERE weapon_type = $1 AND frame = $2",
		"Auto Rifle", "Adaptive").Scan(&count, &reread); err != nil {
		t.Fatalf("re-reading: %v", err)
	}
	if count != 1 {
		t.Errorf("row count = %d, want 1 (upsert, not insert)", count)
	}
	if reread != updated {
		t.Errorf("pve_score = %v, want %v (overwritten)", reread, updated)
	}
}

// TestPerkScoresIntegration exercises PerkNames/UpdatePerkScores against a
// real round-trip without ever touching ingest's real, shared public.perk
// data: a minimal fake perk table in the throwaway schema shadows the real
// one via search_path (schema,public resolves unqualified "perk" to the
// first match), so real production rows are never at risk.
func TestPerkScoresIntegration(t *testing.T) {
	env := setup(t)
	ctx := context.Background()

	_, err := env.pool.Exec(ctx, `
		CREATE TABLE perk (
			id BIGSERIAL PRIMARY KEY,
			name TEXT NOT NULL,
			pve_score SMALLINT,
			pvp_score SMALLINT,
			updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
		)`)
	if err != nil {
		t.Fatalf("creating shadow perk table: %v", err)
	}
	var id1, id2 int64
	if err := env.pool.QueryRow(ctx, "INSERT INTO perk (name) VALUES ('Kill Clip') RETURNING id").Scan(&id1); err != nil {
		t.Fatalf("seeding perk 1: %v", err)
	}
	if err := env.pool.QueryRow(ctx, "INSERT INTO perk (name) VALUES ('Zen Moment') RETURNING id").Scan(&id2); err != nil {
		t.Fatalf("seeding perk 2: %v", err)
	}

	names, err := env.store.PerkNames(ctx)
	if err != nil {
		t.Fatalf("PerkNames: %v", err)
	}
	if names[id1] != "Kill Clip" || names[id2] != "Zen Moment" {
		t.Errorf("got %v", names)
	}

	err = env.store.UpdatePerkScores(ctx, map[int64]baseline.PerkScore{
		id1: {PVE: 90, PVP: 70},
		id2: {PVE: 50, PVP: 50},
	})
	if err != nil {
		t.Fatalf("UpdatePerkScores: %v", err)
	}

	var pve, pvp int
	if err := env.pool.QueryRow(ctx, "SELECT pve_score, pvp_score FROM perk WHERE id = $1", id1).Scan(&pve, &pvp); err != nil {
		t.Fatalf("reading back: %v", err)
	}
	if pve != 90 || pvp != 70 {
		t.Errorf("got (%d, %d), want (90, 70)", pve, pvp)
	}
}
