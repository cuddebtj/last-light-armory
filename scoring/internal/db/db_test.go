package db

import (
	"context"
	"strings"
	"testing"
	"time"
)

// refusedURL points at a port nothing listens on, for fast connection
// failures without any network dependency — mirrors last-light-armory-
// ingest's own db_test.go.
const refusedURL = "postgres://u:p@127.0.0.1:1/nope?connect_timeout=1"

func TestConnectRejectsUnparseableURL(t *testing.T) {
	_, err := Connect(context.Background(), "postgres://u:p@h:not-a-port/db")
	if err == nil {
		t.Fatal("want parse error")
	}
	// The error must not echo the URL (it can contain credentials).
	if strings.Contains(err.Error(), "not-a-port") {
		t.Errorf("error leaks URL contents: %v", err)
	}
	if !strings.Contains(err.Error(), "percent-encoded") {
		t.Errorf("error should hint at percent-encoding: %v", err)
	}
}

func TestConnectPingFailure(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	if _, err := Connect(ctx, refusedURL); err == nil {
		t.Fatal("want connection-refused error")
	}
}

func TestMigrateFailsOnUnreachableServer(t *testing.T) {
	if err := Migrate(refusedURL); err == nil {
		t.Fatal("want migration error against unreachable server")
	}
}

func TestMigrateDownFailsOnUnreachableServer(t *testing.T) {
	if err := MigrateDown(refusedURL); err == nil {
		t.Fatal("want migration error against unreachable server")
	}
}

func TestMigrateFailsOnUnknownScheme(t *testing.T) {
	if err := Migrate("mysql://u:p@h:3306/db"); err == nil {
		t.Fatal("want driver error for non-postgres scheme")
	}
	if err := MigrateDown("mysql://u:p@h:3306/db"); err == nil {
		t.Fatal("want driver error for non-postgres scheme")
	}
}

func TestPgx5URL(t *testing.T) {
	tests := []struct{ in, want string }{
		{"postgresql://u:p@h:5432/d", "pgx5://u:p@h:5432/d?x-migrations-table=" + migrationsTable},
		{"postgres://u:p@h/d", "pgx5://u:p@h/d?x-migrations-table=" + migrationsTable},
		{"pgx5://already", "pgx5://already?x-migrations-table=" + migrationsTable},
		{"mysql://other", "mysql://other?x-migrations-table=" + migrationsTable},
		{
			"postgres://u:p@h/d?sslmode=require",
			"pgx5://u:p@h/d?sslmode=require&x-migrations-table=" + migrationsTable,
		},
	}
	for _, tt := range tests {
		if got := pgx5URL(tt.in); got != tt.want {
			t.Errorf("pgx5URL(%q) = %q, want %q", tt.in, got, tt.want)
		}
	}
}
