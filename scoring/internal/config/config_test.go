package config

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// writeEnvFile writes contents to a temp .env file and returns its path.
func writeEnvFile(t *testing.T, contents string) string {
	t.Helper()
	path := filepath.Join(t.TempDir(), ".env")
	if err := os.WriteFile(path, []byte(contents), 0o600); err != nil {
		t.Fatalf("writing temp .env: %v", err)
	}
	return path
}

// clearEnv unsets the config variables for the duration of a test.
func clearEnv(t *testing.T) {
	t.Helper()
	t.Setenv("DATABASE_URL", "")
	os.Unsetenv("DATABASE_URL")
}

func TestLoadHappyPath(t *testing.T) {
	clearEnv(t)
	path := writeEnvFile(t, `
# comment line

export DATABASE_URL="postgresql://user:p%40ss@db.example.com:5432/armory"
`)

	cfg, err := Load(path)
	if err != nil {
		t.Fatalf("Load: %v", err)
	}
	if !strings.HasPrefix(cfg.DatabaseURL, "postgresql://") {
		t.Errorf("DatabaseURL = %q, want postgresql:// prefix", cfg.DatabaseURL)
	}
}

func TestLoadRealEnvWinsOverFile(t *testing.T) {
	clearEnv(t)
	t.Setenv("DATABASE_URL", "postgres://u:p@host:5432/db")
	path := writeEnvFile(t, "DATABASE_URL=postgres://file:file@filehost:5432/filedb\n")

	cfg, err := Load(path)
	if err != nil {
		t.Fatalf("Load: %v", err)
	}
	if cfg.DatabaseURL != "postgres://u:p@host:5432/db" {
		t.Errorf("DatabaseURL = %q, want the real-environment value (environment must win over file)", cfg.DatabaseURL)
	}
}

func TestLoadMissingFileIsFine(t *testing.T) {
	clearEnv(t)
	t.Setenv("DATABASE_URL", "postgres://u:p@h:5432/d")

	if _, err := Load(filepath.Join(t.TempDir(), "nope.env")); err != nil {
		t.Fatalf("Load with absent file: %v", err)
	}
}

func TestLoadSkipsFileWhenPathEmpty(t *testing.T) {
	clearEnv(t)
	t.Setenv("DATABASE_URL", "postgres://u:p@h:5432/d")

	if _, err := Load(""); err != nil {
		t.Fatalf("Load(\"\"): %v", err)
	}
}

func TestLoadValidationErrors(t *testing.T) {
	tests := []struct {
		name    string
		dbURL   string
		wantSub string
	}{
		{"missing db url", "", "DATABASE_URL"},
		{"wrong scheme", "mysql://u:p@h:3306/d", "scheme"},
		{"no host", "postgres://", "no host"},
		// A literal '/' in the password truncates the URL authority, making
		// the apparent port non-numeric; url.Parse rejects it and the error
		// carries the percent-encoding hint.
		{"unencoded password breaks port", "postgres://u:pa/ss@h:5432/d", "percent-encoded"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			clearEnv(t)
			if tt.dbURL != "" {
				t.Setenv("DATABASE_URL", tt.dbURL)
			}
			_, err := Load("")
			if err == nil {
				t.Fatal("Load: want error, got nil")
			}
			if !strings.Contains(err.Error(), tt.wantSub) {
				t.Errorf("error %q does not mention %q", err, tt.wantSub)
			}
		})
	}
}

func TestLoadMalformedEnvFile(t *testing.T) {
	tests := []struct {
		name     string
		contents string
	}{
		{"no equals sign", "JUSTAWORD\n"},
		{"empty key", "=value\n"},
		{"space in key", "BAD KEY=value\n"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			clearEnv(t)
			path := writeEnvFile(t, tt.contents)
			if _, err := Load(path); err == nil {
				t.Fatal("Load: want parse error, got nil")
			}
		})
	}
}

func TestUnquote(t *testing.T) {
	tests := []struct {
		in, want string
	}{
		{`"quoted"`, "quoted"},
		{`'single'`, "single"},
		{`bare`, "bare"},
		{`"mismatched'`, `"mismatched'`},
		{`""`, ""},
		{`"`, `"`},
		{``, ``},
	}
	for _, tt := range tests {
		if got := unquote(tt.in); got != tt.want {
			t.Errorf("unquote(%q) = %q, want %q", tt.in, got, tt.want)
		}
	}
}
