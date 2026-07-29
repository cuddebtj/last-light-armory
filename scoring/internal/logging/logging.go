// Package logging sets up this job's structured logging: every run writes
// to both stdout (for `go run`/manual invocations, and for whatever
// captures a cron's own output) and a dedicated, timestamped file under a
// log directory, so a failed unattended run leaves a permanent, greppable
// record even if nobody was watching a terminal when it happened. Old run
// files are pruned on every Setup call, keeping the directory bounded
// without a separate cleanup job or a third-party rotation library — the
// same "database-driven, not code" preference for simple, inspectable
// mechanisms this repo already applies elsewhere, just for logs instead
// of scoring weights.
package logging

import (
	"fmt"
	"io"
	"log/slog"
	"os"
	"path/filepath"
	"time"
)

// DefaultRetention is how long a run's log file is kept before Setup
// prunes it. The ask this exists to satisfy is "if a run fails, I want
// logs to track when" — a bounded recent history, not an unbounded
// archive an operator has to remember to clean up.
const DefaultRetention = 72 * time.Hour

// logFileTimeLayout produces sortable, greppable filenames like
// 20260725-100000.log — lexical sort order matches chronological order,
// so a plain `ls` already lists runs oldest-to-newest.
const logFileTimeLayout = "20060102-150405"

// Setup creates logDir if needed, prunes any regular file directly inside
// it whose modification time is older than retention, opens a new
// timestamped file for this run, and returns a slog.Logger that writes
// every record to both stdout and that file.
//
// The returned close func must be called (typically via defer) once
// logging is no longer needed, to flush and release the file.
func Setup(logDir string, retention time.Duration) (*slog.Logger, func() error, error) {
	if err := os.MkdirAll(logDir, 0o755); err != nil {
		return nil, nil, fmt.Errorf("logging: creating log directory %s: %w", logDir, err)
	}

	if err := prune(logDir, retention); err != nil {
		return nil, nil, fmt.Errorf("logging: pruning old logs in %s: %w", logDir, err)
	}

	filename := time.Now().Format(logFileTimeLayout) + ".log"
	path := filepath.Join(logDir, filename)
	file, err := os.OpenFile(path, os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0o644)
	if err != nil {
		return nil, nil, fmt.Errorf("logging: opening log file %s: %w", path, err)
	}

	handler := slog.NewTextHandler(io.MultiWriter(os.Stdout, file), nil)
	return slog.New(handler), file.Close, nil
}

// prune removes every regular file directly inside dir whose modification
// time is older than retention ago. A file whose info can't be read is
// left alone rather than treated as fatal — a single unreadable entry
// shouldn't block this run from logging at all. The first removal error
// encountered, if any, is returned after attempting every entry.
func prune(dir string, retention time.Duration) error {
	entries, err := os.ReadDir(dir)
	if err != nil {
		return err
	}

	cutoff := time.Now().Add(-retention)
	var firstErr error
	for _, entry := range entries {
		if entry.IsDir() {
			continue
		}
		info, err := entry.Info()
		if err != nil {
			continue
		}
		if info.ModTime().Before(cutoff) {
			if err := os.Remove(filepath.Join(dir, entry.Name())); err != nil && firstErr == nil {
				firstErr = err
			}
		}
	}
	return firstErr
}
